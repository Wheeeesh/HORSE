/**
 * Conversion Runner
 * 
 * Handles running conversions with:
 * - Progress tracking
 * - Cancellation via AbortController
 * - Step logging for "what happened" panel
 */

import type {
  Converter,
  ConversionInput,
  ConversionResult,
  ConversionProgress,
  ConverterOptions,
} from './types'

/**
 * Log entry for conversion steps
 */
export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

/**
 * Conversion run state
 */
export interface ConversionRunState {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
  progress: ConversionProgress
  logs: LogEntry[]
  result: ConversionResult | null
  error: string | null
}

/**
 * Callbacks for conversion runner
 */
export interface ConversionRunCallbacks {
  onProgress: (progress: ConversionProgress) => void
  onLog: (entry: LogEntry) => void
  onComplete: (result: ConversionResult) => void
  onError: (error: string) => void
  onCancel: () => void
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogEntry['level'],
  message: string
): LogEntry {
  return {
    timestamp: Date.now(),
    level,
    message,
  }
}

/**
 * Check if an error is an abort error
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Sleep for a given duration, respecting abort signal
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeout = setTimeout(resolve, ms)
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/**
 * Stub converter for testing the UX
 * Simulates a conversion that takes a few seconds
 */
export async function runStubConversion(
  files: File[],
  _outputType: string,
  _options: ConverterOptions,
  callbacks: ConversionRunCallbacks,
  signal: AbortSignal
): Promise<ConversionResult> {
  const totalSteps = 5
  const stepDuration = 400 // ms per step

  try {
    // Step 1: Initialize
    callbacks.onLog(createLogEntry('info', 'Starting conversion...'))
    callbacks.onProgress({ percent: 0, stage: 'Initializing' })
    await sleep(stepDuration, signal)

    // Step 2: Reading files
    callbacks.onLog(createLogEntry('info', `Reading ${files.length} file(s)...`))
    callbacks.onProgress({ percent: 20, stage: 'Reading files' })
    await sleep(stepDuration, signal)

    // Step 3: Processing
    callbacks.onLog(createLogEntry('info', 'Processing...'))
    callbacks.onProgress({ percent: 40, stage: 'Processing' })
    await sleep(stepDuration, signal)

    // Step 4: Converting
    callbacks.onLog(createLogEntry('info', 'Converting...'))
    callbacks.onProgress({ percent: 60, stage: 'Converting' })
    await sleep(stepDuration, signal)

    // Step 5: Finalizing
    callbacks.onLog(createLogEntry('info', 'Finalizing...'))
    callbacks.onProgress({ percent: 80, stage: 'Finalizing' })
    await sleep(stepDuration, signal)

    // Complete
    callbacks.onProgress({ percent: 100, stage: 'Complete' })
    callbacks.onLog(createLogEntry('success', 'Conversion completed successfully!'))

    // Create stub output blobs - one per input file to test multi-file download
    const outputFiles = files.map((file, index) => {
      const outputContent = `Converted from: ${file.name}\nOriginal size: ${file.size} bytes\nTimestamp: ${new Date().toISOString()}\nFile ${index + 1} of ${files.length}`
      const outputBlob = new Blob([outputContent], { type: 'text/plain' })
      
      // Generate output filename based on input
      const baseName = file.name.replace(/\.[^.]+$/, '') || `file_${index + 1}`
      
      return {
        name: `${baseName}_converted.txt`,
        mimeType: 'text/plain',
        data: outputBlob,
        sourceFile: file,
      }
    })

    const totalOutputSize = outputFiles.reduce((sum, f) => sum + f.data.size, 0)
    
    const result: ConversionResult = {
      success: true,
      files: outputFiles,
      stats: {
        processingTime: totalSteps * stepDuration,
        inputSize: files.reduce((sum, f) => sum + f.size, 0),
        outputSize: totalOutputSize,
      },
    }

    callbacks.onComplete(result)
    return result

  } catch (error) {
    if (isAbortError(error)) {
      callbacks.onLog(createLogEntry('warn', 'Conversion cancelled by user'))
      callbacks.onCancel()
      return {
        success: false,
        error: 'Conversion cancelled',
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    callbacks.onLog(createLogEntry('error', `Error: ${errorMessage}`))
    callbacks.onError(errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Run a conversion using the registered converter
 */
export async function runConversion(
  converter: Converter,
  input: ConversionInput,
  callbacks: ConversionRunCallbacks,
  signal: AbortSignal
): Promise<ConversionResult> {
  try {
    callbacks.onLog(createLogEntry('info', `Using converter: ${converter.label}`))
    callbacks.onLog(createLogEntry('info', `Input: ${input.files.length} file(s), ${input.files.reduce((sum, f) => sum + f.size, 0)} bytes total`))
    callbacks.onProgress({ percent: 0, stage: 'Starting' })

    // Create a progress wrapper that checks for abort
    const wrappedProgress = (progress: ConversionProgress) => {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      callbacks.onProgress(progress)
    }

    // Try to use the actual converter
    const result = await converter.convert(input, wrappedProgress)

    // Check if converter is not implemented (placeholder)
    if (!result.success && result.error === 'Conversion not yet implemented') {
      callbacks.onLog(createLogEntry('info', 'Using demo conversion (converter not yet implemented)'))
      return await runStubConversion(
        input.files,
        input.outputType,
        input.options || {},
        callbacks,
        signal
      )
    }

    // Log results
    if (result.success) {
      callbacks.onLog(createLogEntry('success', `Conversion complete!`))
      if (result.stats) {
        callbacks.onLog(createLogEntry('info', `Output: ${result.files?.length || 0} file(s), ${result.stats.outputSize} bytes`))
      }
      callbacks.onComplete(result)
    } else {
      callbacks.onLog(createLogEntry('error', result.error || 'Unknown error'))
      callbacks.onError(result.error || 'Unknown error')
    }

    return result

  } catch (error) {
    if (isAbortError(error)) {
      callbacks.onLog(createLogEntry('warn', 'Conversion cancelled'))
      callbacks.onCancel()
      return { success: false, error: 'Cancelled' }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    callbacks.onLog(createLogEntry('error', errorMessage))
    callbacks.onError(errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}
