/**
 * PDF to Image Converter
 * 
 * Converts PDF first page to PNG, JPEG, or WebP image.
 * Features:
 * - Renders first page only (multi-page support coming later)
 * - Scale/DPI option for output resolution
 * - Output format selection (PNG, JPEG, WebP)
 * - Quality option for lossy formats
 * 
 * Uses pdfjs-dist library loaded via dynamic import (lazy-loaded).
 * No CDN dependencies - fully bundled locally.
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  SelectOptionSchema,
  RangeOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** PDF input type */
const PDF_TYPE = { 
  mimeType: 'application/pdf', 
  extensions: ['pdf'], 
  label: 'PDF' 
}

/** Image output types */
const PNG_TYPE = { mimeType: 'image/png', extensions: ['png'], label: 'PNG' }
const JPEG_TYPE = { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG' }
const WEBP_TYPE = { mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' }

/** Output format configuration */
interface OutputFormat {
  mimeType: string
  extension: string
  label: string
  supportsQuality: boolean
}

const OUTPUT_FORMATS: Record<string, OutputFormat> = {
  png: {
    mimeType: 'image/png',
    extension: 'png',
    label: 'PNG',
    supportsQuality: false,
  },
  jpeg: {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    label: 'JPEG',
    supportsQuality: true,
  },
  webp: {
    mimeType: 'image/webp',
    extension: 'webp',
    label: 'WebP',
    supportsQuality: true,
  },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get base filename without extension
 */
function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename
  return filename.slice(0, lastDot)
}

/**
 * Check if WebP encoding is supported
 */
function isWebPSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const dataUrl = canvas.toDataURL('image/webp')
    return dataUrl.startsWith('data:image/webp')
  } catch {
    return false
  }
}

// ============================================================================
// Option Schemas
// ============================================================================

const formatOption: SelectOptionSchema = {
  id: 'format',
  type: 'select',
  label: 'Output Format',
  options: [
    { value: 'png', label: 'PNG (lossless)' },
    { value: 'jpeg', label: 'JPEG (smaller file)' },
    { value: 'webp', label: 'WebP (best compression)' },
  ],
  default: 'png',
}

const scaleOption: SelectOptionSchema = {
  id: 'scale',
  type: 'select',
  label: 'Resolution',
  options: [
    { value: '1', label: '1x (72 DPI)' },
    { value: '1.5', label: '1.5x (108 DPI)' },
    { value: '2', label: '2x (144 DPI)' },
    { value: '3', label: '3x (216 DPI)' },
    { value: '4', label: '4x (288 DPI)' },
  ],
  default: '2',
  description: 'Higher resolution = larger file, better quality',
}

const qualityOption: RangeOptionSchema = {
  id: 'quality',
  type: 'range',
  label: 'Quality',
  min: 1,
  max: 100,
  step: 1,
  default: 85,
  unit: '%',
  description: 'For JPEG/WebP only. Higher = better quality, larger file.',
}

const optionsSchema: OptionSchema[] = [
  formatOption,
  scaleOption,
  qualityOption,
]

// ============================================================================
// PDF to Image Converter
// ============================================================================

