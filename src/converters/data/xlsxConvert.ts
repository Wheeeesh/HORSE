/**
 * XLSX/Excel Converter
 * 
 * Parses Excel files (.xlsx, .xls) and exports to CSV or JSON.
 * Features:
 * - Sheet selection (specific sheet or all sheets)
 * - Export formats: CSV, JSON
 * - Configurable date handling
 * - Header row option
 * 
 * Uses SheetJS (xlsx) library loaded via dynamic import (lazy-loaded).
 * No CDN dependencies - fully bundled locally.
 * 
 * ## Date Handling
 * 
 * Excel stores dates as serial numbers (days since 1900-01-01).
 * This converter offers two date handling modes:
 * 
 * 1. **Formatted strings** (default): Dates appear as they do in Excel,
 *    using the cell's number format (e.g., "2024-01-15", "Jan 15, 2024").
 *    Best for: Human-readable exports, preserving Excel's display format.
 * 
 * 2. **Raw values**: Dates appear as ISO 8601 strings (e.g., "2024-01-15T00:00:00.000Z").
 *    Best for: Data processing, database imports, programmatic use.
 * 
 * Note: Excel date serial numbers have a known bug where 1900 is incorrectly
 * treated as a leap year. SheetJS handles this automatically.
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
  StringOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** Excel file types */
const XLSX_TYPE = { 
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
  extensions: ['xlsx'], 
  label: 'Excel (XLSX)' 
}
const XLS_TYPE = { 
  mimeType: 'application/vnd.ms-excel', 
  extensions: ['xls'], 
  label: 'Excel (XLS)' 
}

/** Output types */
const CSV_TYPE = { mimeType: 'text/csv', extensions: ['csv'], label: 'CSV' }
const JSON_TYPE = { mimeType: 'application/json', extensions: ['json'], label: 'JSON' }

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get base filename without extension
 */
function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename
  return filename.slice(0, lastDot)
}

/**
 * Get file extension
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Sanitize sheet name for use in filename
 */
function sanitizeSheetName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename chars
    .replace(/\s+/g, '_')          // Replace spaces with underscores
    .slice(0, 50)                  // Limit length
}

// ============================================================================
// Option Schemas
// ============================================================================

const outputFormatOption: SelectOptionSchema = {
  id: 'outputFormat',
  type: 'select',
  label: 'Output Format',
  options: [
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
  ],
  default: 'csv',
}

const sheetOption: StringOptionSchema = {
  id: 'sheet',
  type: 'string',
  label: 'Sheet',
  default: '',
  placeholder: 'Sheet name or number (empty = first, "all" = all sheets)',
  description: 'Leave empty for first sheet, use "all" to export all sheets, or specify sheet name/number.',
}

const hasHeaderOption: BooleanOptionSchema = {
  id: 'hasHeader',
  type: 'boolean',
  label: 'First row is header',
  default: true,
  description: 'Use first row as column names (for JSON output)',
}

const dateHandlingOption: SelectOptionSchema = {
  id: 'dateHandling',
  type: 'select',
  label: 'Date Handling',
  options: [
    { value: 'formatted', label: 'Formatted strings (as displayed in Excel)' },
    { value: 'iso', label: 'ISO 8601 dates (for data processing)' },
    { value: 'raw', label: 'Raw values (Excel serial numbers)' },
  ],
  default: 'formatted',
  description: 'How to export date/time values from Excel',
}

const delimiterOption: SelectOptionSchema = {
  id: 'delimiter',
  type: 'select',
  label: 'CSV Delimiter',
  options: [
    { value: 'comma', label: 'Comma (,)' },
    { value: 'semicolon', label: 'Semicolon (;)' },
    { value: 'tab', label: 'Tab' },
  ],
  default: 'comma',
  description: 'Field separator for CSV output',
}

const prettyPrintOption: BooleanOptionSchema = {
  id: 'prettyPrint',
  type: 'boolean',
  label: 'Pretty print JSON',
  default: true,
  description: 'Format JSON with indentation',
}

const optionsSchema: OptionSchema[] = [
  sheetOption,
  outputFormatOption,
  hasHeaderOption,
  dateHandlingOption,
  delimiterOption,
  prettyPrintOption,
]

// ============================================================================
// XLSX to CSV/JSON Converter
// ============================================================================

