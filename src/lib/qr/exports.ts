/**
 * QR Code export utilities
 * Handles downloading QR codes as PNG, SVG, or PDF
 * 
 * Filename format: qr_{type}_{timestamp}.{ext}
 * - type: lowercase QR type (url, text, wifi, etc.)
 * - timestamp: Unix epoch milliseconds
 * - ext: png, svg, or pdf
 */

import type { QRType } from './formatters'

/**
 * Generate a deterministic filename for QR code downloads
 */
function generateFilename(type: QRType, extension: 'png' | 'svg' | 'pdf'): string {
  const timestamp = Date.now()
  const typeLower = type.toLowerCase()
  return `qr_${typeLower}_${timestamp}.${extension}`
}

/**
 * Trigger a file download in the browser
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Download QR code as SVG (vector, not rasterized)
 */
export function downloadSVG(svgMarkup: string, type: QRType): void {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
  const filename = generateFilename(type, 'svg')
  triggerDownload(blob, filename)
}

/**
 * Download QR code as PNG (rasterized from SVG)
 */
export async function downloadPNG(
  svgMarkup: string,
  type: QRType,
  size: number = 512
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create an image from SVG
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      // Create canvas and draw image
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not get canvas context'))
        return
      }

      // Draw the SVG onto the canvas
      ctx.drawImage(img, 0, 0, size, size)

      // Convert canvas to PNG blob and download
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) {
          reject(new Error('Could not create PNG blob'))
          return
        }
        const filename = generateFilename(type, 'png')
        triggerDownload(blob, filename)
        resolve()
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load SVG image'))
    }

    img.src = url
  })
}

/**
 * Download QR code as vector PDF (not rasterized)
 * Uses jsPDF + svg2pdf.js to convert SVG paths to PDF vector paths
 */
export async function downloadPDF(
  svgMarkup: string,
  type: QRType,
  size: number = 256
): Promise<void> {
  // Dynamically import jsPDF and svg2pdf.js to keep bundle size down
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
  ])

  // Parse SVG markup into a DOM element
  const parser = new DOMParser()
  const svgDoc = parser.parseFromString(svgMarkup, 'image/svg+xml')
  const svgElement = svgDoc.documentElement as unknown as SVGElement

  // Check for parsing errors
  const parseError = svgDoc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Failed to parse SVG markup')
  }

  // Get SVG dimensions from viewBox or width/height attributes
  const viewBox = svgElement.getAttribute('viewBox')
  let svgWidth = size
  let svgHeight = size

  if (viewBox) {
    const parts = viewBox.split(/\s+|,/).map(Number)
    if (parts.length === 4) {
      svgWidth = parts[2]
      svgHeight = parts[3]
    }
  }

  // Create PDF with appropriate page size (add small margin)
  const margin = 10
  const pdfWidth = svgWidth + margin * 2
  const pdfHeight = svgHeight + margin * 2

  // Determine orientation based on aspect ratio
  const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait'

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pdfWidth, pdfHeight],
  })

  // Convert SVG to PDF vector paths (not rasterized)
  await svg2pdf(svgElement, pdf, {
    x: margin,
    y: margin,
    width: svgWidth,
    height: svgHeight,
  })

  // Save the PDF
  const filename = generateFilename(type, 'pdf')
  pdf.save(filename)
}
