/**
 * QR Code presets utilities
 * Save/load QR settings to localStorage, import/export JSON
 */

import type { DotStyle, CornerStyle, GradientDirection } from './styles'

/**
 * Preset settings structure (excludes transient state like qrSvg, toast)
 * Note: logoDataUrl is included but may be large - consider size limits
 */
export interface QRPresetSettings {
  // Colors
  foreground: string
  background: string
  transparentBackground: boolean
  
  // Gradient
  gradientEnabled: boolean
  gradientStart: string
  gradientEnd: string
  gradientDirection: GradientDirection
  
  // QR options
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
  size: number
  margin: number
  
  // Styles
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  
  // Logo (dataUrl can be large)
  logoEnabled: boolean
  logoDataUrl: string | null
  logoScale: number
  logoPadding: boolean
}

export interface QRPreset {
  id: string
  name: string
  createdAt: number
  settings: QRPresetSettings
}

const STORAGE_KEY = 'qr-presets'
const MAX_PRESETS = 20

/**
 * Generate a unique ID for presets
 */
function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Get all presets from localStorage
 */
export function getPresets(): QRPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const presets = JSON.parse(stored)
    return Array.isArray(presets) ? presets : []
  } catch (err) {
    console.error('Failed to load presets:', err)
    return []
  }
}

/**
 * Save presets to localStorage
 */
function savePresets(presets: QRPreset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch (err) {
    console.error('Failed to save presets:', err)
    return false
  }
}

/**
 * Save a new preset
 */
export function savePreset(name: string, settings: QRPresetSettings): QRPreset | null {
  const presets = getPresets()
  
  // Limit number of presets
  if (presets.length >= MAX_PRESETS) {
    console.warn('Maximum presets limit reached')
    return null
  }
  
  const preset: QRPreset = {
    id: generateId(),
    name: name.trim() || `Preset ${presets.length + 1}`,
    createdAt: Date.now(),
    settings,
  }
  
  presets.push(preset)
  
  if (savePresets(presets)) {
    return preset
  }
  return null
}

/**
 * Delete a preset by ID
 */
export function deletePreset(id: string): boolean {
  const presets = getPresets()
  const filtered = presets.filter((p) => p.id !== id)
  
  if (filtered.length === presets.length) {
    return false // Preset not found
  }
  
  return savePresets(filtered)
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): QRPreset | null {
  const presets = getPresets()
  return presets.find((p) => p.id === id) || null
}

/**
 * Export a preset as a downloadable JSON file
 */
export function exportPreset(preset: QRPreset): void {
  const exportData = {
    type: 'qr-preset',
    version: 1,
    preset,
  }
  
  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `qr-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export all presets as a downloadable JSON file
 */
export function exportAllPresets(): void {
  const presets = getPresets()
  
  const exportData = {
    type: 'qr-presets-collection',
    version: 1,
    presets,
  }
  
  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `qr-presets-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Validate preset settings structure
 */
function isValidPresetSettings(settings: unknown): settings is QRPresetSettings {
  if (!settings || typeof settings !== 'object') return false
  
  const s = settings as Record<string, unknown>
  
  return (
    typeof s.foreground === 'string' &&
    typeof s.background === 'string' &&
    typeof s.transparentBackground === 'boolean' &&
    typeof s.gradientEnabled === 'boolean' &&
    typeof s.gradientStart === 'string' &&
    typeof s.gradientEnd === 'string' &&
    typeof s.gradientDirection === 'string' &&
    typeof s.errorCorrection === 'string' &&
    typeof s.size === 'number' &&
    typeof s.margin === 'number' &&
    typeof s.dotStyle === 'string' &&
    typeof s.cornerStyle === 'string' &&
    typeof s.logoEnabled === 'boolean' &&
    (s.logoDataUrl === null || typeof s.logoDataUrl === 'string') &&
    typeof s.logoScale === 'number' &&
    typeof s.logoPadding === 'boolean'
  )
}

/**
 * Import preset from JSON file content
 * Returns the imported preset(s) or null if invalid
 */
export function importPresetFromJson(jsonContent: string): { presets: QRPreset[]; error: string | null } {
  try {
    const data = JSON.parse(jsonContent)
    
    // Handle single preset
    if (data.type === 'qr-preset' && data.preset) {
      if (!isValidPresetSettings(data.preset.settings)) {
        return { presets: [], error: 'Invalid preset format' }
      }
      
      // Create new preset with fresh ID
      const imported: QRPreset = {
        id: generateId(),
        name: data.preset.name || 'Imported Preset',
        createdAt: Date.now(),
        settings: data.preset.settings,
      }
      
      const existingPresets = getPresets()
      if (existingPresets.length >= MAX_PRESETS) {
        return { presets: [], error: 'Maximum presets limit reached' }
      }
      
      existingPresets.push(imported)
      if (!savePresets(existingPresets)) {
        return { presets: [], error: 'Failed to save preset' }
      }
      
      return { presets: [imported], error: null }
    }
    
    // Handle preset collection
    if (data.type === 'qr-presets-collection' && Array.isArray(data.presets)) {
      const existingPresets = getPresets()
      const imported: QRPreset[] = []
      
      for (const preset of data.presets) {
        if (existingPresets.length + imported.length >= MAX_PRESETS) {
          break
        }
        
        if (isValidPresetSettings(preset.settings)) {
          imported.push({
            id: generateId(),
            name: preset.name || 'Imported Preset',
            createdAt: Date.now(),
            settings: preset.settings,
          })
        }
      }
      
      if (imported.length === 0) {
        return { presets: [], error: 'No valid presets found' }
      }
      
      existingPresets.push(...imported)
      if (!savePresets(existingPresets)) {
        return { presets: [], error: 'Failed to save presets' }
      }
      
      return { presets: imported, error: null }
    }
    
    return { presets: [], error: 'Invalid file format' }
  } catch (err) {
    console.error('Failed to import preset:', err)
    return { presets: [], error: 'Invalid JSON file' }
  }
}

/**
 * Read a file as text (for JSON import)
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
