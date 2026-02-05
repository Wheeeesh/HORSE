/**
 * Extract ZIP Converter
 * 
 * Extracts files from a ZIP archive.
 * Features:
 * - Extracts all files from ZIP to individual outputs
 * - Zip slip protection (sanitizes paths to prevent directory traversal)
 * - Flattens directory structure option
 * - Handles nested directories
 * - Progress tracking during extraction
 * 
 * Uses JSZip library (bundled locally, no network calls).
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  BooleanOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** ZIP input type */
const ZIP_TYPE = { 
  mimeType: 'application/zip', 
  extensions: ['zip'], 
  label: 'ZIP Archive' 
}

/** Output any file type */
const ANY_FILE_TYPE = { 
  mimeType: '*/*', 
  extensions: ['*'], 
  label: 'Extracted Files' 
}

// ============================================================================
// Security: Zip Slip Protection
// ============================================================================

/**
 * Sanitize a file path to prevent zip slip attacks.
 * 
 * Zip slip attacks use paths like "../../../etc/passwd" to write
 * files outside the intended directory. This function:
 * 1. Removes leading slashes
 * 2. Removes . and .. path components
 * 3. Removes backslashes (Windows paths)
 * 4. Removes null bytes
 * 5. Normalizes multiple slashes
 * 6. Removes dangerous characters
 */
function sanitizePath(path: string): string {
  // Remove null bytes
  let safe = path.replace(/\0/g, '')
  
  // Normalize backslashes to forward slashes
  safe = safe.replace(/\\/g, '/')
  
  // Remove leading slashes
  safe = safe.replace(/^\/+/, '')
  
  // Split into parts and filter out dangerous components
  const parts = safe.split('/').filter(part => {
    // Remove empty parts (from multiple slashes)
    if (!part) return false
    // Remove current directory references
    if (part === '.') return false
    // Remove parent directory references (zip slip protection)
    if (part === '..') return false
    // Remove parts that are only dots
    if (/^\.+$/.test(part)) return false
    return true
  })
  
  // Sanitize each part individually
  const sanitizedParts = parts.map(part => {
    // Remove characters that are problematic on various file systems
    return part
      .replace(/[<>:"|?*]/g, '_') // Windows reserved characters
      .replace(/[\x00-\x1f]/g, '') // Control characters
      .trim()
  }).filter(part => part.length > 0)
  
  return sanitizedParts.join('/')
}

/**
 * Extract just the filename from a path
 */
function getFilename(path: string): string {
  const sanitized = sanitizePath(path)
  const parts = sanitized.split('/')
  return parts[parts.length - 1] || 'unnamed'
}

/**
 * Get MIME type from filename extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  
  const mimeTypes: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Text
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    md: 'text/markdown',
    
    // Archives
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
    
    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    
    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    
    // Other
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
  }
  
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Generate unique filename if duplicates exist
 */
function makeUniqueFilename(
  name: string,
  existingNames: Set<string>
): string {
  if (!existingNames.has(name)) {
    return name
  }
  
  const lastDot = name.lastIndexOf('.')
  const baseName = lastDot === -1 ? name : name.slice(0, lastDot)
  const extension = lastDot === -1 ? '' : name.slice(lastDot)
  
  let counter = 1
  let newName: string
  do {
    newName = `${baseName}_${counter}${extension}`
    counter++
  } while (existingNames.has(newName))
  
  return newName
}

// ============================================================================
// Option Schemas
// ============================================================================

const flattenOption: BooleanOptionSchema = {
  id: 'flatten',
  type: 'boolean',
  label: 'Flatten directory structure',
  default: false,
  description: 'Extract all files to root level (ignore folders)',
}

const optionsSchema: OptionSchema[] = [
  flattenOption,
]

// ============================================================================
// Extract ZIP Converter
// ============================================================================

export const extractZip: Converter = {
  id: 'extract-zip',
  label: 'Extract ZIP Archive',
  category: 'Archives',
  inputs: [ZIP_TYPE],
  outputs: [ANY_FILE_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: false, // One ZIP at a time
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    return file.type === 'application/zip' || 
           file.type === 'application/x-zip-compressed' ||
           ext === 'zip'
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    
    // ZIP files are typically compressed, so extracted size is larger
    return {
      canConvert: true,
      estimatedSize: Math.round(file.size * 2.5), // Rough estimate
      estimatedTime: Math.max(500, file.size / 50000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const file = input.files[0]
    const flatten = input.options?.flatten === true
    
    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading JSZip library',
      })

      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default
      
      onProgress?.({
        percent: 5,
        stage: 'Reading ZIP file',
      })

      // Read the ZIP file
      const arrayBuffer = await file.arrayBuffer()
      
      onProgress?.({
        percent: 10,
        stage: 'Parsing ZIP structure',
      })

      // Load the ZIP
      const zip = await JSZip.loadAsync(arrayBuffer)
      
      // Get list of files (excluding directories)
      const fileEntries: { path: string; zipObject: JSZip.JSZipObject }[] = []
      
      zip.forEach((relativePath, zipEntry) => {
        // Skip directories
        if (!zipEntry.dir) {
          fileEntries.push({ path: relativePath, zipObject: zipEntry })
        }
      })

      if (fileEntries.length === 0) {
        return {
          success: false,
          error: 'ZIP archive is empty or contains only directories',
        }
      }

      onProgress?.({
        percent: 15,
        stage: `Found ${fileEntries.length} files to extract`,
      })

      // Extract files
      const outputFiles: ConvertedFile[] = []
      const usedNames = new Set<string>()
      let totalOutputSize = 0
      const warnings: string[] = []

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i]
        
        onProgress?.({
          percent: 15 + Math.round((i / fileEntries.length) * 80),
          stage: `Extracting ${entry.path}`,
        })

        // Sanitize the path
        const sanitizedPath = sanitizePath(entry.path)
        
        // Check if path was modified (potential attack attempt)
        if (sanitizedPath !== entry.path && entry.path.includes('..')) {
          warnings.push(`Sanitized unsafe path: ${entry.path}`)
        }
        
        // Skip if path is empty after sanitization
        if (!sanitizedPath) {
          warnings.push(`Skipped invalid path: ${entry.path}`)
          continue
        }

        // Determine output filename
        let outputName: string
        if (flatten) {
          // Use just the filename
          outputName = getFilename(sanitizedPath)
        } else {
          // Preserve directory structure in filename (replace / with _)
          outputName = sanitizedPath.replace(/\//g, '_')
        }
        
        // Ensure unique filename
        outputName = makeUniqueFilename(outputName, usedNames)
        usedNames.add(outputName)

        // Extract file content
        const content = await entry.zipObject.async('blob')
        totalOutputSize += content.size

        // Determine MIME type
        const mimeType = getMimeType(outputName)

        outputFiles.push({
          name: outputName,
          mimeType,
          data: content,
        })
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract ZIP archive',
      }
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register ZIP extraction converter
 */
export function registerExtractZipConverter(
  register: (converter: Converter, priority?: number) => void
): void {
  register(extractZip, 20)
}
