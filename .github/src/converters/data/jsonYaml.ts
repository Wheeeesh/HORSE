/**
 * JSON ↔ YAML Converter
 * 
 * Converts between JSON and YAML formats with options for:
 * - Indentation (2, 4, or 8 spaces)
 * - Sort keys alphabetically
 * - Flow style for compact output
 * 
 * Uses js-yaml library loaded via dynamic import (lazy-loaded).
 * No CDN dependencies - fully bundled locally.
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
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** JSON file type */
const JSON_TYPE = { 
  mimeType: 'application/json', 
  extensions: ['json'], 
  label: 'JSON' 
}

/** YAML file type */
const YAML_TYPE = { 
  mimeType: 'text/yaml', 
  extensions: ['yaml', 'yml'], 
  label: 'YAML' 
}

// ============================================================================
// Utility Functions
// ============================================================================

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
 * Get file extension
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

/**
 * Deep sort object keys alphabetically
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }
  
  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
  }
  
  return sorted
}

/**
 * Count keys in an object (including nested)
 */
function countKeys(obj: unknown): number {
  if (obj === null || typeof obj !== 'object') {
    return 0
  }
  
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countKeys(item), 0)
  }
  
  const entries = Object.entries(obj as Record<string, unknown>)
  return entries.length + entries.reduce((sum, [, value]) => sum + countKeys(value), 0)
}

// ============================================================================
// JSON to YAML Options
// ============================================================================

const jsonToYamlIndentOption: SelectOptionSchema = {
  id: 'indent',
  type: 'select',
  label: 'Indentation',
  options: [
    { value: '2', label: '2 spaces' },
    { value: '4', label: '4 spaces' },
    { value: '8', label: '8 spaces' },
  ],
  default: '2',
}

const jsonToYamlSortKeysOption: SelectOptionSchema = {
  id: 'sortKeys',
  type: 'select',
  label: 'Sort Keys',
  options: [
    { value: 'auto', label: 'Auto (sort if < 100 keys)' },
    { value: 'always', label: 'Always sort alphabetically' },
    { value: 'never', label: 'Never sort (preserve order)' },
  ],
  default: 'auto',
  description: 'Alphabetically sort object keys for consistent output',
}

const jsonToYamlFlowLevelOption: SelectOptionSchema = {
  id: 'flowLevel',
  type: 'select',
  label: 'Style',
  options: [
    { value: '-1', label: 'Block style (readable)' },
    { value: '0', label: 'Flow style (compact)' },
    { value: '1', label: 'Mixed (flow for nested)' },
  ],
  default: '-1',
  description: 'Block style is more readable, flow style is more compact',
}

const jsonToYamlOptions: OptionSchema[] = [
  jsonToYamlIndentOption,
  jsonToYamlSortKeysOption,
  jsonToYamlFlowLevelOption,
]

// ============================================================================
// YAML to JSON Options
// ============================================================================

const yamlToJsonIndentOption: SelectOptionSchema = {
  id: 'indent',
  type: 'select',
  label: 'Indentation',
  options: [
    { value: '0', label: 'Minified (no whitespace)' },
    { value: '2', label: '2 spaces' },
    { value: '4', label: '4 spaces' },
  ],
  default: '2',
}

const yamlToJsonSortKeysOption: SelectOptionSchema = {
  id: 'sortKeys',
  type: 'select',
  label: 'Sort Keys',
  options: [
    { value: 'auto', label: 'Auto (sort if < 100 keys)' },
    { value: 'always', label: 'Always sort alphabetically' },
    { value: 'never', label: 'Never sort (preserve order)' },
  ],
  default: 'auto',
  description: 'Alphabetically sort object keys for consistent output',
}

const yamlToJsonOptions: OptionSchema[] = [
  yamlToJsonIndentOption,
  yamlToJsonSortKeysOption,
]

// ============================================================================
// JSON to YAML Converter
// ============================================================================

