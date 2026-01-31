/**
 * Conversion module exports
 */

// Types
export type {
  ConversionCategory,
  FileTypeDescriptor,
  OptionType,
  OptionSchema,
  StringOptionSchema,
  NumberOptionSchema,
  BooleanOptionSchema,
  SelectOptionSchema,
  RangeOptionSchema,
  ConverterOptions,
  ConversionCost,
  ConversionProgress,
  ProgressCallback,
  ConversionEstimate,
  ConversionResult,
  ConvertedFile,
  ConversionStats,
  ConversionInput,
  Converter,
  ConverterRegistration,
} from './types'

// Registry
export {
  conversionRegistry,
  getFileExtension,
  fileMatchesTypes,
} from './registry'

// Runner
export {
  runConversion,
  runStubConversion,
  formatDuration,
  type LogEntry,
  type ConversionRunState,
  type ConversionRunCallbacks,
} from './run'

// Download utilities
export {
  downloadFile,
  downloadAsZip,
  generateZipFilename,
  getTotalSize,
  formatFileSize,
} from './download'

// Re-export Converter type from registry for convenience
export type { Converter as ConverterType } from './registry'
