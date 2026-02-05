/**
 * QR Code content formatters
 * Each type has its own formatting/normalization logic
 */

export type QRType = 'URL' | 'Text' | 'WiFi' | 'Contact' | 'Email' | 'SMS' | 'Phone' | 'Location'

/**
 * Structured contact data for vCard generation
 */
export interface ContactData {
  firstName: string
  lastName: string
  phone: string
  email: string
  organization: string
  title: string
}

/**
 * WiFi authentication types
 */
export type WiFiAuthType = 'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'nopass'

/**
 * Structured WiFi data for WIFI: QR code generation
 */
export interface WiFiData {
  ssid: string
  password: string
  authType: WiFiAuthType
  hidden: boolean
}

/**
 * Validation result for WiFi data
 */
export interface WiFiValidation {
  valid: boolean
  errors: string[]
}

/**
 * Escape special characters for WiFi QR code values
 * Special chars that need escaping: \ ; , " :
 */
function escapeWiFiValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/"/g, '\\"')
    .replace(/:/g, '\\:')
}

/**
 * Validate WiFi data and return validation result
 */
export function validateWiFiData(wifi: WiFiData): WiFiValidation {
  const errors: string[] = []
  
  // SSID is required
  if (!wifi.ssid.trim()) {
    errors.push('SSID is required')
  }
  
  // Password required for secured networks
  if (wifi.authType !== 'nopass' && !wifi.password) {
    errors.push('Password is required for secured networks')
  }
  
  // WEP passwords have specific length requirements
  if (wifi.authType === 'WEP' && wifi.password) {
    const len = wifi.password.length
    // WEP keys: 5 or 13 ASCII chars, or 10 or 26 hex chars
    const validWepLength = len === 5 || len === 13 || len === 10 || len === 26
    if (!validWepLength) {
      errors.push('WEP key must be 5/13 characters or 10/26 hex digits')
    }
  }
  
  // WPA/WPA2/WPA3 passwords: 8-63 characters
  if (['WPA', 'WPA2', 'WPA3'].includes(wifi.authType) && wifi.password) {
    if (wifi.password.length < 8) {
      errors.push('Password must be at least 8 characters')
    }
    if (wifi.password.length > 63) {
      errors.push('Password must be at most 63 characters')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Generate a WIFI: QR code payload from structured WiFi data
 * Format: WIFI:T:<auth>;S:<ssid>;P:<password>;H:<hidden>;;
 */
export function formatWiFiData(wifi: WiFiData): string {
  const parts: string[] = ['WIFI:']
  
  // Authentication type (T:)
  // Note: WPA2 and WPA3 use "WPA" as the type - they're compatible
  const authType = wifi.authType === 'nopass' ? 'nopass' : 
                   wifi.authType === 'WEP' ? 'WEP' : 'WPA'
  parts.push(`T:${authType};`)
  
  // SSID (S:) - required
  parts.push(`S:${escapeWiFiValue(wifi.ssid)};`)
  
  // Password (P:) - include even if empty for consistency
  if (wifi.authType !== 'nopass') {
    parts.push(`P:${escapeWiFiValue(wifi.password)};`)
  }
  
  // Hidden (H:) - only include if true
  if (wifi.hidden) {
    parts.push('H:true;')
  }
  
  // Terminator
  parts.push(';')
  
  return parts.join('')
}

/**
 * Check if a string looks like a WIFI: format
 */
export function isWiFiFormat(content: string): boolean {
  return content.trim().toUpperCase().startsWith('WIFI:')
}

/**
 * Format content based on QR type
 * Returns the payload string to encode in the QR code
 */
export function formatQRContent(type: QRType, content: string): string {
  switch (type) {
    case 'URL':
      return formatURL(content)
    case 'Text':
      return formatText(content)
    case 'WiFi':
      return formatWiFi(content)
    case 'Contact':
      return formatContact(content)
    case 'Email':
      return formatEmail(content)
    case 'SMS':
      return formatSMS(content)
    case 'Phone':
      return formatPhone(content)
    case 'Location':
      return formatLocation(content)
    default:
      return content
  }
}

/**
 * URL: Trim whitespace, use as-is
 * No auto-validation or network calls
 */
function formatURL(content: string): string {
  return content.trim()
}

/**
 * Text: Use raw text as-is (preserve whitespace within)
 */
function formatText(content: string): string {
  return content
}

/**
 * WiFi: Pass through (user provides full WIFI: string or raw values)
 * Future: could parse SSID/password/security into WIFI: format
 */
function formatWiFi(content: string): string {
  return content.trim()
}

/**
 * Contact: Pass through vCard format (legacy textarea mode)
 * For structured input, use formatContactData() instead
 */
function formatContact(content: string): string {
  return content.trim()
}

/**
 * Escape special characters for vCard values
 * vCard uses backslash escaping for: comma, semicolon, backslash, newline
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
}

/**
 * Fold long lines per vCard spec (RFC 6350)
 * Lines should be folded at 75 octets, with continuation marked by leading space
 * Best-effort: fold at 75 chars (may not be exact for multi-byte chars)
 */
function foldVCardLine(line: string, maxLength: number = 75): string {
  if (line.length <= maxLength) {
    return line
  }
  
  const parts: string[] = []
  let remaining = line
  let isFirst = true
  
  while (remaining.length > 0) {
    const chunkSize = isFirst ? maxLength : maxLength - 1 // Account for leading space
    const chunk = remaining.slice(0, chunkSize)
    remaining = remaining.slice(chunkSize)
    
    if (isFirst) {
      parts.push(chunk)
      isFirst = false
    } else {
      parts.push(' ' + chunk) // RFC 6350: continuation line starts with space
    }
  }
  
  return parts.join('\r\n')
}

/**
 * Generate a vCard 3.0 payload from structured contact data
 * Only includes fields that have values (empty fields omitted)
 */
export function formatContactData(contact: ContactData): string {
  const lines: string[] = []
  
  // vCard header
  lines.push('BEGIN:VCARD')
  lines.push('VERSION:3.0')
  
  // Full name (FN) - required, combine first and last name
  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  
  if (fullName) {
    lines.push(foldVCardLine(`FN:${escapeVCardValue(fullName)}`))
  } else {
    // FN is required in vCard 3.0, use placeholder if empty
    lines.push('FN:')
  }
  
  // Structured name (N) - lastName;firstName;middleName;prefix;suffix
  const lastName = escapeVCardValue(contact.lastName.trim())
  const firstName = escapeVCardValue(contact.firstName.trim())
  if (lastName || firstName) {
    lines.push(foldVCardLine(`N:${lastName};${firstName};;;`))
  }
  
  // Organization
  if (contact.organization.trim()) {
    lines.push(foldVCardLine(`ORG:${escapeVCardValue(contact.organization.trim())}`))
  }
  
  // Title/role
  if (contact.title.trim()) {
    lines.push(foldVCardLine(`TITLE:${escapeVCardValue(contact.title.trim())}`))
  }
  
  // Phone
  if (contact.phone.trim()) {
    lines.push(foldVCardLine(`TEL:${escapeVCardValue(contact.phone.trim())}`))
  }
  
  // Email
  if (contact.email.trim()) {
    lines.push(foldVCardLine(`EMAIL:${escapeVCardValue(contact.email.trim())}`))
  }
  
  // vCard footer
  lines.push('END:VCARD')
  
  // Join with CRLF as per vCard spec
  return lines.join('\r\n')
}

/**
 * Check if a string looks like a valid vCard (starts with BEGIN:VCARD)
 */
export function isVCardFormat(content: string): boolean {
  return content.trim().toUpperCase().startsWith('BEGIN:VCARD')
}

/**
 * Structured email data for mailto: URI generation
 */
export interface EmailData {
  to: string
  subject: string
  body: string
}

/**
 * Structured SMS data for sms: URI generation
 */
export interface SMSData {
  phone: string
  body: string
}

/**
 * Structured phone data for tel: URI generation
 */
export interface PhoneData {
  phone: string
}

/**
 * Sanitize phone number - keep only digits, +, *, #
 * These are the valid characters for tel: URIs
 */
function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d+*#]/g, '')
}

/**
 * Generate a mailto: URI from structured email data
 * Format: mailto:address?subject=...&body=...
 * Subject and body are URI-encoded
 */
export function formatEmailData(email: EmailData): string {
  const to = email.to.trim()
  if (!to) return ''
  
  const params: string[] = []
  
  if (email.subject.trim()) {
    params.push(`subject=${encodeURIComponent(email.subject.trim())}`)
  }
  
  if (email.body.trim()) {
    params.push(`body=${encodeURIComponent(email.body.trim())}`)
  }
  
  if (params.length > 0) {
    return `mailto:${to}?${params.join('&')}`
  }
  
  return `mailto:${to}`
}

/**
 * Generate an sms: URI from structured SMS data
 * Format: sms:number?body=...
 * Body is URI-encoded
 */
export function formatSMSData(sms: SMSData): string {
  const phone = sanitizePhoneNumber(sms.phone.trim())
  if (!phone) return ''
  
  if (sms.body.trim()) {
    return `sms:${phone}?body=${encodeURIComponent(sms.body.trim())}`
  }
  
  return `sms:${phone}`
}

/**
 * Generate a tel: URI from structured phone data
 * Format: tel:number
 * Phone number is sanitized to valid tel: characters
 */
export function formatPhoneData(phone: PhoneData): string {
  const sanitized = sanitizePhoneNumber(phone.phone.trim())
  if (!sanitized) return ''
  
  return `tel:${sanitized}`
}

/**
 * Email: Ensure mailto: prefix if not present (legacy textarea mode)
 * For structured input, use formatEmailData() instead
 */
function formatEmail(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase().startsWith('mailto:')) {
    return trimmed
  }
  // If it looks like just an email address, wrap it
  return `mailto:${trimmed}`
}

/**
 * SMS: Ensure sms: prefix if not present (legacy textarea mode)
 * For structured input, use formatSMSData() instead
 */
function formatSMS(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase().startsWith('sms:')) {
    return trimmed
  }
  // Sanitize phone number part
  return `sms:${sanitizePhoneNumber(trimmed)}`
}

