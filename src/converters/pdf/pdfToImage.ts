/**
 * PDF to Image Converter
 * 
 * Converts PDF pages to PNG, JPEG, or WebP images.
 * Features:
 * - Page range support (e.g., "1-3, 5, 10-12")
 * - Multiple output images named with page numbers
 * - Scale/DPI option for output resolution
 * - Output format selection (PNG, JPEG, WebP)
 * - Quality option for lossy formats
 * - Progress updates per page
 * - Cancellation support
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
  StringOptionSchema,
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
// Page Range Parsing
// ============================================================================

/**
 * Parsed page range with start and end (1-based, inclusive)
 */
interface PageRange {
  start: number
  end: number
  label: string // For output naming, e.g., "1-3" or "5"
}

/**
 * Parse a page ranges string into an array of PageRange objects.
 * 
 * Syntax:
 * - "1-3" → pages 1, 2, 3
 * - "1-3, 5-7, 10" → pages 1-3, 5-7, and page 10
 * - "" (empty) → first page only (default)
 * - "all" → all pages
 * 
 * @param rangeStr The page ranges string
 * @param totalPages Total number of pages in the source document
 * @returns Array of page numbers (1-based)
 */
function parsePageRanges(rangeStr: string, totalPages: number): number[] {
  const trimmed = rangeStr.trim().toLowerCase()
  
  // Default: first page only
  if (!trimmed) {
    return [1]
  }
  
  // "all" keyword: all pages
  if (trimmed === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  
  const pages = new Set<number>()
  
  // Split by comma or semicolon
  const parts = trimmed.split(/[,;]/)
  
  for (const part of parts) {
    const trimmedPart = part.trim()
    if (!trimmedPart) continue
    
    if (trimmedPart.includes('-')) {
      // Range: "1-5"
      const [startStr, endStr] = trimmedPart.split('-')
      const start = parseInt(startStr.trim(), 10)
      const end = parseInt(endStr.trim(), 10)
      
      if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= 1) {
        // Clamp to valid range
        const validStart = Math.max(1, Math.min(start, totalPages))
        const validEnd = Math.max(1, Math.min(end, totalPages))
        const rangeStart = Math.min(validStart, validEnd)
        const rangeEnd = Math.max(validStart, validEnd)
        
        for (let p = rangeStart; p <= rangeEnd; p++) {
          pages.add(p)
        }
      }
    } else {
      // Single page: "5"
      const pageNum = parseInt(trimmedPart, 10)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        pages.add(pageNum)
      }
    }
  }
  
  // If no valid pages found, return first page only
  if (pages.size === 0) {
    return [1]
  }
  
  // Return sorted array
  return Array.from(pages).sort((a, b) => a - b)
}

/**
 * Generate output filename for a page
 */
