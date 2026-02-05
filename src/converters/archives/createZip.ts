/**
 * Create ZIP Converter
 * 
 * Creates a ZIP archive from multiple files.
 * Features:
 * - Compression level options (store/fast/balanced/best)
 * - Custom output filename template
 * - Preserves original filenames within archive
 * - Handles duplicate filenames
 * 
 * Uses JSZip library (bundled locally, no network calls).
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  SelectOptionSchema,
  StringOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** Accept any file type */
const ANY_FILE_TYPE = { 
  mimeType: '*/*', 
  extensions: ['*'], 
  label: 'Any File' 
}

/** ZIP output type */
const ZIP_TYPE = { 
  mimeType: 'application/zip', 
  extensions: ['zip'], 
  label: 'ZIP Archive' 
}

/** Compression level settings for JSZip */
interface CompressionSettings {
  type: 'STORE' | 'DEFLATE'
  level?: number
}

const COMPRESSION_LEVELS: Record<string, CompressionSettings> = {
  store: { type: 'STORE' },
  fast: { type: 'DEFLATE', level: 1 },
  balanced: { type: 'DEFLATE', level: 6 },
  best: { type: 'DEFLATE', level: 9 },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique filename if duplicates exist
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

/**
 * Generate output filename from template
 */
function generateOutputFilename(
  template: string,
  fileCount: number
): string {
  const now = new Date()
  
  // Replace template variables
  let filename = template
    .replace('{count}', String(fileCount))
    .replace('{date}', now.toISOString().split('T')[0])
    .replace('{time}', now.toTimeString().split(' ')[0].replace(/:/g, '-'))
    .replace('{timestamp}', String(Date.now()))
  
  // Ensure .zip extension
  if (!filename.toLowerCase().endsWith('.zip')) {
    filename += '.zip'
  }
  
  // Sanitize filename
  filename = filename.replace(/[<>:"/\\|?*]/g, '_')
  
  return filename
}

// ============================================================================
// Option Schemas
// ============================================================================

const compressionOption: SelectOptionSchema = {
  id: 'compression',
  type: 'select',
  label: 'Compression',
  options: [
    { value: 'store', label: 'Store (no compression)' },
    { value: 'fast', label: 'Fast (level 1)' },
    { value: 'balanced', label: 'Balanced (level 6)' },
    { value: 'best', label: 'Best (level 9)' },
  ],
  default: 'balanced',
  description: 'Higher compression = smaller file, slower creation',
}

const filenameOption: StringOptionSchema = {
  id: 'filename',
  type: 'string',
  label: 'Output Filename',
  default: 'archive_{count}_files',
  placeholder: 'archive_{count}_files',
  description: 'Variables: {count}, {date}, {time}, {timestamp}',
}

const optionsSchema: OptionSchema[] = [
  compressionOption,
  filenameOption,
]

// ============================================================================
// Create ZIP Converter
// ============================================================================

export const createZip: Converter = {
  id: 'create-zip',
  label: 'Create ZIP Archive',
  category: 'Archives',
  inputs: [ANY_FILE_TYPE],
  outputs: [ZIP_TYPE],
  optionsSchema,
  cost: 'medium',
  multiFile: true,
  streaming: true,

  canHandle: (files: File[]) => {
    // Can handle any files, as long as there's at least one
    return files.length > 0
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const compression = (input.options?.compression as string) || 'balanced'
    
    // Estimate compression ratio based on level
    let estimatedRatio: number
    switch (compression) {
      case 'store':
        estimatedRatio = 1.01 // Slight overhead for ZIP structure
        break
      case 'fast':
        estimatedRatio = 0.7
        break
      case 'balanced':
        estimatedRatio = 0.5
        break
      case 'best':
        estimatedRatio = 0.4
        break
      default:
        estimatedRatio = 0.5
    }
    
    // Estimate time based on size and compression level
    const compressionMultiplier = compression === 'best' ? 3 : 
                                   compression === 'balanced' ? 2 : 
                                   compression === 'fast' ? 1.5 : 1
    
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * estimatedRatio),
      estimatedTime: Math.max(500, (totalSize / 100000) * compressionMultiplier),
      warnings: totalSize > 100 * 1024 * 1024 
        ? ['Large archive may take a while to create']
        : undefined,
    }
  },

  convert: async (
    input: ConversionInput,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> => {
    const startTime = Date.now()
    let totalInputSize = 0
    
    // Parse options
    const compression = (input.options?.compression as string) || 'balanced'
    const filenameTemplate = (input.options?.filename as string) || 'archive_{count}_files'
    
    const compressionSettings = COMPRESSION_LEVELS[compression] || COMPRESSION_LEVELS.balanced

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading JSZip library',
      })

      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default
      
      // Create new ZIP instance
      const zip = new JSZip()
      
      // Track used filenames to handle duplicates
      const usedNames = new Set<string>()
      
      // Add each file to the archive
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round(((i + 0.3) / input.files.length) * 80),
          stage: `Adding ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Get unique filename
        const uniqueName = makeUniqueFilename(file.name, usedNames)
        usedNames.add(uniqueName)
        
        // Read file as ArrayBuffer for efficient handling
        const arrayBuffer = await file.arrayBuffer()
        
        // Add to ZIP with compression settings
        zip.file(uniqueName, arrayBuffer, {
          compression: compressionSettings.type,
          compressionOptions: compressionSettings.level !== undefined 
            ? { level: compressionSettings.level }
            : undefined,
        })

        onProgress?.({
          percent: Math.round(((i + 1) / input.files.length) * 80),
          stage: `Added ${file.name}`,
          bytesProcessed: totalInputSize,
        })
      }

      onProgress?.({
        percent: 85,
        stage: 'Compressing archive',
        bytesProcessed: totalInputSize,
      })

      // Generate the ZIP file
      const zipBlob = await zip.generateAsync(
        { 
          type: 'blob',
          compression: compressionSettings.type,
          compressionOptions: compressionSettings.level !== undefined 
            ? { level: compressionSettings.level }
            : undefined,
        },
        (metadata) => {
          // Progress callback from JSZip
          onProgress?.({
            percent: 85 + Math.round(metadata.percent * 0.14),
            stage: `Compressing: ${Math.round(metadata.percent)}%`,
            bytesProcessed: totalInputSize,
          })
        }
      )

      onProgress?.({
        percent: 100,
        stage: 'Complete',
        bytesProcessed: totalInputSize,
        bytesTotal: totalInputSize,
      })

      // Generate output filename
      const outputName = generateOutputFilename(filenameTemplate, input.files.length)

      return {
        success: true,
        files: [{
          name: outputName,
          mimeType: 'application/zip',
          data: zipBlob,
        }],
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: zipBlob.size,
          compressionRatio: zipBlob.size / totalInputSize,
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
// Registration
// ============================================================================

/**
 * Register archive converters
 */
export function registerArchiveConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(createZip, 20)
}
