/**
 * FFmpeg Capabilities & Utilities
 * 
 * Provides browser capability detection and memory estimation
 * for FFmpeg.wasm operations.
 */

import type { FFmpegCapabilities, MemoryEstimate, VideoMetadata } from './types'

/**
 * Check browser capabilities for FFmpeg.wasm
 */
export function checkFFmpegCapabilities(): FFmpegCapabilities {
  const warnings: string[] = []
  
  // Check Web Workers
  const webWorkers = typeof Worker !== 'undefined'
  if (!webWorkers) {
    warnings.push('Web Workers not supported - FFmpeg cannot run')
  }
  
  // Check WebAssembly
  const webAssembly = typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function'
  if (!webAssembly) {
    warnings.push('WebAssembly not supported - FFmpeg cannot run')
  }
  
  // Check SharedArrayBuffer (for multi-threading)
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined'
  
  // Check cross-origin isolation (required for SharedArrayBuffer in modern browsers)
  const crossOriginIsolated = typeof window !== 'undefined' && 
    (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  
  // Can use multi-threading only with both SAB and COOP/COEP
  const canUseMultiThread = sharedArrayBuffer && crossOriginIsolated
  
  if (!canUseMultiThread) {
    warnings.push(
      'Multi-threaded FFmpeg not available. ' +
      'Video processing will be slower. ' +
      (sharedArrayBuffer 
        ? 'Cross-origin isolation (COOP/COEP headers) required for multi-threading.'
        : 'SharedArrayBuffer not available.')
    )
  }
  
  // Overall: can run at all (single-threaded fallback)
  const canRun = webWorkers && webAssembly
  
  return {
    webWorkers,
    webAssembly,
    sharedArrayBuffer,
    crossOriginIsolated,
    canRun,
    canUseMultiThread,
    warnings,
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[Math.min(i, units.length - 1)]}`
}

/**
 * Estimate memory requirements for a video operation
 * 
 * FFmpeg.wasm loads the entire input file into memory, plus
 * needs working space for decoding/encoding. This is a rough estimate.
 */
export function estimateMemoryRequirements(
  inputFile: File,
  _outputFormat?: string,
  metadata?: VideoMetadata
): MemoryEstimate {
  // Base: input file size (loaded into WASM memory)
  const inputSize = inputFile.size
  
  // Estimate decoded frame buffer size
  // Assuming 1080p RGBA: 1920 * 1080 * 4 = ~8MB per frame
  // For HD video, we might have several frames in buffer
  const width = metadata?.width || 1920
  const height = metadata?.height || 1080
  const frameSize = width * height * 4 // RGBA
  const frameBufferEstimate = frameSize * 10 // ~10 frames buffer
  
  // Encoding buffer (roughly equal to input for transcoding)
  const encodingBuffer = inputSize
  
  // FFmpeg.wasm overhead (~50MB for the WASM module itself)
  const wasmOverhead = 50 * 1024 * 1024
  
  // Total estimate with 20% safety margin
  const estimatedBytes = Math.ceil(
    (inputSize + frameBufferEstimate + encodingBuffer + wasmOverhead) * 1.2
  )
  
  // Check against typical browser limits
  // Most browsers allow 1-4GB for WASM, but practical limit is often lower
  const practicalLimit = 1.5 * 1024 * 1024 * 1024 // 1.5GB
  const mightExceedMemory = estimatedBytes > practicalLimit
  
  let warning: string | undefined
  
  if (mightExceedMemory) {
    warning = `This file may require ~${formatBytes(estimatedBytes)} of memory. ` +
      `Large video files may cause the browser to run out of memory. ` +
      `Consider using smaller files or a native video converter for best results.`
  } else if (inputSize > 100 * 1024 * 1024) {
    // Files > 100MB get a softer warning
    warning = `Large file (${formatBytes(inputSize)}). ` +
      `Processing may be slow and use significant memory.`
  }
  
  return {
    estimatedBytes,
    humanReadable: formatBytes(estimatedBytes),
    mightExceedMemory,
    warning,
  }
}

/**
 * Get MIME type for video format
 */
export function getVideoMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    ogv: 'video/ogg',
    '3gp': 'video/3gpp',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    // Audio formats (for extraction)
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    // Image formats (for thumbnails)
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  
  return mimeTypes[format.toLowerCase()] || 'application/octet-stream'
}

/**
 * Check if a file is a video by MIME type or extension
 */
export function isVideoFile(file: File): boolean {
  // Check MIME type
  if (file.type.startsWith('video/')) {
    return true
  }
  
  // Check extension as fallback
  const ext = file.name.split('.').pop()?.toLowerCase()
  const videoExtensions = [
    'mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v', 'ogv', 
    '3gp', 'flv', 'wmv', 'mpeg', 'mpg', 'ts', 'mts'
  ]
  
  return ext ? videoExtensions.includes(ext) : false
}

/**
 * Generate output filename for converted video
 */
export function generateOutputFilename(
  inputFilename: string,
  outputFormat: string
): string {
  const baseName = inputFilename.replace(/\.[^.]+$/, '') || 'video'
  return `${baseName}.${outputFormat}`
}

/**
 * Video format descriptors for UI
 */
export const VIDEO_FORMATS = {
  mp4: {
    label: 'MP4',
    description: 'Best compatibility, good compression',
    extension: 'mp4',
    mimeType: 'video/mp4',
  },
  webm: {
    label: 'WebM',
    description: 'Open format, great for web',
    extension: 'webm',
    mimeType: 'video/webm',
  },
  gif: {
    label: 'GIF',
    description: 'Animated image (no audio)',
    extension: 'gif',
    mimeType: 'image/gif',
  },
} as const

/**
 * Audio extraction formats for UI
 */
export const AUDIO_FORMATS = {
  mp3: {
    label: 'MP3',
    description: 'Universal audio format',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
  },
  wav: {
    label: 'WAV',
    description: 'Uncompressed audio',
    extension: 'wav',
    mimeType: 'audio/wav',
  },
  aac: {
    label: 'AAC',
    description: 'Modern compressed audio',
    extension: 'aac',
    mimeType: 'audio/aac',
  },
} as const
