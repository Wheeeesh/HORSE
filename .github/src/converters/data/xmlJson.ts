/**
 * XML ↔ JSON Converter
 * 
 * Converts between XML and JSON formats with options for:
 * - Attribute handling mode (prefixed @attr vs merged)
 * - Text content handling (#text for mixed content)
 * - Pretty print formatting
 * 
 * Operates on local file bytes only, no network calls.
 * 
 * Edge Cases Documented:
 * - Empty elements: <tag/> → {} or "" depending on context
 * - Mixed content: <p>Hello <b>world</b></p> → uses #text for text nodes
 * - Repeated elements: multiple same-name siblings → array
 * - CDATA sections: preserved as text content
 * - Comments: stripped during parsing
 * - Processing instructions: stripped (<?xml ...?>)
 * - Namespaces: preserved in element/attribute names as-is
 * - Special characters: properly escaped/unescaped (&lt; &gt; &amp; &quot; &apos;)
 * - Whitespace: text nodes trimmed, pure whitespace nodes ignored
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  SelectOptionSchema,
  BooleanOptionSchema,
} from '../../lib/convert/types'

/**
 * XML file type
 */
const XML_FILE_TYPE = { mimeType: 'application/xml', extensions: ['xml'], label: 'XML' }

/**
 * JSON file type
 */
const JSON_FILE_TYPE = { mimeType: 'application/json', extensions: ['json'], label: 'JSON' }

/**
 * Attribute handling mode
 */
type AttributeMode = 'prefix' | 'group' | 'merge'

/**
 * XML Node types for internal parsing
 */
interface XMLTextNode {
  type: 'text'
  value: string
}

interface XMLElementNode {
  type: 'element'
  name: string
  attributes: Record<string, string>
  children: XMLNode[]
}

type XMLNode = XMLTextNode | XMLElementNode

/**
 * Read file as text
 */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Replace file extension
 */
function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return `${filename}.${newExt}`
  return `${filename.slice(0, lastDot)}.${newExt}`
}

/**
 * Unescape XML entities
 */
function unescapeXML(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

/**
 * Escape XML entities
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Parse XML string into node tree
 * Simple recursive descent parser - handles common XML structures
 */
function parseXML(xml: string): XMLElementNode {
  // Remove BOM if present
  let content = xml.replace(/^\uFEFF/, '')
  
  // Remove XML declaration
  content = content.replace(/<\?xml[^?]*\?>/gi, '')
  
  // Remove comments
  content = content.replace(/<!--[\s\S]*?-->/g, '')
  
  // Remove DOCTYPE
  content = content.replace(/<!DOCTYPE[^>]*>/gi, '')
  
  // Trim whitespace
  content = content.trim()
  
  if (!content) {
    throw new Error('Empty XML document')
  }
  
  let pos = 0
  
  function skipWhitespace(): void {
    while (pos < content.length && /\s/.test(content[pos])) {
      pos++
    }
  }
  
  function parseName(): string {
    const start = pos
    // XML names can start with letter, underscore, or colon (for namespaces)
    // and contain letters, digits, hyphens, underscores, colons, periods
    while (pos < content.length && /[a-zA-Z0-9_:\-.]/.test(content[pos])) {
      pos++
    }
    return content.slice(start, pos)
  }
  
  function parseAttributeValue(): string {
    const quote = content[pos]
    if (quote !== '"' && quote !== "'") {
      throw new Error(`Expected quote at position ${pos}`)
    }
    pos++
    const start = pos
    while (pos < content.length && content[pos] !== quote) {
      pos++
    }
    const value = content.slice(start, pos)
    pos++ // skip closing quote
    return unescapeXML(value)
  }
  
  function parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {}
    
    while (pos < content.length) {
      skipWhitespace()
      
      // Check for end of opening tag
      if (content[pos] === '>' || content[pos] === '/') {
        break
      }
      
      const name = parseName()
      if (!name) break
      
      skipWhitespace()
      
      if (content[pos] !== '=') {
        // Boolean attribute (not standard XML, but handle gracefully)
        attrs[name] = 'true'
        continue
      }
      pos++ // skip '='
      
      skipWhitespace()
      attrs[name] = parseAttributeValue()
    }
    
    return attrs
  }
  
  function parseCDATA(): string {
    // pos is at '<![CDATA['
    pos += 9 // skip '<![CDATA['
    const start = pos
    const end = content.indexOf(']]>', pos)
    if (end === -1) {
      throw new Error('Unclosed CDATA section')
    }
    pos = end + 3
    return content.slice(start, end)
  }
  
  function parseElement(): XMLElementNode {
    if (content[pos] !== '<') {
      throw new Error(`Expected '<' at position ${pos}`)
    }
    pos++ // skip '<'
    
    const name = parseName()
    if (!name) {
      throw new Error(`Expected element name at position ${pos}`)
    }
    
    const attributes = parseAttributes()
    
    skipWhitespace()
    
    // Self-closing tag
    if (content[pos] === '/') {
      pos++ // skip '/'
      if (content[pos] !== '>') {
        throw new Error(`Expected '>' at position ${pos}`)
      }
      pos++ // skip '>'
      return { type: 'element', name, attributes, children: [] }
    }
    
    if (content[pos] !== '>') {
      throw new Error(`Expected '>' at position ${pos}`)
    }
    pos++ // skip '>'
    
    // Parse children
    const children: XMLNode[] = []
    
    while (pos < content.length) {
      // Check for closing tag
      if (content.slice(pos, pos + 2) === '</') {
        pos += 2 // skip '</'
        const closeName = parseName()
        if (closeName !== name) {
          throw new Error(`Mismatched closing tag: expected </${name}>, got </${closeName}>`)
        }
        skipWhitespace()
        if (content[pos] !== '>') {
          throw new Error(`Expected '>' at position ${pos}`)
        }
        pos++ // skip '>'
        break
      }
      
      // Check for CDATA
      if (content.slice(pos, pos + 9) === '<![CDATA[') {
        const text = parseCDATA()
        if (text) {
          children.push({ type: 'text', value: text })
        }
        continue
      }
      
      // Check for child element
      if (content[pos] === '<') {
        children.push(parseElement())
        continue
      }
      
      // Text content
      const start = pos
      while (pos < content.length && content[pos] !== '<') {
        pos++
      }
      const text = unescapeXML(content.slice(start, pos))
      const trimmed = text.trim()
      if (trimmed) {
        children.push({ type: 'text', value: trimmed })
      }
    }
    
    return { type: 'element', name, attributes, children }
  }
  
  skipWhitespace()
  return parseElement()
}

