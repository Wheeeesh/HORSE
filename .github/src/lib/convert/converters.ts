/**
 * Converters Registration
 * 
 * Registers all available converters with the conversion registry.
 * Real converters are imported from their respective modules.
 */

import { conversionRegistry } from './registry'

// Real converters
import { registerLineEndingConverters } from '../../converters/text'
import { registerCsvJsonConverters, registerXlsxConverters, registerJsonYamlConverters, registerXmlJsonConverters, registerMarkdownHtmlConverters } from '../../converters/data'
import { registerRasterConverters, registerImageToPdfConverter, registerSvgConverters } from '../../converters/images'
import { registerArchiveConverters, registerExtractZipConverter } from '../../converters/archives'
import { registerPdfConverters, registerSplitPdfConverter, registerPdfToImageConverter } from '../../converters/pdf'
import { registerVideoConverters } from '../../converters/video'

// ============================================================================
// Register all converters
// ============================================================================

export function registerSampleConverters(): void {
  // Real converters - images (PNG/JPEG/WebP)
  registerRasterConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - SVG to PNG
  registerSvgConverters((converter, priority) => {
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

  // Real converters - data (Excel/XLSX)
  registerXlsxConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - data (JSON/YAML)
  registerJsonYamlConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - data (XML/JSON)
  registerXmlJsonConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })

  // Real converters - data (Markdown/HTML)
  registerMarkdownHtmlConverters((converter, priority) => {
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

  // Real converters - Video (FFmpeg.wasm stub)
  registerVideoConverters((converter, priority) => {
    conversionRegistry.register(converter, priority)
  })
}

// Auto-register on import
registerSampleConverters()
