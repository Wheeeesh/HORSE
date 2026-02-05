import { useState, useEffect, useRef } from 'react'
import { Link, FileText, Wifi, User, Mail, MessageSquare, Phone, MapPin, QrCode, Download, Copy, Check, X, AlertTriangle, Upload, Trash2, Save, FolderOpen, ChevronDown, Layers } from 'lucide-react'
import QRCode from 'qrcode'
import { formatQRContent, formatContactData, formatWiFiData, validateWiFiData, formatEmailData, formatSMSData, formatPhoneData, formatLocationData, validateLocationData, type QRType, type ContactData, type WiFiData, type WiFiAuthType, type EmailData, type SMSData, type PhoneData, type LocationData, type LocationFormat } from '../lib/qr/formatters'
import { downloadSVG, downloadPNG, downloadPDF } from '../lib/qr/exports'
import { copyQRToClipboard, isClipboardSupported } from '../lib/qr/clipboard'
import { applyQRStyles, supportedDotStyles, supportedCornerStyles, gradientDirections, type DotStyle, type CornerStyle, type GradientConfig, type GradientDirection } from '../lib/qr/styles'
import { embedLogoInSvg, readFileAsDataUrl, isValidImageFile, isLogoScaleRisky, getRecommendedErrorCorrection, type LogoConfig } from '../lib/qr/logo'
import { getPresets, savePreset, deletePreset, exportPreset, importPresetFromJson, readFileAsText, type QRPreset, type QRPresetSettings } from '../lib/qr/presets'
import { parseContentLines, generateBatchZip, downloadBlob, generateZipFilename, type BatchProgress } from '../lib/qr/batch'

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

const errorCorrectionLevels: { value: ErrorCorrectionLevel; label: string; description: string }[] = [
  { value: 'L', label: 'L', description: '7%' },
  { value: 'M', label: 'M', description: '15%' },
  { value: 'Q', label: 'Q', description: '25%' },
  { value: 'H', label: 'H', description: '30%' },
]

const qrTypes: { icon: typeof Link; label: QRType }[] = [
  { icon: Link, label: 'URL' },
  { icon: FileText, label: 'Text' },
  { icon: Wifi, label: 'WiFi' },
  { icon: User, label: 'Contact' },
  { icon: Mail, label: 'Email' },
  { icon: MessageSquare, label: 'SMS' },
  { icon: Phone, label: 'Phone' },
  { icon: MapPin, label: 'Location' },
]

const placeholders: Record<QRType, string> = {
  URL: 'https://example.com',
  Text: 'Enter your text here',
  WiFi: 'WIFI:T:WPA;S:NetworkName;P:Password;;',
  Contact: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nEND:VCARD',
  Email: 'mailto:example@email.com',
  SMS: 'sms:+1234567890?body=Hello',
  Phone: 'tel:+1234567890',
  Location: 'geo:40.7128,-74.0060',
}

