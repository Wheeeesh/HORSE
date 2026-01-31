/**
 * QR Code logo embedding utilities
 * Embeds a logo image in the center of a QR code SVG
 */

export interface LogoConfig {
  enabled: boolean
  dataUrl: string | null
  scale: number // 0.1 to 0.4 (10% to 40% of QR size)
  padding: boolean // white padding around logo
}

export const DEFAULT_LOGO_CONFIG: LogoConfig = {
  enabled: false,
  dataUrl: null,
  scale: 0.2, // 20% default
  padding: true,
}

/**
 * Maximum recommended logo scale for each error correction level
 * Higher EC levels can tolerate larger logos
 */
export const MAX_SAFE_SCALE: Record<string, number> = {
  L: 0.1,  // 7% recovery - very limited
  M: 0.15, // 15% recovery - small logos only
  Q: 0.22, // 25% recovery - moderate logos
  H: 0.3,  // 30% recovery - larger logos OK
}

/**
 * Check if logo scale is risky for the given error correction level
 */
export function isLogoScaleRisky(scale: number, errorCorrection: string): boolean {
  const maxSafe = MAX_SAFE_SCALE[errorCorrection] || 0.15
  return scale > maxSafe
}

/**
 * Get the minimum recommended error correction level for a given logo scale
 */
export function getRecommendedErrorCorrection(scale: number): 'L' | 'M' | 'Q' | 'H' {
  if (scale <= 0.1) return 'L'
  if (scale <= 0.15) return 'M'
  if (scale <= 0.22) return 'Q'
  return 'H'
}

/**
 * Read a file as data URL (local only, no network)
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file as data URL'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Embed a logo into an SVG QR code
 * Returns the modified SVG string with the logo embedded
 */
export function embedLogoInSvg(
  svgString: string,
  logoConfig: LogoConfig
): string {
  if (!logoConfig.enabled || !logoConfig.dataUrl) {
    return svgString
  }

  // Parse SVG dimensions
  const viewBoxMatch = svgString.match(/viewBox="0 0 (\d+) (\d+)"/)
  const widthMatch = svgString.match(/width="(\d+)"/)
  const heightMatch = svgString.match(/height="(\d+)"/)

  if (!viewBoxMatch) return svgString

  const viewBoxSize = parseInt(viewBoxMatch[1])
  const svgWidth = widthMatch ? parseInt(widthMatch[1]) : viewBoxSize
  const svgHeight = heightMatch ? parseInt(heightMatch[1]) : viewBoxSize

  // Calculate logo dimensions in viewBox units
  const logoSize = viewBoxSize * logoConfig.scale
  const logoX = (viewBoxSize - logoSize) / 2
  const logoY = (viewBoxSize - logoSize) / 2

  // Build logo element with optional padding
  let logoElement = ''

  if (logoConfig.padding) {
    // White background padding (slightly larger than logo)
    const paddingSize = logoSize * 1.15
    const paddingX = (viewBoxSize - paddingSize) / 2
    const paddingY = (viewBoxSize - paddingSize) / 2
    const paddingRadius = paddingSize * 0.1

    logoElement += `<rect x="${paddingX}" y="${paddingY}" width="${paddingSize}" height="${paddingSize}" rx="${paddingRadius}" fill="white"/>`
  }

  // Logo image
  logoElement += `<image x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" href="${logoConfig.dataUrl}" preserveAspectRatio="xMidYMid slice"/>`

  // Insert logo before closing </svg> tag
  const closingTagIndex = svgString.lastIndexOf('</svg>')
  if (closingTagIndex === -1) return svgString

  const modifiedSvg =
    svgString.slice(0, closingTagIndex) +
    '\n  ' +
    logoElement +
    '\n' +
    svgString.slice(closingTagIndex)

  return modifiedSvg
}

/**
 * Validate that a file is an acceptable image type
 */
export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']
  return validTypes.includes(file.type)
}
