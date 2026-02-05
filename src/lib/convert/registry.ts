/**
 * Conversion Registry
 * 
 * Central registry for file converters. Provides:
 * - Converter registration and lookup
 * - Finding converters by file type or category
 * - Priority-based converter selection
 */

import type {
  Converter,
  ConverterRegistration,
  ConversionCategory,
  FileTypeDescriptor,
} from './types'

/**
 * Registry of all available converters
 */
class ConversionRegistry {
  private converters: Map<string, ConverterRegistration> = new Map()

  /**
   * Register a converter
   * @param converter - Converter to register
   * @param priority - Priority for handling conflicts (default: 0)
   */
  register(converter: Converter, priority: number = 0): void {
    if (this.converters.has(converter.id)) {
      console.warn(`Converter "${converter.id}" is already registered. Overwriting.`)
    }
    
    this.converters.set(converter.id, {
      converter,
      priority,
      enabled: true,
    })
  }

  /**
   * Unregister a converter by ID
   */
  unregister(id: string): boolean {
    return this.converters.delete(id)
  }

  /**
   * Get a converter by ID
   */
  get(id: string): Converter | undefined {
    const registration = this.converters.get(id)
    return registration?.enabled ? registration.converter : undefined
  }

  /**
   * Get all registered converters
   */
  getAll(): Converter[] {
    return Array.from(this.converters.values())
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(r => r.converter)
  }

  /**
   * Get converters by category
   */
  getByCategory(category: ConversionCategory): Converter[] {
    return this.getAll().filter(c => c.category === category)
  }

  /**
   * Find converters that can handle the given file(s)
   * Returns converters sorted by priority (highest first)
   */
  findConvertersForFiles(files: File[]): Converter[] {
    return this.getAll().filter(c => c.canHandle(files))
  }

  /**
   * Find converters that can convert from a specific input type
   */
  findConvertersForInputType(mimeType: string): Converter[] {
    return this.getAll().filter(c =>
      c.inputs.some(input => matchesMimeType(mimeType, input.mimeType))
    )
  }

  /**
   * Find converters that can produce a specific output type
   */
  findConvertersForOutputType(mimeType: string): Converter[] {
    return this.getAll().filter(c =>
      c.outputs.some(output => matchesMimeType(mimeType, output.mimeType))
    )
  }

  /**
   * Find converters for a specific input→output conversion
   */
  findConverters(inputMimeType: string, outputMimeType: string): Converter[] {
    return this.getAll().filter(c =>
      c.inputs.some(input => matchesMimeType(inputMimeType, input.mimeType)) &&
      c.outputs.some(output => matchesMimeType(outputMimeType, output.mimeType))
    )
  }

  /**
   * Get the best converter for files (highest priority that can handle)
   */
  getBestConverter(files: File[]): Converter | undefined {
    const converters = this.findConvertersForFiles(files)
    return converters[0] // Already sorted by priority
  }

  /**
   * Enable/disable a converter
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const registration = this.converters.get(id)
    if (registration) {
      registration.enabled = enabled
      return true
    }
    return false
  }

  /**
   * Check if a converter is enabled
   */
  isEnabled(id: string): boolean {
    return this.converters.get(id)?.enabled ?? false
  }

  /**
   * Get all supported input types across all converters
   */
  getAllInputTypes(): FileTypeDescriptor[] {
    const seen = new Set<string>()
    const types: FileTypeDescriptor[] = []
    
    for (const converter of this.getAll()) {
      for (const input of converter.inputs) {
        if (!seen.has(input.mimeType)) {
          seen.add(input.mimeType)
          types.push(input)
        }
      }
    }
    
    return types
  }

  /**
   * Get all supported output types across all converters
   */
  getAllOutputTypes(): FileTypeDescriptor[] {
    const seen = new Set<string>()
    const types: FileTypeDescriptor[] = []
    
    for (const converter of this.getAll()) {
      for (const output of converter.outputs) {
        if (!seen.has(output.mimeType)) {
          seen.add(output.mimeType)
          types.push(output)
        }
      }
    }
    
    return types
  }

  /**
   * Clear all registered converters
   */
  clear(): void {
    this.converters.clear()
  }

  /**
   * Get count of registered converters
   */
  get size(): number {
    return this.converters.size
  }
}

/**
 * Check if a MIME type matches a pattern
 * Supports wildcards like 'image/*'
 */
function matchesMimeType(actual: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') {
    return true
  }
  
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1) // 'image/*' -> 'image/'
    return actual.startsWith(prefix)
  }
  
  return actual === pattern
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return ''
  }
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Check if file matches any of the type descriptors
 */
export function fileMatchesTypes(file: File, types: FileTypeDescriptor[]): boolean {
  const extension = getFileExtension(file.name)
  
  for (const type of types) {
    // Check MIME type
    if (matchesMimeType(file.type, type.mimeType)) {
      return true
    }
    
    // Check extension as fallback (some files may have empty/wrong MIME type)
    if (extension && type.extensions.includes(extension)) {
      return true
    }
  }
  
  return false
}

/**
 * Global conversion registry instance
 */
export const conversionRegistry = new ConversionRegistry()

// Re-export types for convenience
export type { Converter, ConverterRegistration, ConversionCategory, FileTypeDescriptor }
