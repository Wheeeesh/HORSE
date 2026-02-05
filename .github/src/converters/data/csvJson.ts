/**
 * CSV ↔ JSON Converter
 * 
 * Converts between CSV and JSON formats with options for:
 * - Delimiter (comma, semicolon, tab)
 * - Header row toggle
 * - Newline style (LF, CRLF)
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
  SelectOptionSchema,
  BooleanOptionSchema,
} from '../../lib/convert/types'

/**
 * CSV file type
 */
const CSV_FILE_TYPE = { mimeType: 'text/csv', extensions: ['csv'], label: 'CSV' }

/**
 * JSON file type
 */
const JSON_FILE_TYPE = { mimeType: 'application/json', extensions: ['json'], label: 'JSON' }

/**
 * Delimiter options
 */
const DELIMITERS: Record<string, string> = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  pipe: '|',
}

/**
 * Read file as text
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
 * Parse a CSV line respecting quoted fields
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          current += '"'
          i++ // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }
  
  // Add last field
  fields.push(current)
  
  return fields
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string, delimiter: string): string[][] {
  // Normalize line endings to LF
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // Split into lines, handling quoted fields that may contain newlines
  const rows: string[][] = []
  let currentLine = ''
  let inQuotes = false
  
  for (const char of normalized) {
    if (char === '"') {
      inQuotes = !inQuotes
      currentLine += char
    } else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        rows.push(parseCSVLine(currentLine, delimiter))
      }
      currentLine = ''
    } else {
      currentLine += char
    }
  }
  
  // Handle last line
  if (currentLine.trim()) {
    rows.push(parseCSVLine(currentLine, delimiter))
  }
  
  return rows
}

/**
 * Escape a field for CSV output
 */
function escapeCSVField(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? '' : String(value)
  
  // Check if quoting is needed
  const needsQuoting = str.includes(delimiter) || 
                       str.includes('"') || 
                       str.includes('\n') || 
                       str.includes('\r')
  
  if (needsQuoting) {
    // Escape quotes by doubling them
    return '"' + str.replace(/"/g, '""') + '"'
  }
  
  return str
}

/**
 * Convert rows to CSV string
 */
function rowsToCSV(rows: string[][], delimiter: string, newline: string): string {
  return rows
    .map(row => row.map(field => escapeCSVField(field, delimiter)).join(delimiter))
    .join(newline)
}

/**
 * Detect delimiter from CSV content
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/)[0] || ''
  
  // Count occurrences of common delimiters
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length,
  }
  
  // Return delimiter with most occurrences
  let maxDelimiter = ','
  let maxCount = 0
  
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      maxDelimiter = delim
    }
  }
  
  return maxDelimiter
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Replace file extension
 */
function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return `${filename}.${newExt}`
  return `${filename.slice(0, lastDot)}.${newExt}`
}

// ============================================================================
// CSV to JSON Converter
// ============================================================================

const csvToJsonOptions: (SelectOptionSchema | BooleanOptionSchema)[] = [
  {
    id: 'delimiter',
    type: 'select',
    label: 'Delimiter',
    options: [
      { value: 'auto', label: 'Auto-detect' },
      { value: 'comma', label: 'Comma (,)' },
      { value: 'semicolon', label: 'Semicolon (;)' },
      { value: 'tab', label: 'Tab' },
      { value: 'pipe', label: 'Pipe (|)' },
    ],
    default: 'auto',
  },
  {
    id: 'hasHeader',
    type: 'boolean',
    label: 'First row is header',
    default: true,
    description: 'Use first row as property names',
  },
  {
    id: 'prettyPrint',
    type: 'boolean',
    label: 'Pretty print',
    default: true,
    description: 'Format JSON with indentation',
  },
]

export const csvToJson: Converter = {
  id: 'csv-to-json',
  label: 'CSV to JSON',
  category: 'Data',
  inputs: [CSV_FILE_TYPE],
  outputs: [JSON_FILE_TYPE],
  optionsSchema: csvToJsonOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'text/csv' || ext === 'csv'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 1.5), // JSON is typically larger
      estimatedTime: Math.max(100, totalSize / 50000),
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

    const delimiterOption = (input.options?.delimiter as string) || 'auto'
    const hasHeader = input.options?.hasHeader !== false
    const prettyPrint = input.options?.prettyPrint !== false

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Determine delimiter
        const delimiter = delimiterOption === 'auto' 
          ? detectDelimiter(content)
          : DELIMITERS[delimiterOption] || ','
        
        // Parse CSV
        const rows = parseCSV(content, delimiter)
        
        if (rows.length === 0) {
          throw new Error(`File ${file.name} appears to be empty`)
        }

        // Convert to JSON
        let jsonData: unknown

        if (hasHeader && rows.length > 1) {
          // First row is header - create array of objects
          const headers = rows[0]
          jsonData = rows.slice(1).map(row => {
            const obj: Record<string, string> = {}
            headers.forEach((header, index) => {
              const key = header.trim() || `column_${index + 1}`
              obj[key] = row[index] ?? ''
            })
            return obj
          })
        } else if (hasHeader && rows.length === 1) {
          // Only header row, no data
          jsonData = []
        } else {
          // No header - create array of arrays
          jsonData = rows
        }

        // Convert to JSON string
        const jsonString = prettyPrint 
          ? JSON.stringify(jsonData, null, 2)
          : JSON.stringify(jsonData)
        
        // Create output blob
        const outputBlob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'json'),
          mimeType: 'application/json',
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

