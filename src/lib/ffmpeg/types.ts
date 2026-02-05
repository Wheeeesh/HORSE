/**
 * FFmpeg Types
 * 
 * Type definitions for FFmpeg.wasm integration.
 * Supports lazy loading, progress tracking, and cancellation.
 */

/**
 * FFmpeg loading state
 */
export type FFmpegLoadState = 
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unsupported'

/**
 * FFmpeg loading progress
 */
export interface FFmpegLoadProgress {
  /** Loading stage description */
  stage: string
  /** Progress percentage (0-100), -1 if indeterminate */
  percent: number
  /** Bytes loaded so far */
  bytesLoaded?: number
  /** Total bytes to load */
  bytesTotal?: number
}

/**
 * FFmpeg operation progress
 */
export interface FFmpegOperationProgress {
  /** Current operation stage */
  stage: string
  /** Progress percentage (0-100) */
  percent: number
  /** Current time position in seconds (for transcoding) */
  time?: number
  /** Total duration in seconds */
  duration?: number
  /** Current frame number */
  frame?: number
  /** Processing speed (e.g., "1.5x") */
  speed?: string
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number
}

/**
 * FFmpeg job configuration
 */
export interface FFmpegJobConfig {
  /** Input file */
  inputFile: File
  /** Output format/extension */
  outputFormat: string
  /** FFmpeg arguments (without input/output) */
  ffmpegArgs?: string[]
  /** Output filename (auto-generated if not provided) */
  outputFilename?: string
}

/**
 * FFmpeg job result
 */
export interface FFmpegJobResult {
  /** Whether the job succeeded */
  success: boolean
  /** Output file data (if successful) */
  outputData?: Uint8Array
  /** Output filename */
  outputFilename?: string
  /** Output MIME type */
  outputMimeType?: string
  /** Error message (if failed) */
  error?: string
  /** Processing statistics */
  stats?: {
    /** Processing time in ms */
    processingTime: number
    /** Input file size in bytes */
    inputSize: number
    /** Output file size in bytes */
    outputSize: number
  }
}

/**
 * Browser capability check results
 */
export interface FFmpegCapabilities {
  /** Whether Web Workers are supported */
  webWorkers: boolean
  /** Whether WebAssembly is supported */
  webAssembly: boolean
  /** Whether SharedArrayBuffer is available (for multi-threading) */
  sharedArrayBuffer: boolean
  /** Whether cross-origin isolation is enabled */
  crossOriginIsolated: boolean
  /** Overall: can FFmpeg run at all */
  canRun: boolean
  /** Can use multi-threaded FFmpeg */
  canUseMultiThread: boolean
  /** Warnings about capability limitations */
  warnings: string[]
}

/**
 * Video file metadata
 */
export interface VideoMetadata {
  /** Duration in seconds */
  duration?: number
  /** Width in pixels */
  width?: number
  /** Height in pixels */
  height?: number
  /** Video codec */
  videoCodec?: string
  /** Audio codec */
  audioCodec?: string
  /** Bitrate in bits per second */
  bitrate?: number
  /** Frame rate */
  frameRate?: number
}

/**
 * Memory estimate for a video operation
 */
export interface MemoryEstimate {
  /** Estimated memory needed in bytes */
  estimatedBytes: number
  /** Human-readable estimate */
  humanReadable: string
  /** Whether this might exceed available memory */
  mightExceedMemory: boolean
  /** Warning message if applicable */
  warning?: string
}
