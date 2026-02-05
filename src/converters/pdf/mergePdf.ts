/**
 * Merge PDFs Converter
 * 
 * Merges multiple PDF files into a single PDF document.
 * Features:
 * - Merges PDFs in selected file order
 * - Optional page range selection per document
 * - Progress tracking during merge
 * - Preserves PDF metadata and structure
 * 
 * Uses pdf-lib library (bundled locally, no network calls).
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
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

// ============================================================================
// Page Range Parsing
// ============================================================================

/**
 * Parse a page range string into an array of page indices (0-based).
 * 
 * Syntax:
 * - "1-3" → pages 1, 2, 3 (indices 0, 1, 2)
 * - "1,3,5" → pages 1, 3, 5
 * - "1-3,5,7-10" → pages 1, 2, 3, 5, 7, 8, 9, 10
 * - "" or "all" → all pages
 * 
 * @param rangeStr The page range string
 * @param totalPages Total number of pages in the document
 * @returns Array of 0-based page indices
 */
function parsePageRange(rangeStr: string, totalPages: number): number[] {
  const trimmed = rangeStr.trim().toLowerCase()
  
  // Empty or "all" means all pages
  if (!trimmed || trimmed === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i)
  }
  
  const indices: Set<number> = new Set()
  
  // Split by comma
  const parts = trimmed.split(',')
  
  for (const part of parts) {
    const trimmedPart = part.trim()
    
    if (trimmedPart.includes('-')) {
      // Range: "1-5"
      const [startStr, endStr] = trimmedPart.split('-')
      const start = parseInt(startStr.trim(), 10)
      const end = parseInt(endStr.trim(), 10)
      
      if (!isNaN(start) && !isNaN(end)) {
        // Convert to 0-based and clamp to valid range
        const startIdx = Math.max(0, Math.min(start - 1, totalPages - 1))
        const endIdx = Math.max(0, Math.min(end - 1, totalPages - 1))
        
        // Add all pages in range
        for (let i = Math.min(startIdx, endIdx); i <= Math.max(startIdx, endIdx); i++) {
          indices.add(i)
        }
      }
    } else {
      // Single page: "5"
      const pageNum = parseInt(trimmedPart, 10)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        indices.add(pageNum - 1) // Convert to 0-based
      }
    }
  }
  
  // If no valid pages found, return all pages
  if (indices.size === 0) {
    return Array.from({ length: totalPages }, (_, i) => i)
  }
  
  // Sort indices
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Parse page ranges configuration.
 * Format: "file1: 1-3, 5; file2: all; file3: 2-4"
 * Or simple format for all files: "1-5" (applies to all)
 */
function parsePageRanges(
  config: string,
  fileNames: string[]
): Map<number, string> {
  const result = new Map<number, string>()
  const trimmed = config.trim()
  
  if (!trimmed) {
    return result // Empty means all pages for all files
  }
  
  // Check if it contains file-specific ranges (has semicolons or colons)
  if (trimmed.includes(':')) {
    // File-specific format: "file1: 1-3; file2: 4-6"
    const fileParts = trimmed.split(';')
    
    for (const filePart of fileParts) {
      const colonIdx = filePart.indexOf(':')
      if (colonIdx === -1) continue
      
      const fileSpec = filePart.slice(0, colonIdx).trim().toLowerCase()
      const rangeSpec = filePart.slice(colonIdx + 1).trim()
      
      // Try to match by file number (1, 2, 3...) or partial name
      if (/^\d+$/.test(fileSpec)) {
        const fileIdx = parseInt(fileSpec, 10) - 1
        if (fileIdx >= 0 && fileIdx < fileNames.length) {
          result.set(fileIdx, rangeSpec)
        }
      } else {
        // Match by partial filename
        for (let i = 0; i < fileNames.length; i++) {
          if (fileNames[i].toLowerCase().includes(fileSpec)) {
            result.set(i, rangeSpec)
            break
          }
        }
      }
    }
  } else {
    // Simple format: apply same range to all files
    for (let i = 0; i < fileNames.length; i++) {
      result.set(i, trimmed)
    }
  }
  
  return result
}

// ============================================================================
// Option Schemas
// ============================================================================

const pageRangesOption: StringOptionSchema = {
  id: 'pageRanges',
  type: 'string',
  label: 'Page Ranges',
  default: '',
  placeholder: 'e.g., 1-3,5 or 1: 1-5; 2: all',
  description: 'Leave empty for all pages. Format: "1-3,5" for all files, or "1: 1-5; 2: 3-7" per file',
}