/**
 * Convert XML node tree to JSON object
 */
function xmlNodeToJson(
  node: XMLElementNode,
  attributeMode: AttributeMode
): unknown {
  const result: Record<string, unknown> = {}
  
  // Handle attributes based on mode
  const hasAttributes = Object.keys(node.attributes).length > 0
  
  if (hasAttributes) {
    if (attributeMode === 'prefix') {
      // Prefix attributes with @
      for (const [key, value] of Object.entries(node.attributes)) {
        result[`@${key}`] = value
      }
    } else if (attributeMode === 'group') {
      // Group all attributes under @attributes
      result['@attributes'] = { ...node.attributes }
    } else {
      // Merge attributes directly (may conflict with child element names)
      for (const [key, value] of Object.entries(node.attributes)) {
        result[key] = value
      }
    }
  }
  
  // Process children
  const elementChildren = node.children.filter((c): c is XMLElementNode => c.type === 'element')
  const textChildren = node.children.filter((c): c is XMLTextNode => c.type === 'text')
  
  // Handle text content
  if (textChildren.length > 0) {
    const textContent = textChildren.map(t => t.value).join(' ')
    
    if (elementChildren.length === 0 && !hasAttributes) {
      // Pure text element - return just the string
      return textContent
    } else {
      // Mixed content or has attributes - use #text
      result['#text'] = textContent
    }
  }
  
  // Group child elements by name (for array detection)
  const childrenByName: Record<string, XMLElementNode[]> = {}
  for (const child of elementChildren) {
    if (!childrenByName[child.name]) {
      childrenByName[child.name] = []
    }
    childrenByName[child.name].push(child)
  }
  
  // Convert children
  for (const [name, children] of Object.entries(childrenByName)) {
    if (children.length === 1) {
      // Single child - convert directly
      result[name] = xmlNodeToJson(children[0], attributeMode)
    } else {
      // Multiple children with same name - create array
      result[name] = children.map(child => xmlNodeToJson(child, attributeMode))
    }
  }
  
  // If result is empty and no text, return empty object
  if (Object.keys(result).length === 0) {
    return {}
  }
  
  return result
}

/**
 * Convert JSON value to XML string
 */
