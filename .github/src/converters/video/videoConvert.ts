/**
 * Video Converter
 * 
 * Provides video conversion using FFmpeg.wasm.
 * Features:
 * - Memory/size warnings for large files
 * - Progress tracking during conversion
 * - Cancellation support
 * 
 * Supported conversions:
 * - MP4 ↔ WebM
 * - Video → GIF
 * - Video → Audio extraction (MP3, WAV, AAC) [planned]
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  SelectOptionSchema,
  RangeOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

import {
  getFFmpegLoader,
  estimateMemoryRequirements,
  checkFFmpegCapabilities,
  isVideoFile,
  generateOutputFilename,
  getVideoMimeType,
  VIDEO_FORMATS,
} from '../../lib/ffmpeg'

// ============================================================================
// Types and Constants
// ============================================================================

/** Video file type (generic) */
const VIDEO_TYPE = { 
  mimeType: 'video/*', 
  extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v', 'ogv'], 
  label: 'Video' 
}

/** MP4 specific */
const MP4_TYPE = { 
  mimeType: 'video/mp4', 
  extensions: ['mp4', 'm4v'], 
  label: 'MP4' 
}

/** WebM specific */
const WEBM_TYPE = { 
  mimeType: 'video/webm', 
  extensions: ['webm'], 
  label: 'WebM' 
}

