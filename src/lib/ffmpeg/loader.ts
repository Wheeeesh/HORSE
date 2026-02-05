/**
 * FFmpeg Loader
 *
 * Manages lazy loading of FFmpeg.wasm via @ffmpeg/ffmpeg.
 * Provides a clean API for:
 * - Loading FFmpeg with basic progress updates
 * - Running transcode jobs
 * - Cancellation support via AbortSignal (best-effort)
 * - Resource cleanup
 */

import type {
  FFmpegLoadState,
  FFmpegLoadProgress,
  FFmpegOperationProgress,
  FFmpegJobConfig,
  FFmpegJobResult,
} from './types'
import { checkFFmpegCapabilities } from './capabilities'

/**
 * Callback types
 */
export type LoadProgressCallback = (progress: FFmpegLoadProgress) => void
export type OperationProgressCallback = (progress: FFmpegOperationProgress) => void
export type LogCallback = (level: 'info' | 'warn' | 'error', message: string) => void

type FFmpegModule = typeof import('@ffmpeg/ffmpeg')
type UtilModule = typeof import('@ffmpeg/util')

type FFmpegClass = FFmpegModule['FFmpeg']
type FFmpegInstance = InstanceType<FFmpegClass>

type FFmpegProgressEvent = { progress?: number; ratio?: number; time?: number }

type FFmpegLogEvent = { type?: string; message?: string }

let ffmpegModulePromise: Promise<FFmpegModule> | null = null
let utilModulePromise: Promise<UtilModule> | null = null

async function getFFmpegClass(): Promise<FFmpegClass> {
  if (!ffmpegModulePromise) {
    ffmpegModulePromise = import('@ffmpeg/ffmpeg')
  }
  const mod = await ffmpegModulePromise
  return mod.FFmpeg
}