function jsonToXmlString(
  key: string,
  value: unknown,
  indent: string,
  prettyPrint: boolean,
  attributeMode: AttributeMode
): string {
  const newline = prettyPrint ? '\n' : ''
  const childIndent = prettyPrint ? indent + '  ' : ''
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return `${indent}<${key}/>${newline}`
  }
  
  // Handle primitives
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const escaped = escapeXML(String(value))
    return `${indent}<${key}>${escaped}</${key}>${newline}`
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value
      .map(item => jsonToXmlString(key, item, indent, prettyPrint, attributeMode))
      .join('')
  }
  
  // Handle objects
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const entries = Object.entries(obj)
    
    // Extract attributes and text content
    const attributes: Record<string, string> = {}
    let textContent: string | null = null
    const childEntries: [string, unknown][] = []
    
    for (const [k, v] of entries) {
      if (attributeMode === 'prefix' && k.startsWith('@') && k !== '@attributes') {
        // @attr format
        attributes[k.slice(1)] = String(v)
      } else if (attributeMode === 'group' && k === '@attributes' && typeof v === 'object' && v !== null) {
        // @attributes group format
        for (const [attrKey, attrVal] of Object.entries(v as Record<string, unknown>)) {
          attributes[attrKey] = String(attrVal)
        }
      } else if (k === '#text') {
        // Text content
        textContent = String(v)
      } else if (!k.startsWith('@') && !k.startsWith('#')) {
        // Regular child element
        childEntries.push([k, v])
      }
    }
    
    // Build attribute string
    const attrStr = Object.entries(attributes)
      .map(([k, v]) => ` ${k}="${escapeXML(v)}"`)
      .join('')
    
    // No children and no text - self-closing
    if (childEntries.length === 0 && textContent === null) {
      return `${indent}<${key}${attrStr}/>${newline}`
    }
    
    // Only text content
    if (childEntries.length === 0 && textContent !== null) {
      return `${indent}<${key}${attrStr}>${escapeXML(textContent)}</${key}>${newline}`
    }
    
    // Has children
    let xml = `${indent}<${key}${attrStr}>${newline}`
    
    if (textContent !== null) {
      xml += `${childIndent}${escapeXML(textContent)}${newline}`
    }
    
    for (const [childKey, childValue] of childEntries) {
      xml += jsonToXmlString(childKey, childValue, childIndent, prettyPrint, attributeMode)
    }
    
    xml += `${indent}</${key}>${newline}`
    return xml
  }
  
  // Fallback
  return `${indent}<${key}>${escapeXML(String(value))}</${key}>${newline}`
}

// ============================================================================
// XML to JSON Converter
// ============================================================================

const xmlToJsonOptions: (SelectOptionSchema | BooleanOptionSchema)[] = [
  {
    id: 'attributeMode',
    type: 'select',
    label: 'Attribute handling',
    options: [
      { value: 'prefix', label: 'Prefix with @ (@id, @class)' },
      { value: 'group', label: 'Group under @attributes' },
      { value: 'merge', label: 'Merge with elements (may conflict)' },
    ],
    default: 'prefix',
  },
  {
    id: 'prettyPrint',
    type: 'boolean',
    label: 'Pretty print',
    default: true,
    description: 'Format JSON with indentation',
  },
]

export const xmlToJson: Converter = {
  id: 'xml-to-json',
  label: 'XML to JSON',
  category: 'Data',
  inputs: [XML_FILE_TYPE],
  outputs: [JSON_FILE_TYPE],
  optionsSchema: xmlToJsonOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'application/xml' || 
             file.type === 'text/xml' || 
             ext === 'xml'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 1.2), // JSON may be slightly larger
      estimatedTime: Math.max(100, totalSize / 50000),
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
    const warnings: string[] = []

    const attributeMode = (input.options?.attributeMode as AttributeMode) || 'prefix'
    const prettyPrint = input.options?.prettyPrint !== false

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Parsing ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Parse XML
        let rootNode: XMLElementNode
        try {
          rootNode = parseXML(content)
        } catch (parseError) {
          throw new Error(`${file.name}: ${parseError instanceof Error ? parseError.message : 'Invalid XML'}`)
        }
        
        // Log edge cases detected
        const hasAttributes = Object.keys(rootNode.attributes).length > 0
        const hasTextContent = rootNode.children.some(c => c.type === 'text')
        const hasElements = rootNode.children.some(c => c.type === 'element')
        
        if (hasTextContent && hasElements) {
          warnings.push(`${file.name}: Mixed content detected (text + elements). Text stored in #text property.`)
        }
        
        // Check for repeated element names (array case)
        const elementNames = rootNode.children
          .filter((c): c is XMLElementNode => c.type === 'element')
          .map(c => c.name)
        const duplicateNames = elementNames.filter((name, i) => elementNames.indexOf(name) !== i)
        if (duplicateNames.length > 0) {
          const unique = [...new Set(duplicateNames)]
          warnings.push(`${file.name}: Repeated elements converted to arrays: ${unique.join(', ')}`)
        }
        
        if (hasAttributes && attributeMode === 'merge') {
          warnings.push(`${file.name}: Attributes merged directly. Check for name conflicts with child elements.`)
        }

        // Convert to JSON
        const jsonObj = {
          [rootNode.name]: xmlNodeToJson(rootNode, attributeMode)
        }

        // Convert to JSON string
        const jsonString = prettyPrint
          ? JSON.stringify(jsonObj, null, 2)
          : JSON.stringify(jsonObj)
        
        // Create output blob
        const outputBlob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'json'),
          mimeType: 'application/json',
          data: outputBlob,
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
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