// ============================================================================
// JSON to CSV Converter
// ============================================================================

const jsonToCsvOptions: (SelectOptionSchema | BooleanOptionSchema)[] = [
  {
    id: 'delimiter',
    type: 'select',
    label: 'Delimiter',
    options: [
      { value: 'comma', label: 'Comma (,)' },
      { value: 'semicolon', label: 'Semicolon (;)' },
      { value: 'tab', label: 'Tab' },
      { value: 'pipe', label: 'Pipe (|)' },
    ],
    default: 'comma',
  },
  {
    id: 'includeHeader',
    type: 'boolean',
    label: 'Include header row',
    default: true,
    description: 'Add column names as first row',
  },
  {
    id: 'newlineStyle',
    type: 'select',
    label: 'Line endings',
    options: [
      { value: 'lf', label: 'LF (Unix)' },
      { value: 'crlf', label: 'CRLF (Windows)' },
    ],
    default: 'lf',
  },
]

export const jsonToCsv: Converter = {
  id: 'json-to-csv',
  label: 'JSON to CSV',
  category: 'Data',
  inputs: [JSON_FILE_TYPE],
  outputs: [CSV_FILE_TYPE],
  optionsSchema: jsonToCsvOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'application/json' || ext === 'json'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 0.7), // CSV is typically smaller
      estimatedTime: Math.max(100, totalSize / 50000),
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

    const delimiterKey = (input.options?.delimiter as string) || 'comma'
    const delimiter = DELIMITERS[delimiterKey] || ','
    const includeHeader = input.options?.includeHeader !== false
    const newlineStyle = (input.options?.newlineStyle as string) || 'lf'
    const newline = newlineStyle === 'crlf' ? '\r\n' : '\n'

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Parse JSON
        let jsonData: unknown
        try {
          jsonData = JSON.parse(content)
        } catch {
          throw new Error(`File ${file.name} contains invalid JSON`)
        }

        // Convert to CSV
        let csvString: string

        if (Array.isArray(jsonData)) {
          if (jsonData.length === 0) {
            csvString = ''
          } else if (typeof jsonData[0] === 'object' && jsonData[0] !== null && !Array.isArray(jsonData[0])) {
            // Array of objects
            const allKeys = new Set<string>()
            for (const item of jsonData) {
              if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(key => allKeys.add(key))
              }
            }
            const headers = Array.from(allKeys)
            
            const rows: string[][] = []
            if (includeHeader) {
              rows.push(headers)
            }
            
            for (const item of jsonData) {
              const row = headers.map(header => {
                const value = (item as Record<string, unknown>)[header]
                return value === null || value === undefined ? '' : String(value)
              })
              rows.push(row)
            }
            
            csvString = rowsToCSV(rows, delimiter, newline)
          } else if (Array.isArray(jsonData[0])) {
            // Array of arrays
            csvString = rowsToCSV(jsonData as string[][], delimiter, newline)
          } else {
            // Array of primitives
            const rows = jsonData.map(item => [String(item)])
            csvString = rowsToCSV(rows, delimiter, newline)
          }
        } else if (typeof jsonData === 'object' && jsonData !== null) {
          // Single object - convert to key-value pairs
          const entries = Object.entries(jsonData as Record<string, unknown>)
          const rows: string[][] = []
          if (includeHeader) {
            rows.push(['key', 'value'])
          }
          for (const [key, value] of entries) {
            rows.push([key, value === null || value === undefined ? '' : String(value)])
          }
          csvString = rowsToCSV(rows, delimiter, newline)
        } else {
          throw new Error(`File ${file.name}: JSON must be an array or object`)
        }
        
        // Create output blob
        const outputBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'csv'),
          mimeType: 'text/csv',
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
 * Register CSV/JSON converters
 */
export function registerCsvJsonConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(csvToJson, 15) // Higher priority than placeholder
  register(jsonToCsv, 15)
}