const filenameOption: StringOptionSchema = {
  id: 'filename',
  type: 'string',
  label: 'Output Filename',
  default: 'merged',
  placeholder: 'merged',
  description: 'Output filename (without .pdf extension)',
}

const optionsSchema: OptionSchema[] = [
  pageRangesOption,
  filenameOption,
]

// ============================================================================
// Merge PDFs Converter
// ============================================================================

export const mergePdf: Converter = {
  id: 'merge-pdf',
  label: 'Merge PDFs',
  category: 'PDF',
  inputs: [PDF_TYPE],
  outputs: [PDF_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: true,
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length < 2) return false // Need at least 2 PDFs to merge
    return files.every(file => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return file.type === 'application/pdf' || ext === 'pdf'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 0.95), // Slightly smaller due to deduplication
      estimatedTime: Math.max(500, input.files.length * 300 + totalSize / 50000),
      warnings: input.files.length > 20 
        ? ['Merging many PDFs may take a while']
        : undefined,
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    let totalInputSize = 0
    
    // Parse options
    const pageRangesConfig = (input.options?.pageRanges as string) || ''
    const outputFilename = (input.options?.filename as string) || 'merged'
    
    // Get filenames for page range parsing
    const fileNames = input.files.map(f => f.name)
    const pageRanges = parsePageRanges(pageRangesConfig, fileNames)

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading pdf-lib library',
      })

      // Dynamically import pdf-lib
      const { PDFDocument } = await import('pdf-lib')
      
      onProgress?.({
        percent: 5,
        stage: 'Creating merged document',
      })

      // Create a new PDF document for the merged output
      const mergedPdf = await PDFDocument.create()
      
      const warnings: string[] = []
      let totalPages = 0

      // Process each PDF
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: 5 + Math.round((i / input.files.length) * 85),
          stage: `Processing ${file.name} (${i + 1}/${input.files.length})`,
          bytesProcessed: totalInputSize,
        })

        try {
          // Read the PDF file
          const arrayBuffer = await file.arrayBuffer()
          const pdfBytes = new Uint8Array(arrayBuffer)
          
          // Load the PDF document
          const sourcePdf = await PDFDocument.load(pdfBytes, {
            ignoreEncryption: true, // Try to handle encrypted PDFs
          })
          
          const sourcePageCount = sourcePdf.getPageCount()
          
          // Determine which pages to include
          const rangeSpec = pageRanges.get(i) || ''
          const pageIndices = parsePageRange(rangeSpec, sourcePageCount)
          
          // Copy the specified pages
          const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices)
          
          for (const page of copiedPages) {
            mergedPdf.addPage(page)
            totalPages++
          }
          
          // Add info about pages copied
          if (rangeSpec && pageIndices.length < sourcePageCount) {
            warnings.push(`${file.name}: Included pages ${pageIndices.map(p => p + 1).join(', ')} of ${sourcePageCount}`)
          }
        } catch (fileError) {
          const errorMsg = fileError instanceof Error ? fileError.message : 'Unknown error'
          
          // Check for specific error types
          if (errorMsg.includes('encrypted') || errorMsg.includes('password')) {
            warnings.push(`${file.name}: Skipped (password protected)`)
          } else if (errorMsg.includes('Invalid') || errorMsg.includes('corrupt')) {
            warnings.push(`${file.name}: Skipped (invalid or corrupted PDF)`)
          } else {
            warnings.push(`${file.name}: Skipped (${errorMsg})`)
          }
        }
      }

      // Check if we have any pages
      if (totalPages === 0) {
        return {
          success: false,
          error: 'No pages could be merged. All PDFs may be password-protected or corrupted.',
        }
      }

      onProgress?.({
        percent: 95,
        stage: `Generating merged PDF (${totalPages} pages)`,
        bytesProcessed: totalInputSize,
      })

      // Save the merged PDF
      const mergedBytes = await mergedPdf.save()
      const mergedBlob = new Blob([mergedBytes], { type: 'application/pdf' })

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      // Generate output filename
      const finalFilename = outputFilename.endsWith('.pdf') 
        ? outputFilename 
        : `${outputFilename}.pdf`

      return {
        success: true,
        files: [{
          name: finalFilename,
          mimeType: 'application/pdf',
          data: mergedBlob,
        }],
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: mergedBlob.size,
          compressionRatio: mergedBlob.size / totalInputSize,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge PDFs',
      }
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register PDF converters
 */
export function registerPdfConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(mergePdf, 20)
}
