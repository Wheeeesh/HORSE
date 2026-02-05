/**
 * QR Code clipboard utilities
 * Copies QR code as PNG image to clipboard using Clipboard API
 * Feature-detects support; no polyfills
 */

export type CopyResult = {
  success: boolean
  message: string
}

/**
 * Check if clipboard write is supported
 */
export function isClipboardSupported(): boolean {
  return !!(
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  )
}

/**
 * Copy QR code SVG as PNG image to clipboard
 */
export async function copyQRToClipboard(
  svgMarkup: string,
  size: number = 512
): Promise<CopyResult> {
  // Feature detection
  if (!isClipboardSupported()) {
    return {
      success: false,
      message: 'Clipboard not supported in this browser',
    }
  }

  try {
    // Convert SVG to PNG blob
    const pngBlob = await svgToPngBlob(svgMarkup, size)

    // Write to clipboard
    const clipboardItem = new ClipboardItem({
      'image/png': pngBlob,
    })
    await navigator.clipboard.write([clipboardItem])

    return {
      success: true,
      message: 'Copied to clipboard',
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err)
    
    // Provide specific error messages
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        return {
          success: false,
          message: 'Clipboard access denied',
        }
      }
    }
    
    return {
      success: false,
      message: 'Failed to copy',
    }
  }
}

/**
 * Convert SVG markup to PNG blob
 */
function svgToPngBlob(svgMarkup: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, size, size)

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) {
          reject(new Error('Could not create PNG blob'))
          return
        }
        resolve(blob)
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load SVG image'))
    }

    img.src = url
  })
}