export const pdfToImage: Converter = {
  id: 'pdf-to-image',
  label: 'PDF to Image (First Page)',
  category: 'PDF',
  inputs: [PDF_TYPE],
  outputs: [PNG_TYPE, JPEG_TYPE, WEBP_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: true,
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return file.type === 'application/pdf' || ext === 'pdf'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const scale = parseFloat((input.options?.scale as string) || '2')
    const format = (input.options?.format as string) || 'png'
    
    // Rough estimate based on scale and format
    const formatMultiplier = format === 'png' ? 0.5 : format === 'jpeg' ? 0.2 : 0.15
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * scale * formatMultiplier),
      estimatedTime: Math.max(500, input.files.length * 500 + totalSize / 20000),
      warnings: [
        'Only the first page of each PDF will be converted.',
        'Multi-page PDF to image support coming in a future update.',
      ],
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    let totalInputSize = 0
    let totalOutputSize = 0
    
    // Parse options
    const format = (input.options?.format as string) || 'png'
    const scale = parseFloat((input.options?.scale as string) || '2')
    const quality = ((input.options?.quality as number) || 85) / 100
    
    const outputFormat = OUTPUT_FORMATS[format] || OUTPUT_FORMATS.png
    
    // Check WebP support
    if (format === 'webp' && !isWebPSupported()) {
      return {
        success: false,
        error: 'WebP format is not supported by your browser. Please choose PNG or JPEG.',
      }
    }

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading PDF.js library',
      })

      // Dynamically import pdfjs-dist
      const pdfjs = await import('pdfjs-dist')
      
      // Configure pdf.js worker for local-only operation (no CDN)
      // For first-page-only conversion, we disable the worker and run in main thread.
      // This avoids CDN dependencies and complex worker bundling while being
      // performant enough for single-page extraction.
      // Note: Multi-page support in the future may need a proper worker setup.
      if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
        // Disable worker - pdf.js will run in main thread
        // This is fine for first-page-only conversion
        pdfjs.GlobalWorkerOptions.workerSrc = ''
      }
      
      const outputFiles: { name: string; mimeType: string; data: Blob }[] = []
      const warnings: string[] = [
        'Only the first page of each PDF was converted.',
        'Multi-page PDF to image support coming in a future update.',
      ]

      // Process each PDF
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Processing ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        try {
          // Load the PDF
          const arrayBuffer = await file.arrayBuffer()
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
          const pdf = await loadingTask.promise
          
          // Check page count for warning
          if (pdf.numPages > 1) {
            warnings.push(`${file.name}: Has ${pdf.numPages} pages, only first page converted`)
          }

          onProgress?.({
            percent: Math.round((i / input.files.length) * 80) + 5,
            stage: `Rendering ${file.name}`,
            bytesProcessed: totalInputSize,
          })

          // Get the first page
          const page = await pdf.getPage(1)
          
          // Calculate viewport with scale
          const viewport = page.getViewport({ scale })
          
          // Create canvas
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          
          const context = canvas.getContext('2d')
          if (!context) {
            throw new Error('Failed to get canvas context')
          }

          // For JPEG, fill with white background (PDF may have transparency)
          if (format === 'jpeg') {
            context.fillStyle = '#FFFFFF'
            context.fillRect(0, 0, canvas.width, canvas.height)
          }

          // Render the page
          await page.render({
            canvasContext: context,
            viewport,
          }).promise

          onProgress?.({
            percent: Math.round((i / input.files.length) * 80) + 10,
            stage: `Encoding ${file.name}`,
            bytesProcessed: totalInputSize,
          })

          // Convert canvas to blob
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => {
                if (b) {
                  resolve(b)
                } else {
                  reject(new Error('Failed to create image blob'))
                }
              },
              outputFormat.mimeType,
              outputFormat.supportsQuality ? quality : undefined
            )
          })

          totalOutputSize += blob.size

          // Generate output filename
          const outputName = `${getBaseName(file.name)}_page1.${outputFormat.extension}`

          outputFiles.push({
            name: outputName,
            mimeType: outputFormat.mimeType,
            data: blob,
          })

          // Clean up
          pdf.destroy()
        } catch (fileError) {
          const errorMsg = fileError instanceof Error ? fileError.message : 'Unknown error'
          
          if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
            warnings.push(`${file.name}: Skipped (password protected)`)
          } else if (errorMsg.includes('Invalid') || errorMsg.includes('corrupt')) {
            warnings.push(`${file.name}: Skipped (invalid or corrupted PDF)`)
          } else {
            warnings.push(`${file.name}: Failed (${errorMsg})`)
          }
        }
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      if (outputFiles.length === 0) {
        return {
          success: false,
          error: 'No PDFs could be converted. They may be password-protected or corrupted.',
        }
      }

      return {
        success: true,
        files: outputFiles,
        warnings,
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
        error: error instanceof Error ? error.message : 'Failed to convert PDF to image',
      }
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register PDF to image converter
 */
export function registerPdfToImageConverter(
  register: (converter: Converter, priority?: number) => void
): void {
  register(pdfToImage, 20)
}
