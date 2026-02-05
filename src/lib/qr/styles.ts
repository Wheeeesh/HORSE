/**
 * QR Code styling utilities
 * Post-processes SVG to apply different module/dot styles
 */

export type DotStyle = 'square' | 'rounded' | 'dots' | 'classy'
export type CornerStyle = 'square' | 'rounded' | 'dots'
export type GradientDirection = 'to-right' | 'to-bottom' | 'to-bottom-right' | 'to-bottom-left'

export interface GradientConfig {
  enabled: boolean
  startColor: string
  endColor: string
  direction: GradientDirection
}

interface StyleOptions {
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  foreground: string
  background: string
  transparentBackground: boolean
  gradient: GradientConfig
  size: number
  margin: number
}

// Which styles are supported by our SVG post-processing
export const supportedDotStyles: { value: DotStyle; label: string; supported: boolean }[] = [
  { value: 'square', label: 'Square', supported: true },
  { value: 'rounded', label: 'Rounded', supported: true },
  { value: 'dots', label: 'Dots', supported: true },
  { value: 'classy', label: 'Classy', supported: false },
]

export const supportedCornerStyles: { value: CornerStyle; label: string; supported: boolean }[] = [
  { value: 'square', label: 'Square', supported: true },
  { value: 'rounded', label: 'Rounded', supported: true },
  { value: 'dots', label: 'Dots', supported: true },
]

export const gradientDirections: { value: GradientDirection; label: string }[] = [
  { value: 'to-right', label: '→' },
  { value: 'to-bottom', label: '↓' },
  { value: 'to-bottom-right', label: '↘' },
  { value: 'to-bottom-left', label: '↙' },
]

/**
 * Get SVG gradient coordinates based on direction
 */
function getGradientCoords(direction: GradientDirection): { x1: string; y1: string; x2: string; y2: string } {
  switch (direction) {
    case 'to-right':
      return { x1: '0%', y1: '0%', x2: '100%', y2: '0%' }
    case 'to-bottom':
      return { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }
    case 'to-bottom-right':
      return { x1: '0%', y1: '0%', x2: '100%', y2: '100%' }
    case 'to-bottom-left':
      return { x1: '100%', y1: '0%', x2: '0%', y2: '100%' }
    default:
      return { x1: '0%', y1: '0%', x2: '100%', y2: '0%' }
  }
}

/**
 * Generate SVG gradient definition
 */
function generateGradientDef(gradient: GradientConfig, id: string): string {
  const coords = getGradientCoords(gradient.direction)
  return `<linearGradient id="${id}" x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}">
    <stop offset="0%" stop-color="${gradient.startColor}"/>
    <stop offset="100%" stop-color="${gradient.endColor}"/>
  </linearGradient>`
}

/**
 * Extract module positions from QR code SVG path data
 */
function extractModules(svgString: string, size: number, margin: number): { x: number; y: number; size: number }[] {
  const modules: { x: number; y: number; size: number }[] = []
  
  // Parse the SVG to get the path data
  const pathMatch = svgString.match(/<path[^>]*d="([^"]*)"/)
  if (!pathMatch) return modules
  
  const pathData = pathMatch[1]
  
  // The qrcode library generates path data as a series of M (move) and h/v (relative line) commands
  // Each module is drawn as a small square: M x,y h size v size h -size Z
  // We need to extract these rectangles
  
  // Parse viewBox to understand coordinate system
  const viewBoxMatch = svgString.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!viewBoxMatch) return modules
  
  const viewBoxSize = parseInt(viewBoxMatch[1])
  const moduleSize = viewBoxSize > 0 ? size / viewBoxSize : 1
  
  // Extract all M commands which indicate module positions
  // Format: M x,y followed by drawing commands
  const moveRegex = /M(\d+(?:\.\d+)?)[,\s](\d+(?:\.\d+)?)/g
  let match
  
  while ((match = moveRegex.exec(pathData)) !== null) {
    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    modules.push({
      x: x * moduleSize,
      y: y * moduleSize,
      size: moduleSize
    })
  }
  
  return modules
}

/**
 * Check if a module is part of a finder pattern (corner)
 * Finder patterns are 7x7 modules at three corners
 */
