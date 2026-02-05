/**
 * Raster Image Converter
 * 
 * Converts between PNG, JPEG, and WebP using the Canvas API.
 * Features:
 * - Quality slider for lossy formats (JPEG, WebP)
 * - Resize options (pixels or percentage)
 * - Preserves transparency for PNG and WebP
 * - Warns on transparency loss when converting to JPEG
 * - Feature detection for WebP support
 * 
 * Operates locally using browser Canvas API, no network calls.
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  RangeOptionSchema,
  SelectOptionSchema,
  BooleanOptionSchema,
  NumberOptionSchema,
  OptionSchema,
  ConverterOptions,
} from '../../lib/convert/types'

// ============================================================================
// File Type Definitions
// ============================================================================

const PNG_TYPE = { mimeType: 'image/png', extensions: ['png'], label: 'PNG' }
const JPEG_TYPE = { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG' }
const WEBP_TYPE = { mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' }

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if browser supports encoding to a specific image format
 */
function supportsFormat(mimeType: string): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const dataUrl = canvas.toDataURL(mimeType)
    // If the browser doesn't support the format, it returns a PNG data URL instead
    return dataUrl.startsWith(`data:${mimeType}`)
  } catch {
    return false
  }
}

// Cache format support detection results
let webpSupported: boolean | null = null

/**
 * Check if WebP encoding is supported
 */
function isWebPSupported(): boolean {
  if (webpSupported === null) {
    webpSupported = supportsFormat('image/webp')
  }
  return webpSupported
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Replace file extension
 */
function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return `${filename}.${newExt}`
  return `${filename.slice(0, lastDot)}.${newExt}`
}

/**
 * Load an image from a File object
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }
    
    img.src = url
  })
}

/**
 * Check if an image has transparency by examining pixel data
 */
function hasTransparency(img: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(img.width, 100) // Sample a small area for performance
  canvas.height = Math.min(img.height, 100)
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  
  // Draw image scaled down for faster analysis
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    
    // Check alpha channel (every 4th byte starting from index 3)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        return true
      }
    }
  } catch {
    // If we can't read pixel data (e.g., CORS), assume no transparency
    return false
  }
  
  return false
}

/**
 * Convert an image to a specific format using Canvas
 */
async function convertImage(
  img: HTMLImageElement,
  outputMimeType: string,
  quality: number, // 0-1 for lossy formats
  resize?: ResizeOptions
): Promise<Blob> {
  // Calculate output dimensions
  const { width, height } = calculateDimensions(img.width, img.height, resize)
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  
  // Enable image smoothing for better resize quality
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // For JPEG, fill with white background (no transparency support)
  if (outputMimeType === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  
  // Draw the image (scaled if dimensions differ)
  ctx.drawImage(img, 0, 0, width, height)
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error(`Failed to convert image to ${outputMimeType}`))
        }
      },
      outputMimeType,
      quality
    )
  })
}

/**
 * Resize options structure
 */
interface ResizeOptions {
  mode: 'none' | 'pixels' | 'percentage'
  width?: number
  height?: number
  maintainAspectRatio: boolean
}

/**
 * Calculate output dimensions based on resize options
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  resize?: ResizeOptions
): { width: number; height: number } {
  if (!resize || resize.mode === 'none') {
    return { width: originalWidth, height: originalHeight }
  }

  const aspectRatio = originalWidth / originalHeight

  if (resize.mode === 'percentage') {
    const scale = (resize.width || 100) / 100
    return {
      width: Math.round(originalWidth * scale),
      height: Math.round(originalHeight * scale),
    }
  }

  // Pixels mode
  let targetWidth = resize.width || originalWidth
  let targetHeight = resize.height || originalHeight

  if (resize.maintainAspectRatio) {
    // If both dimensions specified, fit within bounds
    if (resize.width && resize.height) {
      const widthRatio = resize.width / originalWidth
      const heightRatio = resize.height / originalHeight
      const scale = Math.min(widthRatio, heightRatio)
      targetWidth = Math.round(originalWidth * scale)
      targetHeight = Math.round(originalHeight * scale)
    } else if (resize.width) {
      // Only width specified - calculate height
      targetWidth = resize.width
      targetHeight = Math.round(resize.width / aspectRatio)
    } else if (resize.height) {
      // Only height specified - calculate width
      targetHeight = resize.height
      targetWidth = Math.round(resize.height * aspectRatio)
    }
  }

  // Ensure minimum dimensions
  return {
    width: Math.max(1, targetWidth),
    height: Math.max(1, targetHeight),
  }
}

/**
 * Parse resize options from converter options
 */