export const xlsxToData: Converter = {
  id: 'xlsx-to-data',
  label: 'Excel to CSV/JSON',
  category: 'Data',
  inputs: [XLSX_TYPE, XLS_TYPE],
  outputs: [CSV_TYPE, JSON_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: false, // One file at a time for sheet selection
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length !== 1) return false
    const file = files[0]
    const ext = getExtension(file.name)
    return (
      file.type === XLSX_TYPE.mimeType ||
      file.type === XLS_TYPE.mimeType ||
      ext === 'xlsx' ||
      ext === 'xls'
    )
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const file = input.files[0]
    const outputFormat = (input.options?.outputFormat as string) || 'csv'
    const sheetOption = (input.options?.sheet as string) || ''
    
    // Estimate: Excel files typically expand when converted to text
    const multiplier = outputFormat === 'json' ? 1.5 : 0.8
    const sheetMultiplier = sheetOption.toLowerCase() === 'all' ? 3 : 1
    
    return {
      canConvert: true,
      estimatedSize: Math.round(file.size * multiplier * sheetMultiplier),
      estimatedTime: Math.max(500, file.size / 10000),
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    const file = input.files[0]
    
    // Parse options
    const outputFormat = (input.options?.outputFormat as string) || 'csv'
    const sheetSelector = (input.options?.sheet as string) || ''
    const hasHeader = input.options?.hasHeader !== false
    const dateHandling = (input.options?.dateHandling as string) || 'formatted'
    const delimiterKey = (input.options?.delimiter as string) || 'comma'
    const prettyPrint = input.options?.prettyPrint !== false
    
    const delimiter = delimiterKey === 'semicolon' ? ';' : delimiterKey === 'tab' ? '\t' : ','
    const outputExt = outputFormat === 'json' ? 'json' : 'csv'
    const outputMime = outputFormat === 'json' ? 'application/json' : 'text/csv'

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading Excel library',
      })

      // Dynamically import xlsx library
      const XLSX = await import('xlsx')

      onProgress?.({
        percent: 10,
        stage: 'Reading Excel file',
      })

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()

      onProgress?.({
        percent: 20,
        stage: 'Parsing workbook',
      })

      // Parse workbook with appropriate date handling
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: dateHandling === 'iso', // Parse dates as JS Date objects for ISO output
        cellNF: dateHandling === 'formatted', // Keep number formats for formatted output
        cellText: dateHandling === 'formatted', // Generate formatted text
      })

      const sheetNames = workbook.SheetNames
      if (sheetNames.length === 0) {
        return {
          success: false,
          error: 'Workbook contains no sheets',
        }
      }

      onProgress?.({
        percent: 30,
        stage: `Found ${sheetNames.length} sheet(s)`,
      })

      // Determine which sheets to export
      let sheetsToExport: string[] = []
      const sheetSelectorLower = sheetSelector.trim().toLowerCase()

      if (!sheetSelector || sheetSelectorLower === '') {
        // Default: first sheet only
        sheetsToExport = [sheetNames[0]]
      } else if (sheetSelectorLower === 'all') {
        // All sheets
        sheetsToExport = [...sheetNames]
      } else {
        // Specific sheet by name or number
        const sheetNum = parseInt(sheetSelector, 10)
        if (!isNaN(sheetNum) && sheetNum >= 1 && sheetNum <= sheetNames.length) {
          // Sheet by number (1-based)
          sheetsToExport = [sheetNames[sheetNum - 1]]
        } else if (sheetNames.includes(sheetSelector)) {
          // Sheet by exact name
          sheetsToExport = [sheetSelector]
        } else {
          // Try case-insensitive match
          const match = sheetNames.find(
            name => name.toLowerCase() === sheetSelectorLower
          )
          if (match) {
            sheetsToExport = [match]
          } else {
            return {
              success: false,
              error: `Sheet "${sheetSelector}" not found. Available sheets: ${sheetNames.join(', ')}`,
            }
          }
        }
      }

      const outputFiles: ConvertedFile[] = []
      const warnings: string[] = []
      let totalOutputSize = 0

      // Process each sheet
      for (let i = 0; i < sheetsToExport.length; i++) {
        const sheetName = sheetsToExport[i]
        const sheet = workbook.Sheets[sheetName]
        
        const progress = 30 + Math.round((i / sheetsToExport.length) * 60)
        onProgress?.({
          percent: progress,
          stage: `Converting sheet "${sheetName}" (${i + 1}/${sheetsToExport.length})`,
        })

        try {
          let outputContent: string
          
          if (outputFormat === 'json') {
            // Convert to JSON
            const jsonOpts: XLSX.Sheet2JSONOpts = {
              header: hasHeader ? undefined : 1, // undefined = use first row as keys, 1 = array of arrays
              defval: '', // Default value for empty cells
              raw: dateHandling === 'raw', // Use raw values if requested
              dateNF: dateHandling === 'iso' ? 'yyyy-mm-dd"T"hh:mm:ss.000"Z"' : undefined,
            }
            
            const jsonData = XLSX.utils.sheet_to_json(sheet, jsonOpts)
            
            // Post-process for ISO dates if needed
            if (dateHandling === 'iso') {
              // Dates are already JS Date objects, convert to ISO strings
              const processValue = (val: unknown): unknown => {
                if (val instanceof Date) {
                  return val.toISOString()
                }
                if (Array.isArray(val)) {
                  return val.map(processValue)
                }
                if (typeof val === 'object' && val !== null) {
                  const result: Record<string, unknown> = {}
                  for (const [k, v] of Object.entries(val)) {
                    result[k] = processValue(v)
                  }
                  return result
                }
                return val
              }
              const processed = jsonData.map(row => processValue(row))
              outputContent = prettyPrint 
                ? JSON.stringify(processed, null, 2)
                : JSON.stringify(processed)
            } else {
              outputContent = prettyPrint 
                ? JSON.stringify(jsonData, null, 2)
                : JSON.stringify(jsonData)
            }
          } else {
            // Convert to CSV
            const csvOpts: XLSX.Sheet2CSVOpts = {
              FS: delimiter, // Field separator
              RS: '\n', // Row separator (will add \r\n for Windows if needed)
              dateNF: dateHandling === 'iso' ? 'yyyy-mm-dd' : undefined,
              rawNumbers: dateHandling === 'raw',
            }
            
            outputContent = XLSX.utils.sheet_to_csv(sheet, csvOpts)
          }

          const blob = new Blob([outputContent], { 
            type: outputFormat === 'json' 
              ? 'application/json;charset=utf-8' 
              : 'text/csv;charset=utf-8' 
          })
          totalOutputSize += blob.size

          // Generate output filename
          let outputName: string
          if (sheetsToExport.length === 1) {
            outputName = `${getBaseName(file.name)}.${outputExt}`
          } else {
            const sanitizedSheet = sanitizeSheetName(sheetName)
            outputName = `${getBaseName(file.name)}_${sanitizedSheet}.${outputExt}`
          }

          outputFiles.push({
            name: outputName,
            mimeType: outputMime,
            data: blob,
          })
        } catch (sheetError) {
          const errorMsg = sheetError instanceof Error ? sheetError.message : 'Unknown error'
          warnings.push(`Sheet "${sheetName}": ${errorMsg}`)
        }
      }

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: file.size,
        bytesTotal: file.size,
      })

      if (outputFiles.length === 0) {
        return {
          success: false,
          error: 'No sheets could be converted',
        }
      }

      // Add summary
      if (sheetsToExport.length > 1) {
        warnings.unshift(`Exported ${outputFiles.length} of ${sheetsToExport.length} sheets`)
      }

      // Add date handling info
      if (dateHandling === 'formatted') {
        warnings.push('Dates exported as formatted strings (as displayed in Excel)')
      } else if (dateHandling === 'iso') {
        warnings.push('Dates exported as ISO 8601 strings')
      } else {
        warnings.push('Dates exported as raw Excel serial numbers')
      }

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
      
      if (errorMsg.includes('password') || errorMsg.includes('encrypt')) {
        return {
          success: false,
          error: 'Cannot read password-protected Excel file',
        }
      }
      
      if (errorMsg.includes('Unsupported') || errorMsg.includes('corrupt')) {
        return {
          success: false,
          error: 'Invalid or unsupported Excel file format',
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
 * Register XLSX converters
 */
export function registerXlsxConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(xlsxToData, 20)
}