function isFinderPattern(x: number, y: number, moduleSize: number, totalModules: number, margin: number): boolean {
  const moduleX = Math.round((x / moduleSize) - margin)
  const moduleY = Math.round((y / moduleSize) - margin)
  const qrSize = totalModules - (margin * 2)
  
  // Top-left finder (0-6, 0-6)
  if (moduleX >= 0 && moduleX < 7 && moduleY >= 0 && moduleY < 7) return true
  
  // Top-right finder
  if (moduleX >= qrSize - 7 && moduleX < qrSize && moduleY >= 0 && moduleY < 7) return true
  
  // Bottom-left finder
  if (moduleX >= 0 && moduleX < 7 && moduleY >= qrSize - 7 && moduleY < qrSize) return true
  
  return false
}

/**
 * Render a single module with the specified dot style
 */
function renderModule(
  x: number,
  y: number,
  size: number,
  style: DotStyle,
  color: string
): string {
  const padding = size * 0.1
  const innerSize = size - padding * 2
  
  switch (style) {
    case 'rounded':
      const radius = innerSize * 0.3
      return `<rect x="${x + padding}" y="${y + padding}" width="${innerSize}" height="${innerSize}" rx="${radius}" fill="${color}"/>`
    
    case 'dots':
      const circleRadius = innerSize / 2
      const cx = x + size / 2
      const cy = y + size / 2
      return `<circle cx="${cx}" cy="${cy}" r="${circleRadius * 0.85}" fill="${color}"/>`
    
    case 'square':
    default:
      return `<rect x="${x + padding}" y="${y + padding}" width="${innerSize}" height="${innerSize}" fill="${color}"/>`
  }
}

/**
 * Render a corner/finder pattern module with the specified style
 */
function renderCornerModule(
  x: number,
  y: number,
  size: number,
  style: CornerStyle,
  color: string
): string {
  const padding = size * 0.05
  const innerSize = size - padding * 2
  
  switch (style) {
    case 'rounded':
      const radius = innerSize * 0.35
      return `<rect x="${x + padding}" y="${y + padding}" width="${innerSize}" height="${innerSize}" rx="${radius}" fill="${color}"/>`
    
    case 'dots':
      const circleRadius = innerSize / 2
      const cx = x + size / 2
      const cy = y + size / 2
      return `<circle cx="${cx}" cy="${cy}" r="${circleRadius * 0.9}" fill="${color}"/>`
    
    case 'square':
    default:
      return `<rect x="${x + padding}" y="${y + padding}" width="${innerSize}" height="${innerSize}" fill="${color}"/>`
  }
}

/**
 * Apply styling to QR code SVG
 */
export function applyQRStyles(
  svgString: string,
  options: StyleOptions
): string {
  const { dotStyle, cornerStyle, foreground, background, transparentBackground, gradient, size, margin } = options
  
  // Determine if we need custom processing
  const needsProcessing = dotStyle !== 'square' || cornerStyle !== 'square' || gradient.enabled || transparentBackground
  
  // If no processing needed, just return original (possibly with transparent bg)
  if (!needsProcessing) {
    return svgString
  }
  
  // Extract viewBox for coordinate system
  const viewBoxMatch = svgString.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!viewBoxMatch) return svgString
  
  const viewBoxSize = parseInt(viewBoxMatch[1])
  const moduleCount = viewBoxSize // Each module is 1 unit in viewBox
  
  // Extract modules from path
  const modules = extractModules(svgString, viewBoxSize, margin)
  if (modules.length === 0) return svgString
  
  // Determine fill color (solid or gradient reference)
  const fillColor = gradient.enabled ? 'url(#qrGradient)' : foreground
  
  // Build new SVG with styled modules
  const moduleElements: string[] = []
  
  for (const mod of modules) {
    const isCorner = isFinderPattern(mod.x, mod.y, 1, moduleCount, margin)
    
    if (isCorner) {
      moduleElements.push(renderCornerModule(mod.x, mod.y, 1, cornerStyle, fillColor))
    } else {
      moduleElements.push(renderModule(mod.x, mod.y, 1, dotStyle, fillColor))
    }
  }
  
  // Build defs section
  const defs: string[] = []
  if (gradient.enabled) {
    defs.push(generateGradientDef(gradient, 'qrGradient'))
  }
  const defsSection = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : ''
  
  // Background element (transparent or colored)
  const backgroundElement = transparentBackground
    ? ''
    : `<rect width="100%" height="100%" fill="${background}"/>`
  
  // Create new SVG
  const styledSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  ${defsSection}
  ${backgroundElement}
  ${moduleElements.join('\n  ')}
</svg>`
  
  return styledSvg
}