function parseResizeOptions(options?: ConverterOptions): ResizeOptions {
  const mode = (options?.resizeMode as string) || 'none'
  
  return {
    mode: mode as ResizeOptions['mode'],
    width: options?.resizeWidth as number | undefined,
    height: options?.resizeHeight as number | undefined,
    maintainAspectRatio: options?.maintainAspectRatio !== false,
  }
}

/**
 * Check if file is a specific image type
 */
function isImageType(file: File, mimeType: string, extensions: string[]): boolean {
  const ext = getExtension(file.name)
  return file.type === mimeType || extensions.includes(ext)
}

// ============================================================================
// Quality Option Schema
// ============================================================================

const qualityOption: RangeOptionSchema = {
  id: 'quality',
  type: 'range',
  label: 'Quality',
  min: 1,
  max: 100,
  step: 1,
  default: 85,
  unit: '%',
  description: 'Higher quality = larger file size',
}

// ============================================================================
// Resize Option Schemas
// ============================================================================

const resizeModeOption: SelectOptionSchema = {
  id: 'resizeMode',
  type: 'select',
  label: 'Resize',
  options: [
    { value: 'none', label: 'Original size' },
    { value: 'pixels', label: 'Custom (pixels)' },
    { value: 'percentage', label: 'Scale (%)' },
  ],
  default: 'none',
}

const resizeWidthOption: NumberOptionSchema = {
  id: 'resizeWidth',
  type: 'number',
  label: 'Width',
  min: 1,
  max: 16384,
  description: 'Width in pixels (or % if scaling)',
}

const resizeHeightOption: NumberOptionSchema = {
  id: 'resizeHeight',
  type: 'number',
  label: 'Height',
  min: 1,
  max: 16384,
  description: 'Height in pixels (leave empty to auto-calculate)',
}

const maintainAspectRatioOption: BooleanOptionSchema = {
  id: 'maintainAspectRatio',
  type: 'boolean',
  label: 'Maintain aspect ratio',
  default: true,
}

/** Resize options for all image converters */
const resizeOptions: OptionSchema[] = [
  resizeModeOption,
  resizeWidthOption,
  resizeHeightOption,
  maintainAspectRatioOption,
]

/** Combined options for lossy formats (with quality) */
const lossyOptionsWithResize: OptionSchema[] = [
  qualityOption,
  ...resizeOptions,
]

/** Combined options for lossless formats (no quality) */
const losslessOptionsWithResize: OptionSchema[] = [
  ...resizeOptions,
]

// ============================================================================
// PNG to JPEG Converter
// ============================================================================