export const jsonToYaml: Converter = {
  id: 'json-to-yaml',
  label: 'JSON to YAML',
  category: 'Data',
  inputs: [JSON_TYPE],
  outputs: [YAML_TYPE],
  optionsSchema: jsonToYamlOptions,
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
      estimatedSize: Math.round(totalSize * 1.2), // YAML is often slightly larger
      estimatedTime: Math.max(100, totalSize / 100000),
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

    const indent = parseInt((input.options?.indent as string) || '2', 10)
    const sortKeysOption = (input.options?.sortKeys as string) || 'auto'
    const flowLevel = parseInt((input.options?.flowLevel as string) || '-1', 10)

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading YAML library',
      })

      // Dynamically import js-yaml
      const yaml = await import('js-yaml')

      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round(((i + 0.5) / input.files.length) * 90),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Parse JSON
        let jsonData: unknown
        try {
          jsonData = JSON.parse(content)
        } catch (e) {
          throw new Error(`${file.name}: Invalid JSON - ${e instanceof Error ? e.message : 'parse error'}`)
        }

        // Determine if we should sort keys
        const keyCount = countKeys(jsonData)
        const shouldSort = 
          sortKeysOption === 'always' || 
          (sortKeysOption === 'auto' && keyCount < 100)

        // Sort keys if needed
        if (shouldSort) {
          jsonData = sortObjectKeys(jsonData)
        }

        // Convert to YAML
        const yamlString = yaml.dump(jsonData, {
          indent,
          flowLevel: flowLevel >= 0 ? flowLevel : -1,
          lineWidth: -1, // Don't wrap lines
          noRefs: true, // Don't use YAML references
          sortKeys: false, // We already sorted if needed
        })

        // Create output blob
        const outputBlob = new Blob([yamlString], { type: 'text/yaml;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'yaml'),
          mimeType: 'text/yaml',
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
// YAML to JSON Converter
// ============================================================================

export const yamlToJson: Converter = {
  id: 'yaml-to-json',
  label: 'YAML to JSON',
  category: 'Data',
  inputs: [YAML_TYPE],
  outputs: [JSON_TYPE],
  optionsSchema: yamlToJsonOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return (
        file.type === 'text/yaml' ||
        file.type === 'application/x-yaml' ||
        ext === 'yaml' ||
        ext === 'yml'
      )
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 0.9), // JSON is often slightly smaller
      estimatedTime: Math.max(100, totalSize / 100000),
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
    const warnings: string[] = []

    const indent = parseInt((input.options?.indent as string) || '2', 10)
    const sortKeysOption = (input.options?.sortKeys as string) || 'auto'

    try {
      onProgress?.({
        percent: 0,
        stage: 'Loading YAML library',
      })

      // Dynamically import js-yaml
      const yaml = await import('js-yaml')

      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round(((i + 0.5) / input.files.length) * 90),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Parse YAML
        let yamlData: unknown
        try {
          yamlData = yaml.load(content, {
            schema: yaml.DEFAULT_SCHEMA,
            json: true, // Duplicate keys will override values
          })
        } catch (e) {
          const yamlError = e as { mark?: { line?: number; column?: number } }
          const location = yamlError.mark 
            ? ` at line ${(yamlError.mark.line || 0) + 1}, column ${(yamlError.mark.column || 0) + 1}`
            : ''
          throw new Error(`${file.name}: Invalid YAML${location}`)
        }

        // Handle empty YAML
        if (yamlData === undefined || yamlData === null) {
          yamlData = null
          warnings.push(`${file.name}: Empty YAML converted to null`)
        }

        // Determine if we should sort keys
        const keyCount = countKeys(yamlData)
        const shouldSort = 
          sortKeysOption === 'always' || 
          (sortKeysOption === 'auto' && keyCount < 100)

        // Sort keys if needed
        if (shouldSort && yamlData !== null) {
          yamlData = sortObjectKeys(yamlData)
        }

        // Convert to JSON
        const jsonString = indent === 0
          ? JSON.stringify(yamlData)
          : JSON.stringify(yamlData, null, indent)

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
        warnings: warnings.length > 0 ? warnings : undefined,
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
// Registration
// ============================================================================

/**
 * Register JSON/YAML converters
 */
export function registerJsonYamlConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(jsonToYaml, 15)
  register(yamlToJson, 15)
}