/**
 * Phone: Ensure tel: prefix if not present (legacy textarea mode)
 * For structured input, use formatPhoneData() instead
 */
function formatPhone(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase().startsWith('tel:')) {
    return trimmed
  }
  // Sanitize phone number
  return `tel:${sanitizePhoneNumber(trimmed)}`
}

/**
 * Location output format types
 */
export type LocationFormat = 'geo' | 'maps'

/**
 * Structured location data for geo: or maps URL generation
 */
export interface LocationData {
  latitude: string
  longitude: string
  format: LocationFormat
}

/**
 * Validation result for location data
 */
export interface LocationValidation {
  valid: boolean
  errors: string[]
}

/**
 * Validate latitude and longitude values
 */
export function validateLocationData(location: LocationData): LocationValidation {
  const errors: string[] = []
  
  const lat = parseFloat(location.latitude)
  const lon = parseFloat(location.longitude)
  
  if (!location.latitude.trim()) {
    errors.push('Latitude is required')
  } else if (isNaN(lat)) {
    errors.push('Latitude must be a number')
  } else if (lat < -90 || lat > 90) {
    errors.push('Latitude must be between -90 and 90')
  }
  
  if (!location.longitude.trim()) {
    errors.push('Longitude is required')
  } else if (isNaN(lon)) {
    errors.push('Longitude must be a number')
  } else if (lon < -180 || lon > 180) {
    errors.push('Longitude must be between -180 and 180')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Generate a geo: URI or maps URL from structured location data
 * geo format: geo:lat,lon
 * maps format: https://www.google.com/maps?q=lat,lon (works offline in QR, opens maps when scanned)
 */
export function formatLocationData(location: LocationData): string {
  const lat = location.latitude.trim()
  const lon = location.longitude.trim()
  
  if (!lat || !lon) return ''
  
  if (location.format === 'maps') {
    // Google Maps URL - no network call, just generates the URL string
    // When scanned, the phone will open the maps app
    return `https://www.google.com/maps?q=${lat},${lon}`
  }
  
  // Default: geo: URI (RFC 5870)
  return `geo:${lat},${lon}`
}

/**
 * Location: Ensure geo: prefix if not present (legacy textarea mode)
 * For structured input, use formatLocationData() instead
 */
function formatLocation(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  // Pass through if already a valid format
  if (trimmed.toLowerCase().startsWith('geo:')) {
    return trimmed
  }
  if (trimmed.toLowerCase().startsWith('http')) {
    return trimmed
  }
  return `geo:${trimmed}`
}
