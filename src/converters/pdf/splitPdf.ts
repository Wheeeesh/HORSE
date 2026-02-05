/**
 * Split/Extract PDF Pages Converter
 * 
 * Extracts page ranges from a PDF into separate PDF files.
 * Features:
 * - Extract specific page ranges into individual PDFs
 * - Multiple ranges produce multiple output files
 * - Deterministic output naming
 * - Progress tracking during extraction
 * 
 * Uses pdf-lib library (bundled locally, no network calls).
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  StringOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** PDF type */
const PDF_TYPE = { 
  mimeType: 'application/pdf', 
  extensions: ['pdf'], 
  label: 'PDF' 
}

/**
 * Parsed page range with start and end (1-based, inclusive)
 */
interface PageRange {
  start: number
  end: number
  label: string // For output naming, e.g., "1-3" or "5"
}

// ============================================================================
// Page Range Parsing
// ============================================================================

/**
 * Parse a page ranges string into an array of PageRange objects.
 * 
 * Syntax:
 * - "1-3" → one range: pages 1 to 3
 * - "1-3, 5-7, 10" → three ranges: 1-3, 5-7, and page 10
 * - "1-3; 5-7" → semicolon also works as separator
 * 
 * Each range becomes a separate output PDF.
 * 
 * @param rangeStr The page ranges string
 * @param totalPages Total number of pages in the source document
 * @returns Array of PageRange objects
 */
function parsePageRanges(rangeStr: string, totalPages: number): PageRange[] {
  const trimmed = rangeStr.trim()
  
  if (!trimmed) {
    // Default: one range per page (split all)
    return Array.from({ length: totalPages }, (_, i) => ({
      start: i + 1,
      end: i + 1,
      label: String(i + 1),
    }))
  }
  
  const ranges: PageRange[] = []
  
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
        // Clamp to valid range and ensure start <= end
        const validStart = Math.max(1, Math.min(start, totalPages))
        const validEnd = Math.max(1, Math.min(end, totalPages))
        
        ranges.push({
          start: Math.min(validStart, validEnd),
          end: Math.max(validStart, validEnd),
          label: `${Math.min(validStart, validEnd)}-${Math.max(validStart, validEnd)}`,
        })
      }
    } else {
      // Single page: "5"
      const pageNum = parseInt(trimmedPart, 10)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        ranges.push({
          start: pageNum,
          end: pageNum,
          label: String(pageNum),
        })
      }
    }
  }
  
  // If no valid ranges found, return single range with all pages
  if (ranges.length === 0) {
    return [{
      start: 1,
      end: totalPages,
      label: `1-${totalPages}`,
    }]
  }
  
  return ranges
}

/**
 * Get base filename without extension
 */
function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename
  return filename.slice(0, lastDot)
}

/**
 * Generate output filename for a range
 */
function generateOutputName(
  sourceFilename: string,
  rangeLabel: string,
  rangeIndex: number,
  totalRanges: number
): string {
  const baseName = getBaseName(sourceFilename)
  
  if (totalRanges === 1) {
    // Single output: use range label
    return `${baseName}_pages_${rangeLabel}.pdf`
  }
  
  // Multiple outputs: include index for clarity
  const paddedIndex = String(rangeIndex + 1).padStart(2, '0')
  return `${baseName}_part${paddedIndex}_pages_${rangeLabel}.pdf`
}

// ============================================================================
// Option Schemas
// ============================================================================

const pageRangesOption: StringOptionSchema = {
  id: 'ranges',
  type: 'string',
  label: 'Page Ranges',
  default: '',
  placeholder: 'e.g., 1-3, 5, 10-12',
  description: 'Comma-separated ranges. Each range becomes a separate PDF. Leave empty to split into single pages.',
}

const optionsSchema: OptionSchema[] = [
  pageRangesOption,
]

// ============================================================================
// Split PDF Converter
// ============================================================================