export function QRCodeView() {
  const [selectedType, setSelectedType] = useState<QRType>('URL')
  const [content, setContent] = useState('')
  const [foreground, setForeground] = useState('#000000')
  const [background, setBackground] = useState('#ffffff')
  const [transparentBackground, setTransparentBackground] = useState(false)
  const [gradientEnabled, setGradientEnabled] = useState(false)
  const [gradientStart, setGradientStart] = useState('#000000')
  const [gradientEnd, setGradientEnd] = useState('#3b82f6')
  const [gradientDirection, setGradientDirection] = useState<GradientDirection>('to-bottom-right')
  const [errorCorrection, setErrorCorrection] = useState<ErrorCorrectionLevel>('M')
  const [userSelectedEC, setUserSelectedEC] = useState<ErrorCorrectionLevel>('M')
  const [size, setSize] = useState(256)
  const [margin, setMargin] = useState(2)
  const [dotStyle, setDotStyle] = useState<DotStyle>('square')
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>('square')
  const [logoEnabled, setLogoEnabled] = useState(false)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoScale, setLogoScale] = useState(0.2)
  const [logoPadding, setLogoPadding] = useState(true)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const presetImportRef = useRef<HTMLInputElement>(null)
  const [presets, setPresets] = useState<QRPreset[]>([])
  const [showPresetMenu, setShowPresetMenu] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Contact form fields (used when selectedType === 'Contact')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactOrg, setContactOrg] = useState('')
  const [contactTitle, setContactTitle] = useState('')

  // WiFi form fields (used when selectedType === 'WiFi')
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiAuthType, setWifiAuthType] = useState<WiFiAuthType>('WPA2')
  const [wifiHidden, setWifiHidden] = useState(false)
  const [wifiValidationErrors, setWifiValidationErrors] = useState<string[]>([])

  // Email form fields (used when selectedType === 'Email')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')

  // SMS form fields (used when selectedType === 'SMS')
  const [smsPhone, setSmsPhone] = useState('')
  const [smsBody, setSmsBody] = useState('')

  // Phone form field (used when selectedType === 'Phone')
  const [phoneNumber, setPhoneNumber] = useState('')

  // Location form fields (used when selectedType === 'Location')
  const [locationLat, setLocationLat] = useState('')
  const [locationLon, setLocationLon] = useState('')
  const [locationFormat, setLocationFormat] = useState<LocationFormat>('geo')
  const [locationValidationErrors, setLocationValidationErrors] = useState<string[]>([])

  // Auto-bump error correction when logo is enabled
  // Logo embedding requires higher EC to maintain scannability
  useEffect(() => {
    if (logoEnabled && logoDataUrl) {
      const recommended = getRecommendedErrorCorrection(logoScale)
      const ecOrder: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H']
      const currentIndex = ecOrder.indexOf(userSelectedEC)
      const recommendedIndex = ecOrder.indexOf(recommended)
      
      // Auto-bump to at least H when logo is enabled for safety
      if (currentIndex < 3) { // Not already H
        setErrorCorrection('H')
      } else {
        setErrorCorrection(userSelectedEC)
      }
    } else {
      setErrorCorrection(userSelectedEC)
    }
  }, [logoEnabled, logoDataUrl, logoScale, userSelectedEC])

  // Check if logo scale is risky
  const logoScaleWarning = logoEnabled && logoDataUrl && isLogoScaleRisky(logoScale, errorCorrection)

  // Auto-hide toast after 2 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Load presets from localStorage on mount
  useEffect(() => {
    setPresets(getPresets())
  }, [])

  // Close preset menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showPresetMenu) {
        const target = e.target as HTMLElement
        if (!target.closest('[data-preset-menu]')) {
          setShowPresetMenu(false)
          setShowSaveInput(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPresetMenu])

  // Get current settings as preset settings object
  const getCurrentSettings = (): QRPresetSettings => ({
    foreground,
    background,
    transparentBackground,
    gradientEnabled,
    gradientStart,
    gradientEnd,
    gradientDirection,
    errorCorrection: userSelectedEC,
    size,
    margin,
    dotStyle,
    cornerStyle,
    logoEnabled,
    logoDataUrl,
    logoScale,
    logoPadding,
  })

  // Apply preset settings to current state
  const applyPresetSettings = (settings: QRPresetSettings) => {
    setForeground(settings.foreground)
    setBackground(settings.background)
    setTransparentBackground(settings.transparentBackground)
    setGradientEnabled(settings.gradientEnabled)
    setGradientStart(settings.gradientStart)
    setGradientEnd(settings.gradientEnd)
    setGradientDirection(settings.gradientDirection)
    setUserSelectedEC(settings.errorCorrection)
    setSize(settings.size)
    setMargin(settings.margin)
    setDotStyle(settings.dotStyle)
    setCornerStyle(settings.cornerStyle)
    setLogoEnabled(settings.logoEnabled)
    setLogoDataUrl(settings.logoDataUrl)
    setLogoScale(settings.logoScale)
    setLogoPadding(settings.logoPadding)
  }

  const handleSavePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`
    const preset = savePreset(name, getCurrentSettings())
    if (preset) {
      setPresets(getPresets())
      setPresetName('')
      setShowSaveInput(false)
      setToast({ message: `Saved "${preset.name}"`, success: true })
    } else {
      setToast({ message: 'Failed to save preset', success: false })
    }
  }

  const handleLoadPreset = (preset: QRPreset) => {
    applyPresetSettings(preset.settings)
    setShowPresetMenu(false)
    setToast({ message: `Loaded "${preset.name}"`, success: true })
  }

  const handleDeletePreset = (e: React.MouseEvent, preset: QRPreset) => {
    e.stopPropagation()
    if (deletePreset(preset.id)) {
      setPresets(getPresets())
      setToast({ message: `Deleted "${preset.name}"`, success: true })
    }
  }

  const handleExportPreset = (e: React.MouseEvent, preset: QRPreset) => {
    e.stopPropagation()
    exportPreset(preset)
  }

  const handleImportPreset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await readFileAsText(file)
      const result = importPresetFromJson(content)
      
      if (result.error) {
        setToast({ message: result.error, success: false })
      } else {
        setPresets(getPresets())
        const count = result.presets.length
        setToast({ message: `Imported ${count} preset${count > 1 ? 's' : ''}`, success: true })
      }
    } catch (err) {
      setToast({ message: 'Failed to read file', success: false })
    }

    // Reset input
    if (presetImportRef.current) {
      presetImportRef.current.value = ''
    }
  }

  const handleCopy = async () => {
    if (!qrSvg) return
    const result = await copyQRToClipboard(qrSvg, size)
    setToast({ message: result.message, success: result.success })
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidImageFile(file)) {
      setToast({ message: 'Invalid image file type', success: false })
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setLogoDataUrl(dataUrl)
      setLogoEnabled(true)
    } catch (err) {
      console.error('Failed to read logo file:', err)
      setToast({ message: 'Failed to read image', success: false })
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setLogoDataUrl(null)
    setLogoEnabled(false)
  }

  // Count lines for batch mode display
  const batchLineCount = batchMode ? parseContentLines(content).length : 0

  const handleGenerate = async () => {
    const rawContent = content || placeholders[selectedType]
    if (!rawContent) return

    // Build gradient config
    const gradient: GradientConfig = {
      enabled: gradientEnabled,
      startColor: gradientStart,
      endColor: gradientEnd,
      direction: gradientDirection,
    }

    // Build logo config
    const logoConfig: LogoConfig = {
      enabled: logoEnabled,
      dataUrl: logoDataUrl,
      scale: logoScale,
      padding: logoPadding,
    }

    // Batch mode: generate multiple QRs and download as ZIP
    if (batchMode) {
      const lines = parseContentLines(rawContent)
      if (lines.length === 0) {
        setToast({ message: 'No content lines to process', success: false })
        return
      }

      setIsGenerating(true)
      setBatchProgress({ current: 0, total: lines.length, currentItem: '' })

      try {
        const zipBlob = await generateBatchZip(
          lines,
          {
            errorCorrection,
            size,
            margin,
            foreground,
            background,
            transparentBackground,
            gradient,
            dotStyle,
            cornerStyle,
            logoConfig,
          },
          (progress) => setBatchProgress(progress)
        )

        downloadBlob(zipBlob, generateZipFilename())
        setToast({ message: `Generated ${lines.length} QR codes`, success: true })
      } catch (err) {
        console.error('Batch generation failed:', err)
        setToast({ message: 'Batch generation failed', success: false })
      } finally {
        setIsGenerating(false)
        setBatchProgress(null)
      }
      return
    }

    // Single mode: generate one QR and show preview
    // Handle Contact type specially - use structured fields if no raw vCard is provided
    let formattedContent: string
    if (selectedType === 'Contact') {
      // Check if user entered a raw vCard in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && trimmedContent.toUpperCase().startsWith('BEGIN:VCARD')) {
        // User provided raw vCard, use it directly
        formattedContent = trimmedContent
      } else {
        // Use structured contact fields
        const contactData: ContactData = {
          firstName: contactFirstName,
          lastName: contactLastName,
          phone: contactPhone,
          email: contactEmail,
          organization: contactOrg,
          title: contactTitle,
        }
        formattedContent = formatContactData(contactData)
      }
    } else if (selectedType === 'WiFi') {
      // Check if user entered a raw WIFI: string in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && trimmedContent.toUpperCase().startsWith('WIFI:')) {
        // User provided raw WiFi string, use it directly
        formattedContent = trimmedContent
        setWifiValidationErrors([])
      } else {
        // Use structured WiFi fields with validation
        const wifiData: WiFiData = {
          ssid: wifiSsid,
          password: wifiPassword,
          authType: wifiAuthType,
          hidden: wifiHidden,
        }
        
        const validation = validateWiFiData(wifiData)
        setWifiValidationErrors(validation.errors)
        
        if (!validation.valid) {
          return // Don't generate if validation fails
        }
        
        formattedContent = formatWiFiData(wifiData)
      }
    } else if (selectedType === 'Email') {
      // Check if user entered a raw mailto: string in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && trimmedContent.toLowerCase().startsWith('mailto:')) {
        formattedContent = trimmedContent
      } else {
        // Use structured email fields
        const emailData: EmailData = {
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
        }
        formattedContent = formatEmailData(emailData)
      }
    } else if (selectedType === 'SMS') {
      // Check if user entered a raw sms: string in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && trimmedContent.toLowerCase().startsWith('sms:')) {
        formattedContent = trimmedContent
      } else {
        // Use structured SMS fields
        const smsData: SMSData = {
          phone: smsPhone,
          body: smsBody,
        }
        formattedContent = formatSMSData(smsData)
      }
    } else if (selectedType === 'Phone') {
      // Check if user entered a raw tel: string in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && trimmedContent.toLowerCase().startsWith('tel:')) {
        formattedContent = trimmedContent
      } else {
        // Use structured phone field
        const phoneData: PhoneData = {
          phone: phoneNumber || content.trim(),
        }
        formattedContent = formatPhoneData(phoneData)
      }
    } else if (selectedType === 'Location') {
      // Check if user entered a raw geo: or URL string in the textarea
      const trimmedContent = content.trim()
      if (trimmedContent && (trimmedContent.toLowerCase().startsWith('geo:') || trimmedContent.toLowerCase().startsWith('http'))) {
        formattedContent = trimmedContent
        setLocationValidationErrors([])
      } else {
        // Use structured location fields with validation
        const locationData: LocationData = {
          latitude: locationLat,
          longitude: locationLon,
          format: locationFormat,
        }
        
        const validation = validateLocationData(locationData)
        setLocationValidationErrors(validation.errors)
        
        if (!validation.valid) {
          return // Don't generate if validation fails
        }
        
        formattedContent = formatLocationData(locationData)
      }
    } else {
      // Format content based on selected type
      formattedContent = formatQRContent(selectedType, rawContent)
    }
    if (!formattedContent) return

    try {
      const baseSvg = await QRCode.toString(formattedContent, {
        type: 'svg',
        errorCorrectionLevel: errorCorrection,
        color: {
          dark: foreground,
          light: transparentBackground ? '#00000000' : background,
        },
        width: size,
        margin: margin,
      })
      
      // Apply dot and corner styles
      let styledSvg = applyQRStyles(baseSvg, {
        dotStyle,
        cornerStyle,
        foreground,
        background,
        transparentBackground,
        gradient,
        size,
        margin,
      })

      // Embed logo if enabled
      styledSvg = embedLogoInSvg(styledSvg, logoConfig)
      
      setQrSvg(styledSvg)
    } catch (err) {
      console.error('QR generation failed:', err)
    }
  }

  return (
    <div className="flex gap-8 px-6 py-8 max-w-5xl mx-auto">
      <div className="flex-1">
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Type</h3>
          <div className="grid grid-cols-4 gap-3">
            {qrTypes.map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => setSelectedType(label)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-sm ${
                  selectedType === label
                    ? 'border-gray-900 bg-white'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 p-4 border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Content</h3>
            {selectedType !== 'Contact' && selectedType !== 'WiFi' && selectedType !== 'Location' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBatchMode(!batchMode)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border ${
                    batchMode
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  title="Batch mode: each line generates a separate QR code"
                >
                  <Layers className="w-3 h-3" />
                  Batch
                </button>
                {batchMode && batchLineCount > 0 && (
                  <span className="text-xs text-gray-500">{batchLineCount} items</span>
                )}
              </div>
            )}
          </div>
          
          {selectedType === 'WiFi' ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Network Name (SSID) *</label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => { setWifiSsid(e.target.value); setWifiValidationErrors([]) }}
                  placeholder="MyNetwork"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Security</label>
                  <select
                    value={wifiAuthType}
                    onChange={(e) => { setWifiAuthType(e.target.value as WiFiAuthType); setWifiValidationErrors([]) }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="WPA2">WPA/WPA2</option>
                    <option value="WPA3">WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">None (Open)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Password {wifiAuthType !== 'nopass' && '*'}
                  </label>
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => { setWifiPassword(e.target.value); setWifiValidationErrors([]) }}
                    placeholder={wifiAuthType === 'nopass' ? '(not required)' : 'Enter password'}
                    disabled={wifiAuthType === 'nopass'}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 ${wifiAuthType === 'nopass' ? 'bg-gray-50 text-gray-400' : ''}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wifiHidden"
                  checked={wifiHidden}
                  onChange={(e) => setWifiHidden(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="wifiHidden" className="text-xs text-gray-500">Hidden network</label>
              </div>
              {wifiValidationErrors.length > 0 && (
                <div className="flex items-start gap-1 text-red-600 text-xs">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{wifiValidationErrors.join('. ')}</span>
                </div>
              )}
              <p className="text-xs text-gray-400">
                Or paste raw WIFI: string below (optional)
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="WIFI:T:WPA;S:MyNetwork;P:password;;"
                className="w-full h-12 px-3 py-2 border border-gray-200 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          ) : selectedType === 'Contact' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">First Name</label>
                  <input
                    type="text"
                    value={contactFirstName}
                    onChange={(e) => setContactFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Last Name</label>
                  <input
                    type="text"
                    value={contactLastName}
                    onChange={(e) => setContactLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+1 555-123-4567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Organization</label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    placeholder="Acme Inc."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Title</label>
                  <input
                    type="text"
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    placeholder="Software Engineer"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Or paste raw vCard in the text area below (optional)
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="BEGIN:VCARD&#10;VERSION:3.0&#10;..."
                className="w-full h-16 px-3 py-2 border border-gray-200 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          ) : selectedType === 'Location' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Latitude *</label>
                  <input
                    type="text"
                    value={locationLat}
                    onChange={(e) => { setLocationLat(e.target.value); setLocationValidationErrors([]) }}
                    placeholder="40.7128"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Longitude *</label>
                  <input
                    type="text"
                    value={locationLon}
                    onChange={(e) => { setLocationLon(e.target.value); setLocationValidationErrors([]) }}
                    placeholder="-74.0060"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Format</label>
                <select
                  value={locationFormat}
                  onChange={(e) => setLocationFormat(e.target.value as LocationFormat)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  <option value="geo">geo: URI (standard)</option>
                  <option value="maps">Google Maps URL</option>
                </select>
              </div>
              {locationValidationErrors.length > 0 && (
                <div className="flex items-start gap-1 text-red-600 text-xs">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{locationValidationErrors.join('. ')}</span>
                </div>
              )}
              <p className="text-xs text-gray-400">
                Or paste raw geo: or maps URL below (optional)
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="geo:40.7128,-74.0060"
                className="w-full h-12 px-3 py-2 border border-gray-200 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          ) : (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={batchMode ? 'Enter one item per line...\nhttps://example.com\nhttps://another.com' : placeholders[selectedType]}
                className={`w-full px-3 py-2 border border-gray-200 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 ${batchMode ? 'h-32' : 'h-24'}`}
              />
              {batchMode && (
                <p className="mt-2 text-xs text-gray-500">
                  Each non-empty line will generate a separate QR code. All codes will be downloaded as a ZIP file.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mb-6 p-4 border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Presets</h3>
            <div className="relative" data-preset-menu>
              <div className="flex gap-2">
                {showSaveInput ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="Preset name"
                      className="w-28 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSavePreset()
                        if (e.key === 'Escape') setShowSaveInput(false)
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleSavePreset}
                      className="px-2 py-1 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setShowSaveInput(true)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      onClick={() => setShowPresetMenu(!showPresetMenu)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <FolderOpen className="w-3 h-3" />
                      Load
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <input
                      ref={presetImportRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportPreset}
                      className="hidden"
                    />
                    <button
                      onClick={() => presetImportRef.current?.click()}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                      title="Import preset from JSON file"
                    >
                      <Upload className="w-3 h-3" />
                      Import
                    </button>
                  </>
                )}
              </div>
              {showPresetMenu && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                  {presets.length === 0 ? (
                    <div className="p-3 text-xs text-gray-500 text-center">
                      No saved presets
                    </div>
                  ) : (
                    presets.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleLoadPreset(preset)}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{preset.name}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(preset.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={(e) => handleExportPreset(e, preset)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            title="Export preset"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeletePreset(e, preset)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="Delete preset"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 border border-gray-200 rounded-xl">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Style</h3>
          <div className="flex gap-8 mb-4">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Foreground</label>
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-lg border border-gray-200"
                  style={{ 
                    backgroundColor: gradientEnabled ? undefined : foreground,
                    background: gradientEnabled 
                      ? `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` 
                      : undefined 
                  }}
                />
                {gradientEnabled ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={gradientStart}
                      onChange={(e) => setGradientStart(e.target.value)}
                      className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-200"
                      title="Start color"
                    />
                    <input
                      type="text"
                      value={gradientEnd}
                      onChange={(e) => setGradientEnd(e.target.value)}
                      className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-200"
                      title="End color"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={foreground}
                    onChange={(e) => setForeground(e.target.value)}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Background</label>
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-lg border border-gray-200"
                  style={{ 
                    backgroundColor: transparentBackground ? undefined : background,
                    backgroundImage: transparentBackground 
                      ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                      : undefined,
                    backgroundSize: transparentBackground ? '8px 8px' : undefined,
                    backgroundPosition: transparentBackground ? '0 0, 0 4px, 4px -4px, -4px 0px' : undefined,
                  }}
                />
                <input
                  type="text"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  disabled={transparentBackground}
                  className={`w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 ${
                    transparentBackground ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-6 mb-4">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Gradient</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setGradientEnabled(!gradientEnabled)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                    gradientEnabled
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {gradientEnabled ? 'On' : 'Off'}
                </button>
                {gradientEnabled && (
                  <div className="flex gap-1">
                    {gradientDirections.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setGradientDirection(value)}
                        title={value}
                        className={`w-8 h-8 text-xs font-medium rounded-lg border ${
                          gradientDirection === value
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Transparent BG</label>
              <button
                onClick={() => setTransparentBackground(!transparentBackground)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  transparentBackground
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {transparentBackground ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          <div className="flex gap-6 mb-4">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">
                Error Correction
                {logoEnabled && logoDataUrl && errorCorrection !== userSelectedEC && (
                  <span className="text-amber-600 ml-1" title="Auto-bumped to H for logo compatibility">(auto: H)</span>
                )}
              </label>
              <div className="flex gap-1">
                {errorCorrectionLevels.map(({ value, label, description }) => (
                  <button
                    key={value}
                    onClick={() => setUserSelectedEC(value)}
                    title={`${description} recovery`}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      userSelectedEC === value
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Size</label>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value={128}>128px</option>
                <option value={256}>256px</option>
                <option value={512}>512px</option>
                <option value={1024}>1024px</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Margin</label>
              <select
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value={0}>None</option>
                <option value={1}>Small</option>
                <option value={2}>Medium</option>
                <option value={4}>Large</option>
              </select>
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Dot Style</label>
              <div className="flex gap-1">
                {supportedDotStyles.map(({ value, label, supported }) => (
                  <button
                    key={value}
                    onClick={() => supported && setDotStyle(value)}
                    disabled={!supported}
                    title={supported ? label : 'Not supported by current renderer'}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      !supported
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : dotStyle === value
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Corner Style</label>
              <div className="flex gap-1">
                {supportedCornerStyles.map(({ value, label, supported }) => (
                  <button
                    key={value}
                    onClick={() => supported && setCornerStyle(value)}
                    disabled={!supported}
                    title={supported ? label : 'Not supported by current renderer'}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      !supported
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : cornerStyle === value
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-6 items-end">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Logo</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                {logoDataUrl ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-lg border border-gray-200 bg-cover bg-center"
                      style={{ backgroundImage: `url(${logoDataUrl})` }}
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="p-1.5 text-gray-500 hover:text-red-500 rounded"
                      title="Remove logo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:border-gray-300"
                  >
                    <Upload className="w-3 h-3" />
                    Upload
                  </button>
                )}
              </div>
            </div>
            {logoDataUrl && (
              <>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Scale ({Math.round(logoScale * 100)}%)</label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.4"
                    step="0.05"
                    value={logoScale}
                    onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                    className="w-24 h-1.5 accent-gray-900"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Padding</label>
                  <button
                    onClick={() => setLogoPadding(!logoPadding)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      logoPadding
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {logoPadding ? 'On' : 'Off'}
                  </button>
                </div>
              </>
            )}
            {logoScaleWarning && (
              <div className="flex items-center gap-1 text-amber-600 text-xs">
                <AlertTriangle className="w-3 h-3" />
                <span>Large logo may affect scanning</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-3 bg-black text-white rounded-xl font-medium ${
            isGenerating ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        >
          {isGenerating && batchProgress ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating {batchProgress.current}/{batchProgress.total}...
            </span>
          ) : batchMode ? (
            `Generate ${batchLineCount || 0} QR Codes`
          ) : (
            'Generate QR Code'
          )}
        </button>
      </div>

      <div 
        className="w-80 border border-gray-200 rounded-xl flex flex-col items-center justify-center p-8 relative"
        style={{
          backgroundImage: transparentBackground && qrSvg
            ? 'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)'
            : undefined,
          backgroundSize: transparentBackground && qrSvg ? '16px 16px' : undefined,
          backgroundPosition: transparentBackground && qrSvg ? '0 0, 0 8px, 8px -8px, -8px 0px' : undefined,
        }}
      >
        {/* Toast message */}
        {toast && (
          <div
            className={`absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded text-xs ${
              toast.success
                ? 'bg-gray-900 text-white'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {toast.success ? (
              <Check className="w-3 h-3" />
            ) : (
              <X className="w-3 h-3" />
            )}
            {toast.message}
          </div>
        )}

        {qrSvg ? (
          <>
            <div
              className="w-64 h-64"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => downloadSVG(qrSvg, selectedType)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-3 h-3" />
                SVG
              </button>
              <button
                onClick={() => downloadPNG(qrSvg, selectedType, size)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-3 h-3" />
                PNG
              </button>
              <button
                onClick={() => downloadPDF(qrSvg, selectedType, size)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-3 h-3" />
                PDF
              </button>
              <button
                disabled
                title="EPS export requires server-side conversion to maintain vector quality. Not yet supported offline."
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
              >
                <Download className="w-3 h-3" />
                EPS
              </button>
              {isClipboardSupported() && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              )}
            </div>
          </>
        ) : batchMode ? (
          <>
            <div className="text-gray-300 mb-2">
              <Layers className="w-16 h-16" strokeWidth={1} />
            </div>
            <span className="text-gray-400 text-sm text-center">
              Batch Mode
              {batchLineCount > 0 && (
                <span className="block text-xs mt-1">{batchLineCount} items → ZIP</span>
              )}
            </span>
          </>
        ) : (
          <>
            <div className="text-gray-300 mb-2">
              <QrCode className="w-16 h-16" strokeWidth={1} />
            </div>
            <span className="text-gray-400 text-sm">Preview</span>
          </>
        )}
      </div>
    </div>
  )
}