export const pngToJpeg: Converter = {
  id: 'png-to-jpeg-canvas',
  label: 'PNG to JPEG',
  category: 'Images',
  inputs: [PNG_TYPE],
  outputs: [JPEG_TYPE],
  optionsSchema: lossyOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isImageType(file, 'image/png', ['png']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const quality = ((input.options?.quality as number) || 85) / 100
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * quality * 0.5), // JPEG is typically smaller
      estimatedTime: Math.max(200, totalSize / 100000),
      warnings: ['Transparency will be replaced with white background'],
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    const warnings: string[] = []
    
    const quality = ((input.options?.quality as number) || 85) / 100
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Load image
        const img = await loadImage(file)
        
        // Check for transparency and warn
        if (hasTransparency(img)) {
          warnings.push(`${file.name}: Transparency replaced with white background`)
        }
        
        // Convert to JPEG with resize
        const blob = await convertImage(img, 'image/jpeg', quality, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'jpg'),
          mimeType: 'image/jpeg',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
// JPEG to PNG Converter
// ============================================================================

export const jpegToPng: Converter = {
  id: 'jpeg-to-png-canvas',
  label: 'JPEG to PNG',
  category: 'Images',
  inputs: [JPEG_TYPE],
  outputs: [PNG_TYPE],
  optionsSchema: losslessOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isImageType(file, 'image/jpeg', ['jpg', 'jpeg']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 2), // PNG is typically larger than JPEG
      estimatedTime: Math.max(200, totalSize / 100000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Load and convert with resize
        const img = await loadImage(file)
        const blob = await convertImage(img, 'image/png', 1, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'png'),
          mimeType: 'image/png',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
// PNG to WebP Converter
// ============================================================================

export const pngToWebp: Converter = {
  id: 'png-to-webp-canvas',
  label: 'PNG to WebP',
  category: 'Images',
  inputs: [PNG_TYPE],
  outputs: [WEBP_TYPE],
  optionsSchema: lossyOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    if (!isWebPSupported()) return false
    return files.every(file => isImageType(file, 'image/png', ['png']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    if (!isWebPSupported()) {
      return {
        canConvert: false,
        reason: 'WebP encoding is not supported by your browser',
      }
    }
    
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const quality = ((input.options?.quality as number) || 85) / 100
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * quality * 0.4), // WebP is very efficient
      estimatedTime: Math.max(200, totalSize / 100000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    if (!isWebPSupported()) {
      return {
        success: false,
        error: 'WebP encoding is not supported by your browser',
      }
    }

    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    
    const quality = ((input.options?.quality as number) || 85) / 100
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Load and convert with resize
        const img = await loadImage(file)
        const blob = await convertImage(img, 'image/webp', quality, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'webp'),
          mimeType: 'image/webp',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
// JPEG to WebP Converter
// ============================================================================

export const jpegToWebp: Converter = {
  id: 'jpeg-to-webp-canvas',
  label: 'JPEG to WebP',
  category: 'Images',
  inputs: [JPEG_TYPE],
  outputs: [WEBP_TYPE],
  optionsSchema: lossyOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    if (!isWebPSupported()) return false
    return files.every(file => isImageType(file, 'image/jpeg', ['jpg', 'jpeg']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    if (!isWebPSupported()) {
      return {
        canConvert: false,
        reason: 'WebP encoding is not supported by your browser',
      }
    }
    
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const quality = ((input.options?.quality as number) || 85) / 100
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * quality * 0.7),
      estimatedTime: Math.max(200, totalSize / 100000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    if (!isWebPSupported()) {
      return {
        success: false,
        error: 'WebP encoding is not supported by your browser',
      }
    }

    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    
    const quality = ((input.options?.quality as number) || 85) / 100
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        const img = await loadImage(file)
        const blob = await convertImage(img, 'image/webp', quality, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'webp'),
          mimeType: 'image/webp',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
// WebP to PNG Converter
// ============================================================================

export const webpToPng: Converter = {
  id: 'webp-to-png-canvas',
  label: 'WebP to PNG',
  category: 'Images',
  inputs: [WEBP_TYPE],
  outputs: [PNG_TYPE],
  optionsSchema: losslessOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isImageType(file, 'image/webp', ['webp']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 2.5), // PNG is larger than WebP
      estimatedTime: Math.max(200, totalSize / 100000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        const img = await loadImage(file)
        const blob = await convertImage(img, 'image/png', 1, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'png'),
          mimeType: 'image/png',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
// WebP to JPEG Converter
// ============================================================================

export const webpToJpeg: Converter = {
  id: 'webp-to-jpeg-canvas',
  label: 'WebP to JPEG',
  category: 'Images',
  inputs: [WEBP_TYPE],
  outputs: [JPEG_TYPE],
  optionsSchema: lossyOptionsWithResize,
  cost: 'light',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isImageType(file, 'image/webp', ['webp']))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const quality = ((input.options?.quality as number) || 85) / 100
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * quality * 1.2),
      estimatedTime: Math.max(200, totalSize / 100000),
      warnings: ['Transparency will be replaced with white background'],
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0
    const warnings: string[] = []
    
    const quality = ((input.options?.quality as number) || 85) / 100
    const resize = parseResizeOptions(input.options)

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        const img = await loadImage(file)
        
        // Check for transparency
        if (hasTransparency(img)) {
          warnings.push(`${file.name}: Transparency replaced with white background`)
        }
        
        const blob = await convertImage(img, 'image/jpeg', quality, resize)
        totalOutputSize += blob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'jpg'),
          mimeType: 'image/jpeg',
          data: blob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
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
 * Register all raster image converters
 */
export function registerRasterConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  // Register with higher priority than placeholders
  register(pngToJpeg, 20)
  register(jpegToPng, 20)
  register(pngToWebp, 20)
  register(jpegToWebp, 20)
  register(webpToPng, 20)
  register(webpToJpeg, 20)
}
