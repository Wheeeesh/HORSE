/**
 * Batch QR Code generation utilities
 * Generates multiple QR codes and packages them as a ZIP file
 */

import QRCode from 'qrcode'
import JSZip from 'jszip'
import type { DotStyle, CornerStyle, GradientConfig } from './styles'
import { applyQRStyles } from './styles'
import { embedLogoInSvg, type LogoConfig } from './logo'

export interface BatchQROptions {
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
  size: number
  margin: number
  foreground: string
  background: string
  transparentBackground: boolean
  gradient: GradientConfig
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  logoConfig: LogoConfig
}

export interface BatchProgress {
  current: number
  total: number
  currentItem: string
}

export type ProgressCallback = (progress: BatchProgress) => void

/**
 * Parse textarea content into individual items for QR generation
 * Each non-empty line becomes a separate QR code
 */
export function parseContentLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Generate a deterministic filename for a QR code in the batch
 * Format: qr_XXX_<sanitized_content>.png
 */
export function generateBatchFilename(index: number, content: string): string {
  // Pad index to 3 digits for proper sorting
  const paddedIndex = String(index + 1).padStart(3, '0')
  
  // Sanitize content for filename (first 30 chars, alphanumeric only)
  const sanitized = content
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'qr'
  
  return `qr_${paddedIndex}_${sanitized}.png`
}

/**
 * Convert SVG string to PNG blob using canvas
 */
async function svgToPngBlob(svgString: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to get canvas context'))
        return
      }
      
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(url)
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create PNG blob'))
        }
      }, 'image/png')
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG image'))
    }
    
    img.src = url
  })
}

/**
 * Generate a single QR code as PNG blob
 */
async function generateQRPng(
  content: string,
  options: BatchQROptions
): Promise<Blob> {
  // Generate base SVG
  const baseSvg = await QRCode.toString(content, {
    type: 'svg',
    errorCorrectionLevel: options.errorCorrection,
    color: {
      dark: options.foreground,
      light: options.transparentBackground ? '#00000000' : options.background,
    },
    width: options.size,
    margin: options.margin,
  })
  
  // Apply styles
  let styledSvg = applyQRStyles(baseSvg, {
    dotStyle: options.dotStyle,
    cornerStyle: options.cornerStyle,
    foreground: options.foreground,
    background: options.background,
    transparentBackground: options.transparentBackground,
    gradient: options.gradient,
    size: options.size,
    margin: options.margin,
  })
  
  // Embed logo if enabled
  styledSvg = embedLogoInSvg(styledSvg, options.logoConfig)
  
  // Convert to PNG
  return svgToPngBlob(styledSvg, options.size)
}

/**
 * Generate multiple QR codes and package them as a ZIP file
 */
export async function generateBatchZip(
  contents: string[],
  options: BatchQROptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const zip = new JSZip()
  const total = contents.length
  
  for (let i = 0; i < contents.length; i++) {
    const content = contents[i]
    const filename = generateBatchFilename(i, content)
    
    // Report progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        currentItem: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
      })
    }
    
    try {
      const pngBlob = await generateQRPng(content, options)
      zip.file(filename, pngBlob)
    } catch (err) {
      console.error(`Failed to generate QR for "${content}":`, err)
      // Continue with other items
    }
  }
  
  // Generate ZIP blob
  return zip.generateAsync({ type: 'blob' })
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
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
 * Generate batch ZIP filename with timestamp
 */
export function generateZipFilename(): string {
  const timestamp = Date.now()
  return `qr_batch_${timestamp}.zip`
}