function generateOutputName(
  sourceFilename: string,
  pageNum: number,
  totalPages: number,
  extension: string
): string {
  const baseName = getBaseName(sourceFilename)
  const padWidth = String(totalPages).length
  const paddedPage = String(pageNum).padStart(padWidth, '0')
  return `${baseName}_page${paddedPage}.${extension}`
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

const pageRangesOption: StringOptionSchema = {
  id: 'pages',
  type: 'string',
  label: 'Pages',
  default: '',
  placeholder: 'e.g., 1-3, 5, 10-12 or "all"',
  description: 'Page ranges to convert. Leave empty for first page only. Use "all" for all pages.',
}

const optionsSchema: OptionSchema[] = [
  pageRangesOption,
  formatOption,
  scaleOption,
  qualityOption,
]

// ============================================================================
// PDF to Image Converter
// ============================================================================

export const pdfToImage: Converter = {
  id: 'pdf-to-image',
  label: 'PDF to Images',
  category: 'PDF',
  inputs: [PDF_TYPE],
  outputs: [PNG_TYPE, JPEG_TYPE, WEBP_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: false, // Process one PDF at a time for better progress tracking
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    return file.type === 'application/pdf' || ext === 'pdf'
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    const scale = parseFloat((input.options?.scale as string) || '2')
    const format = (input.options?.format as string) || 'png'
    const pagesStr = (input.options?.pages as string) || ''
    
    // Rough estimate based on scale and format
    const formatMultiplier = format === 'png' ? 0.5 : format === 'jpeg' ? 0.2 : 0.15
    
    // Estimate page count from ranges string
    const isAllPages = pagesStr.trim().toLowerCase() === 'all'
    const rangeCount = pagesStr ? pagesStr.split(/[,;-]/).length : 1
    const estimatedPages = isAllPages ? 10 : Math.max(1, rangeCount)
    
    return {
      canConvert: true,
      estimatedSize: Math.round(file.size * scale * formatMultiplier * estimatedPages),
      estimatedTime: Math.max(500, estimatedPages * 500 + file.size / 20000),
      warnings: pagesStr ? undefined : [
        'Only the first page will be converted by default.',
        'Use "all" or specify page ranges (e.g., "1-5, 10") to convert multiple pages.',
      ],
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const file = input.files[0]
    let totalOutputSize = 0
    
    // Parse options
    const format = (input.options?.format as string) || 'png'
    const scale = parseFloat((input.options?.scale as string) || '2')
    const quality = ((input.options?.quality as number) || 85) / 100
    const pagesStr = (input.options?.pages as string) || ''
    
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
      if (typeof window !== 'undefined') {
        const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
        }
      }

      onProgress?.({
        percent: 5,
        stage: 'Reading PDF file',
      })

      // Load the PDF
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise
      const totalPages = pdf.numPages

      onProgress?.({
        percent: 10,
        stage: `Found ${totalPages} pages, parsing ranges`,
      })

      // Parse page ranges
      const pagesToConvert = parsePageRanges(pagesStr, totalPages)
      const pageCount = pagesToConvert.length

      onProgress?.({
        percent: 15,
        stage: `Converting ${pageCount} page${pageCount > 1 ? 's' : ''}`,
      })

      const outputFiles: { name: string; mimeType: string; data: Blob }[] = []
      const warnings: string[] = []

      // Process each page
      for (let i = 0; i < pagesToConvert.length; i++) {
        const pageNum = pagesToConvert[i]
        
        // Calculate progress: 15% setup + 80% for pages + 5% finalize
        const pageProgress = 15 + Math.round((i / pageCount) * 80)
        
        onProgress?.({
          percent: pageProgress,
          stage: `Rendering page ${pageNum} of ${totalPages} (${i + 1}/${pageCount})`,
          bytesProcessed: totalOutputSize,
        })

        try {
          // Get the page
          const page = await pdf.getPage(pageNum)
          
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

          // Generate output filename with page number
          const outputName = generateOutputName(
            file.name,
            pageNum,
            totalPages,
            outputFormat.extension
          )

          outputFiles.push({
            name: outputName,
            mimeType: outputFormat.mimeType,
            data: blob,
          })
          
          // Clean up canvas to free memory
          canvas.width = 0
          canvas.height = 0
        } catch (pageError) {
          const errorMsg = pageError instanceof Error ? pageError.message : 'Unknown error'
          warnings.push(`Page ${pageNum}: Failed (${errorMsg})`)
        }
      }

      // Clean up
      pdf.destroy()

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: file.size,
        bytesTotal: file.size,
      })

      if (outputFiles.length === 0) {
        return {
          success: false,
          error: 'No pages could be converted. The PDF may be password-protected or corrupted.',
        }
      }

      // Add summary info
      if (pageCount > 1) {
        warnings.unshift(`Converted ${outputFiles.length} of ${pageCount} requested pages`)
      }

      return {
        success: true,
        files: outputFiles,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: file.size,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / file.size,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      // Check for specific errors
      if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
        return {
          success: false,
          error: 'Cannot convert password-protected PDF',
        }
      }
      
      if (errorMsg.includes('Invalid') || errorMsg.includes('corrupt')) {
        return {
          success: false,
          error: 'Invalid or corrupted PDF file',
        }
      }
      
      return {
        success: false,
        error: errorMsg,
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
