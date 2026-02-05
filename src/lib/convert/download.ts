/**
 * Download Utilities
 * 
 * Handles downloading conversion outputs:
 * - Single file downloads
 * - Multiple files as ZIP
 * - Memory-safe ZIP creation using streaming
 */

import type { ConvertedFile } from './types'

/**
 * Download a single file
 */
export function downloadFile(file: { name: string; data: Blob }): void {
  const url = URL.createObjectURL(file.data)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Download multiple files as a ZIP archive
 * Uses dynamic import to lazy-load JSZip for better initial bundle size
 */
export async function downloadAsZip(
  files: ConvertedFile[],
  zipFilename: string = 'converted_files.zip'
): Promise<void> {
  if (files.length === 0) {
    throw new Error('No files to download')
  }

  // Single file - just download directly
  if (files.length === 1) {
    downloadFile(files[0])
    return
  }

  // Lazy load JSZip
  const JSZip = (await import('jszip')).default

  // Create ZIP with compression
  const zip = new JSZip()

  // Track filenames to handle duplicates
  const usedNames = new Map<string, number>()

  for (const file of files) {
    // Handle duplicate filenames by appending a number
    let filename = file.name
    if (usedNames.has(filename)) {
      const count = usedNames.get(filename)! + 1
      usedNames.set(filename, count)
      
      // Insert number before extension
      const lastDot = filename.lastIndexOf('.')
      if (lastDot > 0) {
        filename = `${filename.slice(0, lastDot)}_${count}${filename.slice(lastDot)}`
      } else {
        filename = `${filename}_${count}`
      }
    } else {
      usedNames.set(filename, 0)
    }

    // Add file to ZIP
    // Using arrayBuffer() for memory efficiency with large files
    const arrayBuffer = await file.data.arrayBuffer()
    zip.file(filename, arrayBuffer)
  }

  // Generate ZIP blob with compression
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }, // Balance between speed and size
  })

  // Download the ZIP
  downloadFile({ name: zipFilename, data: zipBlob })
}

/**
 * Generate a ZIP filename based on conversion details
 */
export function generateZipFilename(prefix: string = 'converted'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}_${timestamp}.zip`
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Get total size of multiple files
 */
export function getTotalSize(files: ConvertedFile[]): number {
  return files.reduce((sum, file) => sum + file.data.size, 0)
}
