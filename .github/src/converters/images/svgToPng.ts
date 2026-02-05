/**
 * SVG to PNG Converter
 *
 * Rasterizes SVG files into PNG images using the Canvas API.
 * Features:
 * - Optional width/height override
 * - Multi-file support
 *
 * Operates locally using browser Canvas API, no network calls.
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  NumberOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// File Type Definitions
// ============================================================================

const SVG_TYPE = { mimeType: 'image/svg+xml', extensions: ['svg'], label: 'SVG' }
const PNG_TYPE = { mimeType: 'image/png', extensions: ['png'], label: 'PNG' }

// ============================================================================
// Utility Functions
// ============================================================================

function parseLength(value: string | undefined): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.endsWith('%')) return undefined
  const numeric = parseFloat(trimmed)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

function parseSvgDimensions(svgText: string): { width?: number; height?: number } {
  const widthMatch = svgText.match(/\bwidth="([^"]+)"/i)
  const heightMatch = svgText.match(/\bheight="([^"]+)"/i)
  const viewBoxMatch = svgText.match(/\bviewBox="([^"]+)"/i)

  const width = parseLength(widthMatch?.[1])
  const height = parseLength(heightMatch?.[1])

  if (width && height) {
    return { width, height }
  }

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const viewBoxWidth = parts[2]
      const viewBoxHeight = parts[3]
      if (viewBoxWidth > 0 && viewBoxHeight > 0) {
        return {
          width: width || viewBoxWidth,
          height: height || viewBoxHeight,
        }
      }
    }
  }

  return { width, height }
}

function getTargetDimensions(
  svgText: string,
  widthOption?: number,
  heightOption?: number
): { width: number; height: number } {
  const normalizedWidth = widthOption && widthOption > 0 ? Math.round(widthOption) : undefined
  const normalizedHeight = heightOption && heightOption > 0 ? Math.round(heightOption) : undefined

  if (normalizedWidth && normalizedHeight) {
    return { width: normalizedWidth, height: normalizedHeight }
  }

  const { width: svgWidth, height: svgHeight } = parseSvgDimensions(svgText)
  const ratio = svgWidth && svgHeight ? svgWidth / svgHeight : undefined

  if (normalizedWidth && ratio) {
    return { width: normalizedWidth, height: Math.round(normalizedWidth / ratio) }
  }

  if (normalizedHeight && ratio) {
    return { width: Math.round(normalizedHeight * ratio), height: normalizedHeight }
  }

  if (svgWidth && svgHeight) {
    return { width: Math.round(svgWidth), height: Math.round(svgHeight) }
  }

  // Final fallback
  return { width: normalizedWidth || 1024, height: normalizedHeight || 1024 }
}

function loadSvgImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG image'))
    }

    img.src = url
  })
}

async function renderSvgToPng(svgText: string, width: number, height: number): Promise<Blob> {
  const img = await loadSvgImage(svgText)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to render PNG'))
      }
    }, 'image/png')
  })
}

function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return `${filename}.${newExt}`
  return `${filename.slice(0, lastDot)}.${newExt}`
}

// ============================================================================
// Option Schemas
// ============================================================================

const widthOption: NumberOptionSchema = {
  id: 'width',
  type: 'number',
  label: 'Width',
  default: 1024,
  min: 1,
  max: 8192,
}

const heightOption: NumberOptionSchema = {
  id: 'height',
  type: 'number',
  label: 'Height',
  default: 1024,
  min: 1,
  max: 8192,
}

const optionsSchema: OptionSchema[] = [widthOption, heightOption]

// ============================================================================
// SVG to PNG Converter
// ============================================================================

export const svgToPng: Converter = {
  id: 'svg-to-png',
  label: 'SVG to PNG',
  category: 'Images',
  inputs: [SVG_TYPE],
  outputs: [PNG_TYPE],
  optionsSchema,
  cost: 'light',
  multiFile: true,
  streaming: true,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every((file) => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    const width = (input.options?.width as number) || 1024
    const height = (input.options?.height as number) || 1024
    const estimatedSize = Math.round(width * height * 4 * input.files.length * 0.1)

    return {
      canConvert: true,
      estimatedSize: Math.max(estimatedSize, totalSize),
      estimatedTime: Math.max(200, totalSize / 50000),
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

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i]
      totalInputSize += file.size

      onProgress?.({
        percent: Math.round((i / input.files.length) * 80),
        stage: `Rasterizing ${file.name}`,
        bytesProcessed: totalInputSize,
      })

      const svgText = await file.text()
      const { width, height } = getTargetDimensions(
        svgText,
        input.options?.width as number,
        input.options?.height as number
      )

      const pngBlob = await renderSvgToPng(svgText, width, height)
      totalOutputSize += pngBlob.size

      outputFiles.push({
        name: replaceExtension(file.name, 'png'),
        mimeType: 'image/png',
        data: pngBlob,
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
        compressionRatio: totalInputSize > 0 ? totalOutputSize / totalInputSize : 1,
      },
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

export function registerSvgConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(svgToPng, 15)
}
