/**
 * Sample Converters
 * 
 * These are placeholder converters that define the input/output types
 * but don't perform actual conversion yet. They're used to demonstrate
 * the registry UI integration.
 */

import type { Converter, ConversionInput, ConversionEstimate, ConversionResult } from './types'
import { conversionRegistry, fileMatchesTypes } from './registry'

// Real converters
import { registerLineEndingConverters } from '../converters/text'
import { registerCsvJsonConverters } from '../converters/data'

/**
 * Helper to create a converter with common defaults
 */
function createConverter(
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
      // Placeholder estimation
      return {
        canConvert: true,
        estimatedTime: 1000,
        warnings: ['Conversion not yet implemented'],
      }
    },
    convert: async (_input: ConversionInput): Promise<ConversionResult> => {
      // Placeholder - no actual conversion
      return {
        success: false,
        error: 'Conversion not yet implemented',
      }
    },
  }
}

// ============================================================================
// Image Converters
// ============================================================================

const pngToJpg = createConverter({
  id: 'png-to-jpg',
  label: 'PNG to JPG',
  category: 'Images',
  inputs: [{ mimeType: 'image/png', extensions: ['png'], label: 'PNG' }],
  outputs: [{ mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPG' }],
  optionsSchema: [
    {
      id: 'quality',
      type: 'range',
      label: 'Quality',
      min: 1,
      max: 100,
      default: 85,
      unit: '%',
    },
  ],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

const jpgToPng = createConverter({
  id: 'jpg-to-png',
  label: 'JPG to PNG',
  category: 'Images',
  inputs: [{ mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPG' }],
  outputs: [{ mimeType: 'image/png', extensions: ['png'], label: 'PNG' }],
  optionsSchema: [],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

const webpToPng = createConverter({
  id: 'webp-to-png',
  label: 'WebP to PNG',
  category: 'Images',
  inputs: [{ mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' }],
  outputs: [{ mimeType: 'image/png', extensions: ['png'], label: 'PNG' }],
  optionsSchema: [],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

const pngToWebp = createConverter({
  id: 'png-to-webp',
  label: 'PNG to WebP',
  category: 'Images',
  inputs: [{ mimeType: 'image/png', extensions: ['png'], label: 'PNG' }],
  outputs: [{ mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' }],
  optionsSchema: [
    {
      id: 'quality',
      type: 'range',
      label: 'Quality',
      min: 1,
      max: 100,
      default: 80,
      unit: '%',
    },
  ],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

const jpgToWebp = createConverter({
  id: 'jpg-to-webp',
  label: 'JPG to WebP',
  category: 'Images',
  inputs: [{ mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPG' }],
  outputs: [{ mimeType: 'image/webp', extensions: ['webp'], label: 'WebP' }],
  optionsSchema: [
    {
      id: 'quality',
      type: 'range',
      label: 'Quality',
      min: 1,
      max: 100,
      default: 80,
      unit: '%',
    },
  ],
  cost: 'light',
  multiFile: true,
  streaming: false,
})

const svgToPng = createConverter({
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
  // Image converters (placeholders)
  conversionRegistry.register(pngToJpg, 10)
  conversionRegistry.register(jpgToPng, 10)
  conversionRegistry.register(webpToPng, 10)
  conversionRegistry.register(pngToWebp, 10)
  conversionRegistry.register(jpgToWebp, 10)
  conversionRegistry.register(svgToPng, 10)

  // Real converters - text
  registerLineEndingConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - data (CSV/JSON)
  registerCsvJsonConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })
}

// Auto-register on import
registerSampleConverters()