// ============================================================================
// JSON to XML Converter
// ============================================================================

const jsonToXmlOptions: (SelectOptionSchema | BooleanOptionSchema)[] = [
  {
    id: 'attributeMode',
    type: 'select',
    label: 'Attribute handling',
    options: [
      { value: 'prefix', label: 'Detect @ prefix (@id → id attr)' },
      { value: 'group', label: 'Detect @attributes object' },
      { value: 'merge', label: 'All properties as elements' },
    ],
    default: 'prefix',
  },
  {
    id: 'prettyPrint',
    type: 'boolean',
    label: 'Pretty print',
    default: true,
    description: 'Format XML with indentation',
  },
  {
    id: 'rootElement',
    type: 'select',
    label: 'Root element',
    options: [
      { value: 'auto', label: 'Auto (use first key or "root")' },
      { value: 'root', label: 'Always use "root"' },
      { value: 'data', label: 'Always use "data"' },
    ],
    default: 'auto',
  },
  {
    id: 'xmlDeclaration',
    type: 'boolean',
    label: 'Include XML declaration',
    default: true,
    description: 'Add <?xml version="1.0"?> header',
  },
]

export const jsonToXml: Converter = {
  id: 'json-to-xml',
  label: 'JSON to XML',
  category: 'Data',
  inputs: [JSON_FILE_TYPE],
  outputs: [XML_FILE_TYPE],
  optionsSchema: jsonToXmlOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'application/json' || ext === 'json'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 1.3), // XML typically larger due to closing tags
      estimatedTime: Math.max(100, totalSize / 50000),
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
    const warnings: string[] = []

    const attributeMode = (input.options?.attributeMode as AttributeMode) || 'prefix'
    const prettyPrint = input.options?.prettyPrint !== false
    const rootElementOption = (input.options?.rootElement as string) || 'auto'
    const includeDeclaration = input.options?.xmlDeclaration !== false

    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        totalInputSize += file.size

        onProgress?.({
          percent: Math.round((i / input.files.length) * 80),
          stage: `Converting ${file.name}`,
          bytesProcessed: totalInputSize,
        })

        // Read file content
        const content = await readFileAsText(file)
        
        // Parse JSON
        let jsonData: unknown
        try {
          jsonData = JSON.parse(content)
        } catch {
          throw new Error(`${file.name}: Invalid JSON`)
        }

        // Determine root element and content
        let rootName: string
        let rootContent: unknown

        if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
          const keys = Object.keys(jsonData as Record<string, unknown>)
          
          if (rootElementOption === 'auto' && keys.length === 1) {
            // Single top-level key - use it as root
            rootName = keys[0]
            rootContent = (jsonData as Record<string, unknown>)[rootName]
          } else if (rootElementOption === 'auto') {
            // Multiple keys - wrap in root
            rootName = 'root'
            rootContent = jsonData
            if (keys.length > 1) {
              warnings.push(`${file.name}: Multiple top-level keys wrapped in <root> element.`)
            }
          } else {
            rootName = rootElementOption
            rootContent = jsonData
          }
        } else if (Array.isArray(jsonData)) {
          // Array at root - wrap in root with "item" elements
          rootName = rootElementOption === 'auto' ? 'root' : rootElementOption
          rootContent = { item: jsonData }
          warnings.push(`${file.name}: Array at root level wrapped in <${rootName}> with <item> elements.`)
        } else {
          // Primitive at root
          rootName = rootElementOption === 'auto' ? 'root' : rootElementOption
          rootContent = jsonData
          warnings.push(`${file.name}: Primitive value at root level.`)
        }

        // Validate root name is valid XML element name
        if (!/^[a-zA-Z_][a-zA-Z0-9_:\-\.]*$/.test(rootName)) {
          throw new Error(`${file.name}: Invalid XML element name "${rootName}"`)
        }

        // Convert to XML
        const newline = prettyPrint ? '\n' : ''
        let xmlString = ''
        
        if (includeDeclaration) {
          xmlString += `<?xml version="1.0" encoding="UTF-8"?>${newline}`
        }
        
        xmlString += jsonToXmlString(rootName, rootContent, '', prettyPrint, attributeMode)

        // Create output blob
        const outputBlob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'xml'),
          mimeType: 'application/xml',
          data: outputBlob,
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
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          processingTime: Date.now() - startTime,
          inputSize: totalInputSize,
          outputSize: totalOutputSize,
          compressionRatio: totalOutputSize / totalInputSize,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

/**
 * Register XML/JSON converters
 */
export function registerXmlJsonConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(xmlToJson, 15)
  register(jsonToXml, 15)
}
