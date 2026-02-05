/**
 * Conversion Registry Types
 * 
 * Defines the contract for file converters including:
 * - Converter metadata (id, label, category, inputs, outputs)
 * - Options schema for converter configuration
 * - Cost estimation and multi-file/streaming support flags
 * - Method signatures: canHandle, estimate, convert
 */

/**
 * Supported conversion categories
 */
export type ConversionCategory = 'PDF' | 'Images' | 'Video' | 'Audio' | 'Archives' | 'Data'

/**
 * File type descriptor for inputs/outputs
 */
export interface FileTypeDescriptor {
  /** MIME type pattern (e.g., 'image/png', 'image/*') */
  mimeType: string
  /** File extensions without dot (e.g., 'png', 'jpg') */
  extensions: string[]
  /** Human-readable label */
  label: string
}

/**
 * Option types for converter configuration
 */
export type OptionType = 'string' | 'number' | 'boolean' | 'select' | 'range'

/**
 * Base option schema
 */
interface BaseOptionSchema {
  /** Option identifier */
  id: string
  /** Human-readable label */
  label: string
  /** Optional description/help text */
  description?: string
  /** Whether this option is required */
  required?: boolean
}

/**
 * String option schema
 */
export interface StringOptionSchema extends BaseOptionSchema {
  type: 'string'
  default?: string
  placeholder?: string
  pattern?: string // Regex pattern for validation
}

/**
 * Number option schema
 */
export interface NumberOptionSchema extends BaseOptionSchema {
  type: 'number'
  default?: number
  min?: number
  max?: number
  step?: number
}

/**
 * Boolean option schema
 */
export interface BooleanOptionSchema extends BaseOptionSchema {
  type: 'boolean'
  default?: boolean
}

/**
 * Select option schema (dropdown)
 */
export interface SelectOptionSchema extends BaseOptionSchema {
  type: 'select'
  options: { value: string; label: string }[]
  default?: string
}

/**
 * Range option schema (slider)
 */
export interface RangeOptionSchema extends BaseOptionSchema {
  type: 'range'
  min: number
  max: number
  step?: number
  default?: number
  unit?: string // e.g., '%', 'px', 'KB'
}

/**
 * Union of all option schemas
 */
export type OptionSchema =
  | StringOptionSchema
  | NumberOptionSchema
  | BooleanOptionSchema
  | SelectOptionSchema
  | RangeOptionSchema

/**
 * Converter options object (runtime values)
 */
export type ConverterOptions = Record<string, string | number | boolean>

/**
 * Computational cost indicator
 * - trivial: instant, no noticeable delay (e.g., text extraction)
 * - light: fast, sub-second (e.g., image format conversion)
 * - medium: noticeable delay, seconds (e.g., image resizing, PDF generation)
 * - heavy: significant processing, may take minutes (e.g., video transcoding)
 * - intensive: very heavy, requires progress tracking (e.g., large video/audio)
 */
export type ConversionCost = 'trivial' | 'light' | 'medium' | 'heavy' | 'intensive'

/**
 * Progress update for streaming/long-running conversions
 */
export interface ConversionProgress {
  /** Progress percentage (0-100) */
  percent: number
  /** Current stage/phase description */
  stage?: string
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number
  /** Bytes processed so far */
  bytesProcessed?: number
  /** Total bytes to process */
  bytesTotal?: number
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ConversionProgress) => void

/**
 * Estimation result from estimate() method
 */
export interface ConversionEstimate {
  /** Whether conversion is possible */
  canConvert: boolean
  /** Reason if cannot convert */
  reason?: string
  /** Estimated output file size in bytes */
  estimatedSize?: number
  /** Estimated processing time in milliseconds */
  estimatedTime?: number
  /** Warnings (e.g., "Large file may take a while") */
  warnings?: string[]
}

/**
 * Conversion result from convert() method
 */
export interface ConversionResult {
  /** Whether conversion succeeded */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Output file(s) */
  files?: ConvertedFile[]
  /** Warnings generated during conversion */
  warnings?: string[]
  /** Processing statistics */
  stats?: ConversionStats
}

/**
 * A converted output file
 */
export interface ConvertedFile {
  /** Suggested filename */
  name: string
  /** MIME type */
  mimeType: string
  /** File data as Blob */
  data: Blob
  /** Original source file (for multi-file tracking) */
  sourceFile?: File
}

/**
 * Conversion statistics
 */
export interface ConversionStats {
  /** Processing time in milliseconds */
  processingTime: number
  /** Input size in bytes */
  inputSize: number
  /** Output size in bytes */
  outputSize: number
  /** Compression ratio (output/input) */
  compressionRatio?: number
}

/**
 * Input for conversion - single file or multiple files
 */
export interface ConversionInput {
  /** Input file(s) */
  files: File[]
  /** Target output format/type */
  outputType: string
  /** Converter options */
  options?: ConverterOptions
}

/**
 * Converter definition - the main contract for all converters
 */
export interface Converter {
  /** Unique identifier (e.g., 'png-to-jpg', 'pdf-to-text') */
  id: string
  
  /** Human-readable label (e.g., 'PNG to JPG') */
  label: string
  
  /** Category for UI grouping */
  category: ConversionCategory
  
  /** Accepted input file types */
  inputs: FileTypeDescriptor[]
  
  /** Possible output file types */
  outputs: FileTypeDescriptor[]
  
  /** Configuration options schema */
  optionsSchema: OptionSchema[]
  
  /** Computational cost indicator */
  cost: ConversionCost
  
  /** Whether converter can handle multiple input files at once */
  multiFile: boolean
  
  /** Whether converter supports streaming/progress updates */
  streaming: boolean
  
  /**
   * Check if this converter can handle the given file(s)
   * Fast check based on file metadata (name, type, size)
   * Should NOT read file contents
   */
  canHandle: (files: File[]) => boolean
  
  /**
   * Estimate the conversion result without actually converting
   * May read partial file contents for better estimation
   */
  estimate: (input: ConversionInput) => Promise<ConversionEstimate>
  
  /**
   * Perform the actual conversion
   * @param input - Files and options for conversion
   * @param onProgress - Optional callback for progress updates (if streaming=true)
   */
  convert: (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ) => Promise<ConversionResult>
}

/**
 * Converter registration entry (for registry)
 */
export interface ConverterRegistration {
  converter: Converter
  /** Priority for handling conflicts (higher = preferred) */
  priority: number
  /** Whether converter is currently enabled */
  enabled: boolean
}
