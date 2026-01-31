/**
 * Line Endings Converter
 * 
 * Normalizes line endings in text files between:
 * - LF (Unix/Linux/macOS): \n
 * - CRLF (Windows): \r\n
 * 
 * Operates on local file bytes only, no network calls.
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
} from '../../convert/types'

/**
 * Supported text file types
 */
const TEXT_FILE_TYPES = [
  { mimeType: 'text/plain', extensions: ['txt'], label: 'Text' },
  { mimeType: 'text/csv', extensions: ['csv'], label: 'CSV' },
  { mimeType: 'text/markdown', extensions: ['md', 'markdown'], label: 'Markdown' },
  { mimeType: 'application/json', extensions: ['json'], label: 'JSON' },
  { mimeType: 'text/html', extensions: ['html', 'htm'], label: 'HTML' },
  { mimeType: 'text/css', extensions: ['css'], label: 'CSS' },
  { mimeType: 'text/javascript', extensions: ['js', 'mjs'], label: 'JavaScript' },
  { mimeType: 'application/xml', extensions: ['xml'], label: 'XML' },
  { mimeType: 'text/yaml', extensions: ['yml', 'yaml'], label: 'YAML' },
  { mimeType: 'text/x-python', extensions: ['py'], label: 'Python' },
  { mimeType: 'text/x-typescript', extensions: ['ts', 'tsx'], label: 'TypeScript' },
]

/**
 * Output format types
 */
const OUTPUT_FORMATS = [
  { mimeType: 'text/plain;charset=utf-8;lineending=lf', extensions: ['txt'], label: 'LF (Unix)' },
  { mimeType: 'text/plain;charset=utf-8;lineending=crlf', extensions: ['txt'], label: 'CRLF (Windows)' },
]

/**
 * Line ending types
 */
type LineEnding = 'lf' | 'crlf'

/**
 * Detect the predominant line ending in text
 */
function detectLineEnding(text: string): LineEnding | 'mixed' | 'none' {
  const crlfCount = (text.match(/\r\n/g) || []).length
  const lfCount = (text.match(/(?<!\r)\n/g) || []).length
  const crCount = (text.match(/\r(?!\n)/g) || []).length

  if (crlfCount === 0 && lfCount === 0 && crCount === 0) {
    return 'none'
  }

  // If there's a mix, report it
  const total = crlfCount + lfCount + crCount
  if (crlfCount > 0 && (lfCount > 0 || crCount > 0)) {
    return 'mixed'
  }

  return crlfCount > lfCount ? 'crlf' : 'lf'
}

/**
 * Convert line endings in text
 */
function convertLineEndings(text: string, targetEnding: LineEnding): string {
  // First normalize all line endings to LF
  const normalized = text
    .replace(/\r\n/g, '\n')  // CRLF -> LF
    .replace(/\r/g, '\n')    // CR -> LF (old Mac style)

  // Then convert to target
  if (targetEnding === 'crlf') {
    return normalized.replace(/\n/g, '\r\n')
  }

  return normalized
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return ''
  }
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Check if a file is likely a text file
 */
function isTextFile(file: File): boolean {
  // Check by MIME type
  if (file.type.startsWith('text/')) {
    return true
  }
  
  // Check by known text MIME types
  if (file.type === 'application/json' || 
      file.type === 'application/xml' ||
      file.type === 'application/javascript') {
    return true
  }

  // Check by extension
  const ext = getExtension(file.name)
  const textExtensions = TEXT_FILE_TYPES.flatMap(t => t.extensions)
  if (textExtensions.includes(ext)) {
    return true
  }

  // Empty MIME type - try extension
  if (!file.type && ext) {
    return textExtensions.includes(ext)
  }

  return false
}

/**
 * Read file as text with encoding detection
 */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

/**
 * Line Endings to LF Converter
 */
export const lineEndingsToLF: Converter = {
  id: 'line-endings-to-lf',
  label: 'Convert to LF (Unix)',
  category: 'Data',
  inputs: TEXT_FILE_TYPES,
  outputs: [OUTPUT_FORMATS[0]], // LF output
  optionsSchema: [],
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isTextFile(file))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    // Text conversion is fast and output size is roughly similar
    return {
      canConvert: true,
      estimatedSize: totalSize, // Roughly same size (LF might be slightly smaller)
      estimatedTime: Math.max(100, totalSize / 10000), // ~10MB/s estimate
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Processing ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Convert to LF
        const converted = convertLineEndings(content, 'lf')
        
        // Create output blob
        const outputBlob = new Blob([converted], { type: 'text/plain;charset=utf-8' })
        totalOutputSize += outputBlob.size

        // Generate output filename
        const baseName = file.name
        
        outputFiles.push({
          name: baseName,
          mimeType: 'text/plain',
          data: outputBlob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

/**
 * Line Endings to CRLF Converter
 */
export const lineEndingsToCRLF: Converter = {
  id: 'line-endings-to-crlf',
  label: 'Convert to CRLF (Windows)',
  category: 'Data',
  inputs: TEXT_FILE_TYPES,
  outputs: [OUTPUT_FORMATS[1]], // CRLF output
  optionsSchema: [],
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => isTextFile(file))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 1.1), // CRLF adds ~10% size
      estimatedTime: Math.max(100, totalSize / 10000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const outputFiles: ConvertedFile[] = []
    let totalInputSize = 0
    let totalOutputSize = 0

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Processing ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Convert to CRLF
        const converted = convertLineEndings(content, 'crlf')
        
        // Create output blob
        const outputBlob = new Blob([converted], { type: 'text/plain;charset=utf-8' })
        totalOutputSize += outputBlob.size

        // Generate output filename
        const baseName = file.name
        
        outputFiles.push({
          name: baseName,
          mimeType: 'text/plain',
          data: outputBlob,
          sourceFile: file,
        })
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      return {
        success: true,
        files: outputFiles,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

/**
 * Register line ending converters
 */
export function registerLineEndingConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(lineEndingsToLF, 5)
  register(lineEndingsToCRLF, 5)
}
