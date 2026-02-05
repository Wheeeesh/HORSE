/**
 * Image to PDF Converter
 * 
 * Converts one or more images into a single PDF document.
 * Features:
 * - Multiple images → one PDF with one image per page
 * - Page size options: A4, Letter, or Auto (fit to image)
 * - Margin configuration
 * - Fit modes: contain (fit within margins) or cover (fill page)
 * - Deterministic page order = selected file order
 * 
 * Uses jsPDF library (bundled locally, no network calls).
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  SelectOptionSchema,
  NumberOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** Supported image input types */
const IMAGE_TYPES = [
  { mimeType: 'image/png', extensions: ['png'], label: 'PNG' },
  { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG' },
  { mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' },
  { mimeType: 'image/gif', extensions: ['gif'], label: 'GIF' },
  { mimeType: 'image/bmp', extensions: ['bmp'], label: 'BMP' },
]

/** PDF output type */
const PDF_TYPE = { mimeType: 'application/pdf', extensions: ['pdf'], label: 'PDF' }

/** Page size presets in mm */
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  a3: { width: 297, height: 420 },
  a5: { width: 148, height: 210 },
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
 * Get base filename without extension
 */
function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename
  return filename.slice(0, lastDot)
}

/**
 * Check if a file is a supported image type
 */
function isImageFile(file: File): boolean {
  const ext = getExtension(file.name)
  const imageExts = IMAGE_TYPES.flatMap(t => t.extensions)
  const imageMimes = IMAGE_TYPES.map(t => t.mimeType)
  
  return imageExts.includes(ext) || imageMimes.includes(file.type)
}

/**
 * Load an image from a File object and get its dimensions
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
 * Convert image to data URL for embedding in PDF
 */
async function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Get image format for jsPDF from MIME type or extension
 */
function getImageFormat(file: File): 'JPEG' | 'PNG' | 'WEBP' | 'GIF' {
  const ext = getExtension(file.name)
  
  if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'JPEG'
  if (file.type === 'image/png' || ext === 'png') return 'PNG'
  if (file.type === 'image/webp' || ext === 'webp') return 'WEBP'
  if (file.type === 'image/gif' || ext === 'gif') return 'GIF'
  
  // Default to JPEG for unknown formats
  return 'JPEG'
}

/**
 * Calculate image placement on page
 */
interface ImagePlacement {
  x: number
  y: number
  width: number
  height: number
}

function calculatePlacement(
  imgWidth: number,
  imgHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  fitMode: 'contain' | 'cover'
): ImagePlacement {
  const availableWidth = pageWidth - (margin * 2)
  const availableHeight = pageHeight - (margin * 2)
  
  const imgAspect = imgWidth / imgHeight
  const areaAspect = availableWidth / availableHeight
  
  let width: number
  let height: number
  
  if (fitMode === 'contain') {
    // Fit entire image within available area
    if (imgAspect > areaAspect) {
      // Image is wider than area - fit to width
      width = availableWidth
      height = availableWidth / imgAspect
    } else {
      // Image is taller than area - fit to height
      height = availableHeight
      width = availableHeight * imgAspect
    }
  } else {
    // Cover - fill area, may crop
    if (imgAspect > areaAspect) {
      // Image is wider - fit to height, crop width
      height = availableHeight
      width = availableHeight * imgAspect
    } else {
      // Image is taller - fit to width, crop height
      width = availableWidth
      height = availableWidth / imgAspect
    }
  }
  
  // Center image on page
  const x = margin + (availableWidth - width) / 2
  const y = margin + (availableHeight - height) / 2
  
  return { x, y, width, height }
}

// ============================================================================
// Option Schemas
// ============================================================================

const pageSizeOption: SelectOptionSchema = {
  id: 'pageSize',
  type: 'select',
  label: 'Page Size',
  options: [
    { value: 'auto', label: 'Auto (fit to image)' },
    { value: 'a4', label: 'A4 (210 × 297 mm)' },
    { value: 'letter', label: 'Letter (8.5 × 11 in)' },
    { value: 'a3', label: 'A3 (297 × 420 mm)' },
    { value: 'a5', label: 'A5 (148 × 210 mm)' },
    { value: 'legal', label: 'Legal (8.5 × 14 in)' },
  ],
  default: 'a4',
}

const orientationOption: SelectOptionSchema = {
  id: 'orientation',
  type: 'select',
  label: 'Orientation',
  options: [
    { value: 'auto', label: 'Auto (match image)' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
  ],
  default: 'auto',
  description: 'Page orientation (ignored for Auto page size)',
}

const fitModeOption: SelectOptionSchema = {
  id: 'fitMode',
  type: 'select',
  label: 'Fit Mode',
  options: [
    { value: 'contain', label: 'Contain (fit entire image)' },
    { value: 'cover', label: 'Cover (fill page, may crop)' },
  ],
  default: 'contain',
  description: 'How to fit images on pages',
}

const marginOption: NumberOptionSchema = {
  id: 'margin',
  type: 'number',
  label: 'Margin',
  min: 0,
  max: 50,
  default: 10,
  description: 'Page margin in mm',
}

const optionsSchema: OptionSchema[] = [
  pageSizeOption,
  orientationOption,
  fitModeOption,
  marginOption,
]

// ============================================================================
// Image to PDF Converter
// ============================================================================

export const imageToPdf: Converter = {
  id: 'images-to-pdf',
  label: 'Images to PDF',
  category: 'PDF',
  inputs: IMAGE_TYPES,
  outputs: [PDF_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: true,
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(isImageFile)
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    // PDF with embedded images is typically similar size to original images
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 0.8),
      estimatedTime: Math.max(500, input.files.length * 200 + totalSize / 50000),
      warnings: input.files.length > 50 
        ? ['Large number of images may take a while to process']
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
    const pageSize = (input.options?.pageSize as string) || 'a4'
    const orientation = (input.options?.orientation as string) || 'auto'
    const fitMode = (input.options?.fitMode as 'contain' | 'cover') || 'contain'
    const margin = (input.options?.margin as number) ?? 10

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading jsPDF library',
      })

      // Dynamically import jsPDF
      const { jsPDF } = await import('jspdf')
      
      // Determine if we need to create PDF upfront or per-page
      let doc: InstanceType<typeof jsPDF> | null = null
      
      // Process each image
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round(((i + 0.2) / input.files.length) * 90),
          stage: `Loading ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Load image to get dimensions
        const img = await loadImage(file)
        const imgWidth = img.width
        const imgHeight = img.height
        
        // Get image data URL
        const dataUrl = await imageToDataUrl(file)
        const imgFormat = getImageFormat(file)

        onProgress?.({
          percent: Math.round(((i + 0.5) / input.files.length) * 90),
          stage: `Processing ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Calculate page dimensions
        let pageWidth: number
        let pageHeight: number
        let pageOrientation: 'portrait' | 'landscape'

        if (pageSize === 'auto') {
          // Use image dimensions (convert pixels to mm at 96 DPI)
          const pxToMm = 25.4 / 96
          pageWidth = imgWidth * pxToMm + (margin * 2)
          pageHeight = imgHeight * pxToMm + (margin * 2)
          pageOrientation = pageWidth > pageHeight ? 'landscape' : 'portrait'
        } else {
          const preset = PAGE_SIZES[pageSize]
          
          // Determine orientation
          if (orientation === 'auto') {
            // Match image aspect ratio
            const imgAspect = imgWidth / imgHeight
            pageOrientation = imgAspect > 1 ? 'landscape' : 'portrait'
          } else {
            pageOrientation = orientation as 'portrait' | 'landscape'
          }
          
          // Set page dimensions based on orientation
          if (pageOrientation === 'landscape') {
            pageWidth = preset.height
            pageHeight = preset.width
          } else {
            pageWidth = preset.width
            pageHeight = preset.height
          }
        }

        // Create PDF on first image or add new page
        if (i === 0) {
          doc = new jsPDF({
            orientation: pageOrientation,
            unit: 'mm',
            format: pageSize === 'auto' ? [pageWidth, pageHeight] : pageSize,
            compress: true,
          })
        } else {
          // Add a new page for subsequent images
          doc!.addPage(
            pageSize === 'auto' ? [pageWidth, pageHeight] : pageSize,
            pageOrientation
          )
        }

        // Calculate image placement
        const placement = calculatePlacement(
          imgWidth,
          imgHeight,
          pageWidth,
          pageHeight,
          margin,
          fitMode
        )

        // Add image to PDF
        try {
          doc!.addImage(
            dataUrl,
            imgFormat,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            undefined, // alias
            'FAST', // compression type
            0 // rotation
          )
        } catch (imgError) {
          // If specific format fails, try as JPEG
          doc!.addImage(
            dataUrl,
            'JPEG',
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            undefined,
            'FAST',
            0
          )
        }

        onProgress?.({
          percent: Math.round(((i + 1) / input.files.length) * 90),
          stage: `Added page ${i + 1} of ${input.files.length}`,
          bytesProcessed: totalInputSize,
        })
      }

      if (!doc) {
        return {
          success: false,
          error: 'No images to convert',
        }
      }

      onProgress?.({
        percent: 95,
        stage: 'Generating PDF',
        bytesProcessed: totalInputSize,
      })

      // Generate PDF blob
      const pdfBlob = doc.output('blob')

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      // Generate output filename
      let outputName: string
      if (input.files.length === 1) {
        outputName = `${getBaseName(input.files[0].name)}.pdf`
      } else {
        outputName = `images_${input.files.length}_pages.pdf`
      }

      return {
        success: true,
        files: [{
          name: outputName,
          mimeType: 'application/pdf',
          data: pdfBlob,
        }],
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: pdfBlob.size,
          compressionRatio: pdfBlob.size / totalInputSize,
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
 * Register image to PDF converter
 */
export function registerImageToPdfConverter(
  register: (converter: Converter, priority?: number) => void
): void {
  register(imageToPdf, 20)
}
