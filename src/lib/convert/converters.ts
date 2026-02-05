/**
 * Converters Registration
 * 
 * Registers all available converters with the conversion registry.
 * Real converters are imported from their respective modules.
 * Placeholder converters are defined inline for formats not yet implemented.
 */

import type { Converter, ConversionInput, ConversionEstimate, ConversionResult } from './types'
import { conversionRegistry, fileMatchesTypes } from './registry'

// Real converters
import { registerLineEndingConverters } from '../../converters/text'
import { registerCsvJsonConverters } from '../../converters/data'
import { registerRasterConverters, registerImageToPdfConverter } from '../../converters/images'
import { registerArchiveConverters, registerExtractZipConverter } from '../../converters/archives'
import { registerPdfConverters, registerSplitPdfConverter, registerPdfToImageConverter } from '../../converters/pdf'

/**
 * Helper to create a placeholder converter
 */
function createPlaceholder(
  config: Omit<Converter, 'canHandle' | 'estimate' | 'convert'>
): Converter {
  return {
    ...config,
    canHandle: (files: File[]) => {
      if (files.length === 0) return false
      if (!config.multiFile && files.length > 1) return false
      return files.every(file => fileMatchesTypes(file, config.inputs))
    },
    estimate: async (_input: ConversionInput): Promise<ConversionEstimate> => {
      return {
        canConvert: true,
        estimatedTime: 1000,
        warnings: ['Conversion not yet implemented'],
      }
    },
    convert: async (_input: ConversionInput): Promise<ConversionResult> => {
      return {
        success: false,
        error: 'Conversion not yet implemented',
      }
    },
  }
}

// ============================================================================
// Placeholder Converters (not yet implemented)
// ============================================================================

const svgToPng = createPlaceholder({
  id: 'svg-to-png',
  label: 'SVG to PNG',
  category: 'Images',
  inputs: [{ mimeType: 'image/svg+xml', extensions: ['svg'], label: 'SVG' }],
  outputs: [{ mimeType: 'image/png', extensions: ['png'], label: 'PNG' }],
  optionsSchema: [
    {
      id: 'width',
      type: 'number',
      label: 'Width',
      default: 1024,
      min: 1,
      max: 8192,
    },
    {
      id: 'height',
      type: 'number',
      label: 'Height',
      default: 1024,
      min: 1,
      max: 8192,
    },
  ],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

// ============================================================================
// Register all converters
// ============================================================================

export function registerSampleConverters(): void {
  // Placeholder converters (not yet implemented)
  conversionRegistry.register(svgToPng, 10)

  // Real converters - images (PNG/JPEG/WebP)
  registerRasterConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - image to PDF
  registerImageToPdfConverter((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - text (line endings)
  registerLineEndingConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - data (CSV/JSON)
  registerCsvJsonConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - archives (ZIP create)
  registerArchiveConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - archives (ZIP extract)
  registerExtractZipConverter((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - PDF (merge)
  registerPdfConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - PDF (split)
  registerSplitPdfConverter((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - PDF (to image)
  registerPdfToImageConverter((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })
}

// Auto-register on import
registerSampleConverters()