async function getFetchFile(): Promise<UtilModule['fetchFile']> {
  if (!utilModulePromise) {
    utilModulePromise = import('@ffmpeg/util')
  }
  const mod = await utilModulePromise
  return mod.fetchFile
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getBaseUrl(): string {
  const base = import.meta.env?.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function getCoreUrls() {
  const base = getBaseUrl()
  return {
    coreURL: `${base}ffmpeg/ffmpeg-core.js`,
    wasmURL: `${base}ffmpeg/ffmpeg-core.wasm`,
    workerURL: `${base}ffmpeg/ffmpeg-core.worker.js`,
  }
}

/**
 * FFmpeg Loader Class
 */
export class FFmpegLoader {
  private ffmpeg: FFmpegInstance | null = null
  private state: FFmpegLoadState = 'idle'
  private loadPromise: Promise<void> | null = null
  private onLog: LogCallback | null = null
  private isRunning = false
  private logListenerAttached = false

  /**
   * Get current load state
   */
  getState(): FFmpegLoadState {
    return this.state
  }

  /**
   * Check if FFmpeg is loaded and ready
   */
  isReady(): boolean {
    return this.state === 'ready'
  }

  /**
   * Set log callback
   */
  setLogCallback(callback: LogCallback | null): void {
    this.onLog = callback
  }

  private async ensureInstance(): Promise<FFmpegInstance> {
    if (!this.ffmpeg) {
      const FFmpeg = await getFFmpegClass()
      this.ffmpeg = new FFmpeg()
    }
    return this.ffmpeg
  }

  private attachLogListener(): void {
    if (!this.ffmpeg || this.logListenerAttached) return

    const ffmpegAny = this.ffmpeg as unknown as {
      on?: (event: string, handler: (data: FFmpegLogEvent) => void) => void
    }

    if (typeof ffmpegAny.on === 'function') {
      ffmpegAny.on('log', ({ type, message }) => {
        if (!message) return
        const level = type === 'fferr' ? 'error' : 'info'
        this.onLog?.(level, message)
      })
      this.logListenerAttached = true
    }
  }

  private terminateInstance(): void {
    if (!this.ffmpeg) return

    const ffmpegAny = this.ffmpeg as unknown as {
      terminate?: () => void
      exit?: () => void
    }

    if (typeof ffmpegAny.terminate === 'function') {
      ffmpegAny.terminate()
    } else if (typeof ffmpegAny.exit === 'function') {
      ffmpegAny.exit()
    }

    this.ffmpeg = null
    this.state = 'idle'
    this.loadPromise = null
    this.logListenerAttached = false
  }

  /**
   * Load FFmpeg.wasm lazily
   * Returns immediately if already loaded
   */
  async load(onProgress?: LoadProgressCallback): Promise<void> {
    if (this.state === 'ready') {
      onProgress?.({ stage: 'Ready', percent: 100 })
      return
    }

    if (this.state === 'loading' && this.loadPromise) {
      return this.loadPromise
    }

    const capabilities = checkFFmpegCapabilities()
    if (!capabilities.canRun) {
      this.state = 'unsupported'
      throw new Error(
        'FFmpeg is not supported in this browser. ' +
          capabilities.warnings.join(' ')
      )
    }

    if (capabilities.warnings.length > 0) {
      this.onLog?.('warn', capabilities.warnings.join(' '))
    }

    this.state = 'loading'

    this.loadPromise = (async () => {
      try {
        const ffmpeg = await this.ensureInstance()
        this.attachLogListener()

        onProgress?.({ stage: 'Loading FFmpeg core', percent: 0 })

        const { coreURL, wasmURL, workerURL } = getCoreUrls()

        await ffmpeg.load({ coreURL, wasmURL, workerURL })

        this.state = 'ready'
        onProgress?.({ stage: 'Ready', percent: 100 })
      } catch (error) {
        this.state = 'error'
        throw error
      }
    })()

    return this.loadPromise
  }

  private async safeDeleteFile(name: string): Promise<void> {
    if (!this.ffmpeg) return

    const ffmpegAny = this.ffmpeg as unknown as {
      deleteFile?: (path: string) => Promise<void> | void
    }

    if (typeof ffmpegAny.deleteFile === 'function') {
      try {
        await ffmpegAny.deleteFile(name)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run a transcode job
   */
  async run(
    config: FFmpegJobConfig,
    onProgress?: OperationProgressCallback,
    signal?: AbortSignal
  ): Promise<FFmpegJobResult> {
    if (this.state !== 'ready') {
      await this.load()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized')
    }

    if (this.isRunning) {
      throw new Error('FFmpeg is busy with another job')
    }

    if (signal?.aborted) {
      return { success: false, error: 'Cancelled' }
    }

    this.isRunning = true

    const startTime = Date.now()
    const inputExt = config.inputFile.name.split('.').pop() || 'dat'
    const inputName = `input_${startTime}.${inputExt}`
    const outputName = config.outputFilename || `output.${config.outputFormat}`

    const ffmpegAny = this.ffmpeg as unknown as {
      on?: (event: string, handler: (data: FFmpegProgressEvent) => void) => void
      off?: (event: string, handler: (data: FFmpegProgressEvent) => void) => void
    }

    const progressHandler = (data: FFmpegProgressEvent) => {
      const ratio = typeof data.progress === 'number'
        ? data.progress
        : typeof data.ratio === 'number'
          ? data.ratio
          : 0
      onProgress?.({
        percent: clampPercent(ratio * 100),
        stage: 'Transcoding',
        time: data.time,
      })
    }

    const abortHandler = () => {
      this.terminateInstance()
    }

    if (typeof ffmpegAny.on === 'function') {
      ffmpegAny.on('progress', progressHandler)
    }

    signal?.addEventListener('abort', abortHandler)

    try {
      onProgress?.({ percent: 0, stage: 'Preparing files' })

      const fetchFile = await getFetchFile()
      await this.ffmpeg.writeFile(inputName, await fetchFile(config.inputFile))

      if (signal?.aborted) {
        return { success: false, error: 'Cancelled' }
      }

      onProgress?.({ percent: 1, stage: 'Starting FFmpeg' })

      const args = ['-i', inputName, ...(config.ffmpegArgs || []), outputName]
      await this.ffmpeg.exec(args)

      if (signal?.aborted) {
        return { success: false, error: 'Cancelled' }
      }

      onProgress?.({ percent: 95, stage: 'Finalizing' })

      const outputData = await this.ffmpeg.readFile(outputName)
      const outputBytes = outputData instanceof Uint8Array
        ? outputData
        : new Uint8Array(outputData as ArrayBuffer)

      onProgress?.({ percent: 100, stage: 'Complete' })

      return {
        success: true,
        outputData: outputBytes,
        outputFilename: outputName,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: config.inputFile.size,
          outputSize: outputBytes.length,
        },
      }
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, error: 'Cancelled' }
      }

      const errorMessage = error instanceof Error ? error.message : 'FFmpeg failed'
      return { success: false, error: errorMessage }
    } finally {
      signal?.removeEventListener('abort', abortHandler)
      if (typeof ffmpegAny.off === 'function') {
        ffmpegAny.off('progress', progressHandler)
      }

      await this.safeDeleteFile(inputName)
      await this.safeDeleteFile(outputName)

      this.isRunning = false
    }
  }

  /**
   * Dispose of the FFmpeg loader
   */
  dispose(): void {
    this.terminateInstance()
  }
}

/**
 * Singleton FFmpeg loader instance
 */
let sharedInstance: FFmpegLoader | null = null

/**
 * Get the shared FFmpeg loader instance
 */
export function getFFmpegLoader(): FFmpegLoader {
  if (!sharedInstance) {
    sharedInstance = new FFmpegLoader()
  }
  return sharedInstance
}

/**
 * Dispose the shared FFmpeg loader instance
 */
export function disposeFFmpegLoader(): void {
  if (sharedInstance) {
    sharedInstance.dispose()
    sharedInstance = null
  }
}