export const splitPdf: Converter = {
  id: 'split-pdf',
  label: 'Split/Extract PDF Pages',
  category: 'PDF',
  inputs: [PDF_TYPE],
  outputs: [PDF_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: false, // One PDF at a time
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    return file.type === 'application/pdf' || ext === 'pdf'
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    const rangesStr = (input.options?.ranges as string) || ''
    
    // Rough estimate: each output PDF is roughly proportional to page count
    // Without parsing the PDF, we can't know exact page count, so estimate
    const estimatedRanges = rangesStr ? rangesStr.split(/[,;]/).length : 10
    
    return {
      canConvert: true,
      estimatedSize: Math.round(file.size * estimatedRanges * 0.3),
      estimatedTime: Math.max(500, file.size / 30000 + estimatedRanges * 200),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const file = input.files[0]
    
    // Parse options
    const rangesStr = (input.options?.ranges as string) || ''

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading pdf-lib library',
      })

      // Dynamically import pdf-lib
      const { PDFDocument } = await import('pdf-lib')
      
      onProgress?.({
        percent: 5,
        stage: 'Reading PDF file',
      })

      // Read the source PDF
      const arrayBuffer = await file.arrayBuffer()
      const pdfBytes = new Uint8Array(arrayBuffer)
      
      onProgress?.({
        percent: 10,
        stage: 'Parsing PDF structure',
      })

      // Load the source PDF
      const sourcePdf = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: true,
      })
      
      const totalPages = sourcePdf.getPageCount()
      
      if (totalPages === 0) {
        return {
          success: false,
          error: 'PDF has no pages',
        }
      }

      onProgress?.({
        percent: 15,
        stage: `Found ${totalPages} pages, parsing ranges`,
      })

      // Parse the page ranges
      const ranges = parsePageRanges(rangesStr, totalPages)
      
      if (ranges.length === 0) {
        return {
          success: false,
          error: 'No valid page ranges specified',
        }
      }

      onProgress?.({
        percent: 20,
        stage: `Extracting ${ranges.length} range(s)`,
      })

      // Extract each range into a separate PDF
      const outputFiles: ConvertedFile[] = []
      let totalOutputSize = 0
      const warnings: string[] = []

      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]
        
        onProgress?.({
          percent: 20 + Math.round((i / ranges.length) * 70),
          stage: `Creating PDF for pages ${range.label}`,
        })

        try {
          // Create a new PDF for this range
          const outputPdf = await PDFDocument.create()
          
          // Build array of page indices (0-based)
          const pageIndices: number[] = []
          for (let p = range.start; p <= range.end; p++) {
            pageIndices.push(p - 1) // Convert to 0-based
          }
          
          // Copy pages from source
          const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices)
          
          for (const page of copiedPages) {
            outputPdf.addPage(page)
          }
          
          // Save the output PDF
          const outputBytes = await outputPdf.save()
          const outputBlob = new Blob([outputBytes], { type: 'application/pdf' })
          totalOutputSize += outputBlob.size
          
          // Generate filename
          const outputName = generateOutputName(
            file.name,
            range.label,
            i,
            ranges.length
          )
          
          outputFiles.push({
            name: outputName,
            mimeType: 'application/pdf',
            data: outputBlob,
          })
        } catch (rangeError) {
          const errorMsg = rangeError instanceof Error ? rangeError.message : 'Unknown error'
          warnings.push(`Failed to extract pages ${range.label}: ${errorMsg}`)
        }
      }

      onProgress?.({
        percent: 95,
        stage: 'Finalizing',
      })

      if (outputFiles.length === 0) {
        return {
          success: false,
          error: 'No pages could be extracted',
        }
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: file.size,
        bytesTotal: file.size,
      })

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
      if (errorMsg.includes('encrypted') || errorMsg.includes('password')) {
        return {
          success: false,
          error: 'Cannot split password-protected PDF',
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
 * Register split PDF converter
 */
export function registerSplitPdfConverter(
  register: (converter: Converter, priority?: number) => void
): void {
  register(splitPdf, 20)
}