/** GIF output */
const GIF_TYPE = { 
  mimeType: 'image/gif', 
  extensions: ['gif'], 
  label: 'GIF' 
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[Math.min(i, units.length - 1)]}`
}

// ============================================================================
// Converter Options
// ============================================================================

const videoConvertOptions: OptionSchema[] = [
  {
    id: 'quality',
    type: 'select',
    label: 'Quality',
    options: [
      { value: 'high', label: 'High (larger file)' },
      { value: 'medium', label: 'Medium (balanced)' },
      { value: 'low', label: 'Low (smaller file)' },
    ],
    default: 'medium',
    description: 'Output quality preset',
  } as SelectOptionSchema,
  {
    id: 'scale',
    type: 'range',
    label: 'Resolution scale',
    min: 25,
    max: 100,
    step: 25,
    default: 100,
    unit: '%',
    description: 'Scale video resolution (lower = smaller file)',
  } as RangeOptionSchema,
]

const videoToGifOptions: OptionSchema[] = [
  {
    id: 'fps',
    type: 'select',
    label: 'Frame rate',
    options: [
      { value: '10', label: '10 FPS (smaller)' },
      { value: '15', label: '15 FPS (balanced)' },
      { value: '24', label: '24 FPS (smooth)' },
      { value: '30', label: '30 FPS (large)' },
    ],
    default: '15',
  } as SelectOptionSchema,
  {
    id: 'width',
    type: 'select',
    label: 'Width',
    options: [
      { value: '320', label: '320px (small)' },
      { value: '480', label: '480px (medium)' },
      { value: '640', label: '640px (large)' },
      { value: 'original', label: 'Original' },
    ],
    default: '480',
  } as SelectOptionSchema,
]

// ============================================================================
// Video Format Converter (MP4 ↔ WebM)
// ============================================================================

export const videoFormatConverter: Converter = {
  id: 'video-format-convert',
  label: 'Convert Video Format',
  category: 'Video',
  inputs: [VIDEO_TYPE],
  outputs: [MP4_TYPE, WEBM_TYPE],
  optionsSchema: videoConvertOptions,
  cost: 'heavy',
  multiFile: false, // One video at a time for memory reasons
  streaming: true, // Supports progress

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    return isVideoFile(files[0])
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    const warnings: string[] = []
    
    // Check capabilities
    const capabilities = checkFFmpegCapabilities()
    if (!capabilities.canRun) {
      return {
        canConvert: false,
        reason: 'Video conversion is not supported in this browser. ' +
          capabilities.warnings.join(' '),
      }
    }
    
    // Add capability warnings
    warnings.push(...capabilities.warnings)
    
    // Check memory requirements
    const memEstimate = estimateMemoryRequirements(file)
    if (memEstimate.warning) {
      warnings.push(memEstimate.warning)
    }
    
    // Estimate output size (rough approximation)
    // WebM is usually smaller than MP4 for same quality
    const outputFormat = input.outputType?.split('/')[1] || 'mp4'
    const sizeMultiplier = outputFormat === 'webm' ? 0.8 : 1.0
    const estimatedSize = Math.round(file.size * sizeMultiplier)
    
    // Estimate time: ~1 second per MB on single-threaded, faster with multi-threading
    const mbSize = file.size / (1024 * 1024)
    const timeMultiplier = capabilities.canUseMultiThread ? 0.5 : 1.0
    const estimatedTime = Math.max(5000, mbSize * 1000 * timeMultiplier)
    
    return {
      canConvert: true,
      estimatedSize,
      estimatedTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const file = input.files[0]
    const startTime = Date.now()
    
    // Determine output format
    const outputMime = input.outputType || 'video/mp4'
    const outputFormat = outputMime.split('/')[1] || 'mp4'
    
    try {
      // Get FFmpeg loader (lazy loads if needed)
      const ffmpeg = getFFmpegLoader()
      
      // Load FFmpeg with progress
      onProgress?.({ percent: 0, stage: 'Loading video processor...' })
      
      await ffmpeg.load((loadProgress) => {
        // Map load progress to 0-20%
        const percent = Math.round(loadProgress.percent * 0.2)
        onProgress?.({ percent, stage: loadProgress.stage })
      })
      
      // Build FFmpeg arguments based on options
      const quality = (input.options?.quality as string) || 'medium'
      const scale = (input.options?.scale as number) || 100
      
      const ffmpegArgs: string[] = []
      
      // Quality preset
      if (outputFormat === 'webm') {
        const crf = quality === 'high' ? 20 : quality === 'low' ? 40 : 30
        ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0')
      } else {
        const crf = quality === 'high' ? 18 : quality === 'low' ? 28 : 23
        ffmpegArgs.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium')
      }
      
      // Scale if needed
      if (scale < 100) {
        const scaleFilter = `scale=iw*${scale / 100}:ih*${scale / 100}`
        ffmpegArgs.push('-vf', scaleFilter)
      }
      
      // Audio codec
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k')
      
      // Run conversion
      const result = await ffmpeg.run(
        {
          inputFile: file,
          outputFormat,
          ffmpegArgs,
          outputFilename: generateOutputFilename(file.name, outputFormat),
        },
        (opProgress) => {
          // Map operation progress to 20-100%
          const percent = 20 + Math.round(opProgress.percent * 0.8)
          onProgress?.({
            percent,
            stage: opProgress.stage,
            estimatedTimeRemaining: opProgress.estimatedTimeRemaining,
          })
        }
      )
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Conversion failed',
        }
      }
      
      // Create output file
      const outputBlob = new Blob(
        [result.outputData!],
        { type: getVideoMimeType(outputFormat) }
      )
      
      const outputFile: ConvertedFile = {
        name: result.outputFilename || generateOutputFilename(file.name, outputFormat),
        mimeType: getVideoMimeType(outputFormat),
        data: outputBlob,
        sourceFile: file,
      }
      
      return {
        success: true,
        files: [outputFile],
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: file.size,
          outputSize: outputBlob.size,
        },
      }
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

// ============================================================================
// Video to GIF Converter
// ============================================================================

export const videoToGifConverter: Converter = {
  id: 'video-to-gif',
  label: 'Video to GIF',
  category: 'Video',
  inputs: [VIDEO_TYPE],
  outputs: [GIF_TYPE],
  optionsSchema: videoToGifOptions,
  cost: 'heavy',
  multiFile: false,
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    return isVideoFile(files[0])
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    const warnings: string[] = []
    
    // Check capabilities
    const capabilities = checkFFmpegCapabilities()
    if (!capabilities.canRun) {
      return {
        canConvert: false,
        reason: 'Video conversion is not supported in this browser.',
      }
    }
    
    warnings.push(...capabilities.warnings)
    
    // GIF memory warning
    const memEstimate = estimateMemoryRequirements(file)
    if (memEstimate.warning) {
      warnings.push(memEstimate.warning)
    }
    
    // GIFs can be very large - warn about that
    warnings.push(
      'GIFs can be large. For best results, keep videos short (under 10 seconds) ' +
      'and use lower resolution/frame rate settings.'
    )
    
    return {
      canConvert: true,
      estimatedSize: Math.round(file.size * 2), // GIFs often larger than source
      estimatedTime: Math.max(10000, (file.size / (1024 * 1024)) * 2000),
      warnings,
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const file = input.files[0]
    const startTime = Date.now()
    
    try {
      const ffmpeg = getFFmpegLoader()
      
      onProgress?.({ percent: 0, stage: 'Loading video processor...' })
      
      await ffmpeg.load((loadProgress) => {
        const percent = Math.round(loadProgress.percent * 0.2)
        onProgress?.({ percent, stage: loadProgress.stage })
      })
      
      // Build FFmpeg arguments for GIF
      const fps = (input.options?.fps as string) || '15'
      const width = (input.options?.width as string) || '480'
      
      const ffmpegArgs: string[] = []
      
      // Scale and fps filter
      const scaleWidth = width === 'original' ? '-1' : width
      ffmpegArgs.push('-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos`)
      
      // Run conversion
      const result = await ffmpeg.run(
        {
          inputFile: file,
          outputFormat: 'gif',
          ffmpegArgs,
          outputFilename: generateOutputFilename(file.name, 'gif'),
        },
        (opProgress) => {
          const percent = 20 + Math.round(opProgress.percent * 0.8)
          onProgress?.({
            percent,
            stage: opProgress.stage,
            estimatedTimeRemaining: opProgress.estimatedTimeRemaining,
          })
        }
      )
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Conversion failed',
        }
      }
      
      const outputBlob = new Blob([result.outputData!], { type: 'image/gif' })
      
      return {
        success: true,
        files: [{
          name: result.outputFilename || generateOutputFilename(file.name, 'gif'),
          mimeType: 'image/gif',
          data: outputBlob,
          sourceFile: file,
        }],
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: file.size,
          outputSize: outputBlob.size,
        },
      }
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register video converters
 */
export function registerVideoConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(videoFormatConverter, 10)
  register(videoToGifConverter, 10)
}
