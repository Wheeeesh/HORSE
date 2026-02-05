/**
 * Markdown ↔ HTML Converter
 * 
 * Converts between Markdown and HTML formats with options for:
 * - HTML sanitization (ON by default for security)
 * - GitHub Flavored Markdown (GFM) features
 * - Code syntax highlighting hints
 * 
 * Includes a built-in HTML sanitizer (no external dependencies).
 * Operates on local file bytes only, no network calls.
 * 
 * Supported Markdown Features:
 * - Headers (# to ######, and underline style)
 * - Bold (**text** or __text__)
 * - Italic (*text* or _text_)
 * - Strikethrough (~~text~~)
 * - Links [text](url) and auto-links
 * - Images ![alt](url)
 * - Code blocks (``` and indented)
 * - Inline code (`code`)
 * - Blockquotes (> text)
 * - Unordered lists (-, *, +)
 * - Ordered lists (1. 2. 3.)
 * - Horizontal rules (---, ***, ___)
 * - Tables (GFM style)
 * - Task lists (- [ ] and - [x])
 * 
 * HTML Sanitizer removes:
 * - Script tags and content
 * - Event handlers (onclick, onerror, etc.)
 * - javascript: and data: URLs
 * - Dangerous tags (iframe, object, embed, form, etc.)
 */

import type {
  Converter,
  ConversionInput,
  ConversionEstimate,
  ConversionResult,
  ProgressCallback,
  ConvertedFile,
  BooleanOptionSchema,
  SelectOptionSchema,
  OptionSchema,
} from '../../lib/convert/types'

// ============================================================================
// Types and Constants
// ============================================================================

/** Markdown file type */
const MARKDOWN_TYPE = { 
  mimeType: 'text/markdown', 
  extensions: ['md', 'markdown'], 
  label: 'Markdown' 
}

/** HTML file type */
const HTML_TYPE = { 
  mimeType: 'text/html', 
  extensions: ['html', 'htm'], 
  label: 'HTML' 
}

// ============================================================================
// Utility Functions
// ============================================================================

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
 * Get file extension
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
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Unescape HTML entities
 */
function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

// ============================================================================
// HTML Sanitizer (Built-in, no external dependencies)
// ============================================================================

/** Tags that are always removed along with their content */
const DANGEROUS_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 
  'input', 'button', 'select', 'textarea', 'applet', 'frame', 
  'frameset', 'meta', 'link', 'base', 'noscript'
])

/** Tags that are safe to keep */
const SAFE_TAGS = new Set([
  // Structure
  'html', 'head', 'body', 'main', 'article', 'section', 'nav', 'aside',
  'header', 'footer', 'div', 'span',
  // Text
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'wbr',
  // Formatting
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'small', 'big', 'sub', 'sup', 'code', 'pre', 'kbd', 'samp', 'var',
  'abbr', 'cite', 'dfn', 'q', 'blockquote', 'address',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Media (src will be sanitized)
  'img', 'figure', 'figcaption', 'picture', 'source', 'audio', 'video', 'track',
  // Links (href will be sanitized)
  'a',
  // Other
  'details', 'summary', 'time', 'data', 'ruby', 'rt', 'rp', 'bdi', 'bdo'
])

/** Attributes that are safe to keep */
const SAFE_ATTRIBUTES = new Set([
  'id', 'class', 'title', 'lang', 'dir', 'tabindex', 'role',
  'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
  'href', 'src', 'alt', 'width', 'height', 'loading', 'decoding',
  'colspan', 'rowspan', 'scope', 'headers',
  'start', 'reversed', 'type', 'value',
  'open', 'datetime', 'cite', 'download', 'target', 'rel',
  'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload'
])

/** Event handler attribute prefixes */
const EVENT_HANDLER_PATTERN = /^on[a-z]/i

/** Dangerous URL schemes */
const DANGEROUS_URL_PATTERN = /^(javascript|data|vbscript|file):/i

/**
 * Check if a URL is safe
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  
  // Allow empty, relative URLs, http, https, mailto, tel
  if (!trimmed || 
      trimmed.startsWith('/') || 
      trimmed.startsWith('#') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:')) {
    return true
  }
  
  // Block dangerous schemes
  if (DANGEROUS_URL_PATTERN.test(trimmed)) {
    return false
  }
  
  // Allow relative URLs (no scheme)
  if (!trimmed.includes(':')) {
    return true
  }
  
  return false
}

/**
 * Sanitize HTML string
 * Removes dangerous tags, event handlers, and unsafe URLs
 */
function sanitizeHtml(html: string): { html: string; removedCount: number } {
  let removedCount = 0
  let result = html
  
  // Remove dangerous tags and their content
  for (const tag of DANGEROUS_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi')
    const beforeLen = result.length
    result = result.replace(pattern, '')
    if (result.length !== beforeLen) removedCount++
    
    // Also remove self-closing variants
    const selfClosing = new RegExp(`<${tag}[^>]*/?>`, 'gi')
    const beforeLen2 = result.length
    result = result.replace(selfClosing, '')
    if (result.length !== beforeLen2) removedCount++
  }
  
  // Remove event handlers from all tags
  result = result.replace(/<([a-z][a-z0-9]*)\s+([^>]*?)\s*\/?>/gi, (match, tagName, attrs) => {
    if (!attrs) return match
    
    // Parse and filter attributes
    const cleanAttrs: string[] = []
    const attrPattern = /([a-z][a-z0-9\-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi
    let attrMatch
    
    while ((attrMatch = attrPattern.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
      
      // Skip event handlers
      if (EVENT_HANDLER_PATTERN.test(attrName)) {
        removedCount++
        continue
      }
      
      // Skip unsafe attributes
      if (!SAFE_ATTRIBUTES.has(attrName) && !attrName.startsWith('aria-') && !attrName.startsWith('data-')) {
        continue
      }
      
      // Sanitize URLs in href and src
      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attrValue)) {
        removedCount++
        continue
      }
      
      // Keep the attribute
      if (attrValue) {
        cleanAttrs.push(`${attrName}="${escapeHtml(unescapeHtml(attrValue))}"`)
      } else {
        cleanAttrs.push(attrName)
      }
    }
    
    const isSelfClosing = match.endsWith('/>')
    const attrsStr = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : ''
    return `<${tagName}${attrsStr}${isSelfClosing ? ' />' : '>'}`
  })
  
  // Remove any remaining tags that aren't in the safe list
  result = result.replace(/<\/?([a-z][a-z0-9]*)[^>]*>/gi, (match, tagName) => {
    if (SAFE_TAGS.has(tagName.toLowerCase())) {
      return match
    }
    removedCount++
    return ''
  })
  
  return { html: result, removedCount }
}

// ============================================================================
// Markdown Parser
// ============================================================================

interface MarkdownParserOptions {
  gfm: boolean // GitHub Flavored Markdown
}

/**
 * Parse Markdown to HTML
 */
function markdownToHtml(markdown: string, options: MarkdownParserOptions): string {
  const lines = markdown.split('\n')
  const output: string[] = []
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockContent: string[] = []
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'
  let inBlockquote = false
  let blockquoteContent: string[] = []
  let inTable = false
  let tableRows: string[][] = []
  let tableAlignments: ('left' | 'center' | 'right' | null)[] = []
  
  // Helper to close open blocks
  function closeBlocks(): void {
    if (inList) {
      output.push(`</${listType}>`)
      inList = false
    }
    if (inBlockquote) {
      const content = blockquoteContent.join('\n')
      output.push(`<blockquote>${parseInline(content)}</blockquote>`)
      blockquoteContent = []
      inBlockquote = false
    }
    if (inTable) {
      output.push(renderTable(tableRows, tableAlignments))
      tableRows = []
      tableAlignments = []
      inTable = false
    }
  }
  
  // Parse inline formatting
  function parseInline(text: string): string {
    let result = text
    
    // Escape HTML first (but preserve already-escaped content)
    result = escapeHtml(result)
    
    // Code spans (must be first to prevent other parsing inside)
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // Images ![alt](url "title")
    result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, 
      (_, alt, url, title) => {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<img src="${url}" alt="${alt}"${titleAttr} />`
      })
    
    // Links [text](url "title")
    result = result.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, text, url, title) => {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${url}"${titleAttr}>${text}</a>`
      })
    
    // Auto-links <url> and <email>
    result = result.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1">$1</a>')
    result = result.replace(/&lt;([^@\s]+@[^@\s]+\.[^&]+)&gt;/g, '<a href="mailto:$1">$1</a>')
    
    // Bold and italic combinations
    result = result.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    result = result.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>')
    
    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    
    // Italic
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    result = result.replace(/_([^_\s][^_]*)_/g, '<em>$1</em>')
    
    // Strikethrough (GFM)
    if (options.gfm) {
      result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>')
    }
    
    // Line breaks (two spaces at end of line)
    result = result.replace(/  $/gm, '<br />')
    
    return result
  }
  
  // Render table
  function renderTable(rows: string[][], alignments: ('left' | 'center' | 'right' | null)[]): string {
    if (rows.length === 0) return ''
    
    let html = '<table>\n'
    
    // Header row
    html += '<thead>\n<tr>\n'
    for (let i = 0; i < rows[0].length; i++) {
      const align = alignments[i] ? ` style="text-align: ${alignments[i]}"` : ''
      html += `<th${align}>${parseInline(rows[0][i].trim())}</th>\n`
    }
    html += '</tr>\n</thead>\n'
    
    // Body rows
    if (rows.length > 1) {
      html += '<tbody>\n'
      for (let r = 1; r < rows.length; r++) {
        html += '<tr>\n'
        for (let i = 0; i < rows[r].length; i++) {
          const align = alignments[i] ? ` style="text-align: ${alignments[i]}"` : ''
          html += `<td${align}>${parseInline(rows[r][i].trim())}</td>\n`
        }
        html += '</tr>\n'
      }
      html += '</tbody>\n'
    }
    
    html += '</table>'
    return html
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    
    // Code blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        closeBlocks()
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
        codeBlockContent = []
      } else {
        const langClass = codeBlockLang ? ` class="language-${codeBlockLang}"` : ''
        output.push(`<pre><code${langClass}>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
        inCodeBlock = false
        codeBlockLang = ''
      }
      continue
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }
    
    // Empty line
    if (!trimmed) {
      closeBlocks()
      continue
    }
    
    // Tables (GFM)
    if (options.gfm && trimmed.includes('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter((_, idx, arr) => 
        idx > 0 && idx < arr.length - 1 || (idx === 0 && arr[0] !== '') || (idx === arr.length - 1 && arr[arr.length - 1] !== '')
      )
      
      // Check if this is a separator row
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        if (tableRows.length === 1) {
          // This is the alignment row
          tableAlignments = cells.map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center'
            if (c.endsWith(':')) return 'right'
            if (c.startsWith(':')) return 'left'
            return null
          })
          inTable = true
          continue
        }
      } else if (inTable || tableRows.length === 0) {
        if (!inTable) closeBlocks()
        tableRows.push(cells)
        continue
      }
    }
    
    if (inTable && !trimmed.includes('|')) {
      closeBlocks()
    }
    
    // Headers
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      closeBlocks()
      const level = headerMatch[1].length
      const text = parseInline(headerMatch[2])
      output.push(`<h${level}>${text}</h${level}>`)
      continue
    }
    
    // Setext headers (underline style)
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim()
      if (/^=+$/.test(nextLine)) {
        closeBlocks()
        output.push(`<h1>${parseInline(trimmed)}</h1>`)
        i++ // Skip the underline
        continue
      }
      if (/^-+$/.test(nextLine) && !trimmed.match(/^[-*_]{3,}$/)) {
        closeBlocks()
        output.push(`<h2>${parseInline(trimmed)}</h2>`)
        i++ // Skip the underline
        continue
      }
    }
    
    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed.replace(/\s/g, ''))) {
      closeBlocks()
      output.push('<hr />')
      continue
    }
    
    // Blockquote
    if (trimmed.startsWith('>')) {
      if (!inBlockquote) {
        closeBlocks()
        inBlockquote = true
      }
      blockquoteContent.push(trimmed.slice(1).trim())
      continue
    }
    
    // Unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeBlocks()
        inList = true
        listType = 'ul'
        output.push('<ul>')
      }
      
      // Task list (GFM)
      if (options.gfm) {
        const taskMatch = ulMatch[1].match(/^\[([ xX])\]\s+(.*)$/)
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x' ? ' checked' : ''
          output.push(`<li><input type="checkbox" disabled${checked} /> ${parseInline(taskMatch[2])}</li>`)
          continue
        }
      }
      
      output.push(`<li>${parseInline(ulMatch[1])}</li>`)
      continue
    }
    
    // Ordered list
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeBlocks()
        inList = true
        listType = 'ol'
        const start = parseInt(olMatch[1], 10)
        output.push(start === 1 ? '<ol>' : `<ol start="${start}">`)
      }
      output.push(`<li>${parseInline(olMatch[2])}</li>`)
      continue
    }
    
    // Indented code block (4 spaces or 1 tab)
    if (line.startsWith('    ') || line.startsWith('\t')) {
      closeBlocks()
      const code = line.startsWith('\t') ? line.slice(1) : line.slice(4)
      output.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
      continue
    }
    
    // Paragraph
    closeBlocks()
    output.push(`<p>${parseInline(trimmed)}</p>`)
  }
  
  // Close any remaining blocks
  closeBlocks()
  
  // Handle unclosed code block
  if (inCodeBlock) {
    const langClass = codeBlockLang ? ` class="language-${codeBlockLang}"` : ''
    output.push(`<pre><code${langClass}>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
  }
  
  return output.join('\n')
}

// ============================================================================
// HTML to Markdown Parser
// ============================================================================

/**
 * Convert HTML to Markdown
 * Handles common HTML elements
 */
function htmlToMarkdown(html: string): string {
  let result = html
  
  // Normalize whitespace in tags
  result = result.replace(/\s+/g, ' ')
  
  // Remove comments
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  
  // Headers
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  result = result.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  result = result.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
  
  // Bold
  result = result.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
  
  // Italic
  result = result.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
  
  // Strikethrough
  result = result.replace(/<(del|s|strike)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
  
  // Code blocks
  result = result.replace(/<pre[^>]*><code(?:\s+class="language-([^"]*)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, 
    (_, lang, code) => {
      const language = lang || ''
      return `\n\`\`\`${language}\n${unescapeHtml(code)}\n\`\`\`\n`
    })
  
  // Inline code
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  
  // Links
  result = result.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
  
  // Images
  result = result.replace(/<img\s+[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
  result = result.replace(/<img\s+[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)')
  result = result.replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
  
  // Blockquotes
  result = result.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = content.trim().split('\n')
    return '\n' + lines.map((line: string) => `> ${line.trim()}`).join('\n') + '\n'
  })
  
  // Unordered lists
  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n') + '\n'
  })
  
  // Ordered lists
  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let index = 1
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => `${index++}. $1\n`) + '\n'
  })
  
  // Tables
  result = result.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[][] = []
    
    // Extract header
    const theadMatch = tableContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)
    if (theadMatch) {
      const headerCells: string[] = []
      theadMatch[1].replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_: string, cell: string) => {
        headerCells.push(cell.trim())
        return ''
      })
      if (headerCells.length > 0) rows.push(headerCells)
    }
    
    // Extract body rows
    const tbodyMatch = tableContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
    const bodyContent = tbodyMatch ? tbodyMatch[1] : tableContent
    
    bodyContent.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_: string, rowContent: string) => {
      const cells: string[] = []
      rowContent.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (_: string, cell: string) => {
        cells.push(cell.trim())
        return ''
      })
      if (cells.length > 0) rows.push(cells)
      return ''
    })
    
    if (rows.length === 0) return ''
    
    // Build markdown table
    const colCount = Math.max(...rows.map(r => r.length))
    let md = '\n'
    
    // Header
    md += '| ' + rows[0].map(c => c || ' ').join(' | ') + ' |\n'
    md += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n'
    
    // Body
    for (let i = 1; i < rows.length; i++) {
      md += '| ' + rows[i].map(c => c || ' ').join(' | ') + ' |\n'
    }
    
    return md + '\n'
  })
  
  // Horizontal rules
  result = result.replace(/<hr\s*\/?>/gi, '\n---\n')
  
  // Line breaks
  result = result.replace(/<br\s*\/?>/gi, '  \n')
  
  // Paragraphs
  result = result.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
  
  // Divs and spans (just extract content)
  result = result.replace(/<(div|span)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
  
  // Remove remaining tags
  result = result.replace(/<[^>]+>/g, '')
  
  // Unescape HTML entities
  result = unescapeHtml(result)
  
  // Clean up whitespace
  result = result.replace(/\n{3,}/g, '\n\n')
  result = result.trim()
  
  return result
}

// ============================================================================
// Converter Options
// ============================================================================

const mdToHtmlOptions: OptionSchema[] = [
  {
    id: 'sanitize',
    type: 'boolean',
    label: 'Sanitize output',
    default: true,
    description: 'Remove potentially dangerous HTML (scripts, event handlers)',
  } as BooleanOptionSchema,
  {
    id: 'gfm',
    type: 'boolean',
    label: 'GitHub Flavored Markdown',
    default: true,
    description: 'Enable tables, task lists, and strikethrough',
  } as BooleanOptionSchema,
  {
    id: 'wrapper',
    type: 'select',
    label: 'Output wrapper',
    options: [
      { value: 'none', label: 'No wrapper (fragment)' },
      { value: 'full', label: 'Full HTML document' },
      { value: 'article', label: 'Article element' },
    ],
    default: 'none',
  } as SelectOptionSchema,
]

const htmlToMdOptions: OptionSchema[] = [
  {
    id: 'sanitize',
    type: 'boolean',
    label: 'Sanitize input first',
    default: true,
    description: 'Clean HTML before converting (recommended)',
  } as BooleanOptionSchema,
]

// ============================================================================
// Markdown to HTML Converter
// ============================================================================

export const mdToHtml: Converter = {
  id: 'markdown-to-html',
  label: 'Markdown to HTML',
  category: 'Data',
  inputs: [MARKDOWN_TYPE],
  outputs: [HTML_TYPE],
  optionsSchema: mdToHtmlOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'text/markdown' || 
             file.type === 'text/x-markdown' ||
             ext === 'md' || 
             ext === 'markdown'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 1.5), // HTML typically larger
      estimatedTime: Math.max(100, totalSize / 100000),
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

    const shouldSanitize = input.options?.sanitize !== false
    const gfm = input.options?.gfm !== false
    const wrapper = (input.options?.wrapper as string) || 'none'

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
        
        // Convert Markdown to HTML
        let html = markdownToHtml(content, { gfm })
        
        // Sanitize if enabled
        if (shouldSanitize) {
          const sanitized = sanitizeHtml(html)
          html = sanitized.html
          if (sanitized.removedCount > 0) {
            warnings.push(`${file.name}: Sanitizer removed ${sanitized.removedCount} potentially dangerous element(s)`)
          }
        }
        
        // Apply wrapper
        if (wrapper === 'full') {
          const title = file.name.replace(/\.(md|markdown)$/i, '')
          html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
${html}
</body>
</html>`
        } else if (wrapper === 'article') {
          html = `<article>\n${html}\n</article>`
        }

        // Create output blob
        const outputBlob = new Blob([html], { type: 'text/html;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'html'),
          mimeType: 'text/html',
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
// HTML to Markdown Converter
// ============================================================================

export const htmlToMd: Converter = {
  id: 'html-to-markdown',
  label: 'HTML to Markdown',
  category: 'Data',
  inputs: [HTML_TYPE],
  outputs: [MARKDOWN_TYPE],
  optionsSchema: htmlToMdOptions,
  cost: 'trivial',
  multiFile: true,
  streaming: false,

  canHandle: (files: File[]) => {
    if (files.length === 0) return false
    return files.every(file => {
      const ext = getExtension(file.name)
      return file.type === 'text/html' || 
             ext === 'html' || 
             ext === 'htm'
    })
  },

  estimate: async (input: ConversionInput): Promise<ConversionEstimate> => {
    const totalSize = input.files.reduce((sum, f) => sum + f.size, 0)
    return {
      canConvert: true,
      estimatedSize: Math.round(totalSize * 0.7), // Markdown typically smaller
      estimatedTime: Math.max(100, totalSize / 100000),
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

    const shouldSanitize = input.options?.sanitize !== false

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
        let content = await readFileAsText(file)
        
        // Sanitize HTML first if enabled
        if (shouldSanitize) {
          const sanitized = sanitizeHtml(content)
          content = sanitized.html
          if (sanitized.removedCount > 0) {
            warnings.push(`${file.name}: Sanitizer removed ${sanitized.removedCount} potentially dangerous element(s) before conversion`)
          }
        }
        
        // Extract body content if full HTML document
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        if (bodyMatch) {
          content = bodyMatch[1]
        }
        
        // Convert HTML to Markdown
        const markdown = htmlToMarkdown(content)

        // Create output blob
        const outputBlob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
        totalOutputSize += outputBlob.size

        outputFiles.push({
          name: replaceExtension(file.name, 'md'),
          mimeType: 'text/markdown',
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
// Registration
// ============================================================================

/**
 * Register Markdown/HTML converters
 */
export function registerMarkdownHtmlConverters(
  register: (converter: Converter, priority?: number) => void
): void {
  register(mdToHtml, 15)
  register(htmlToMd, 15)
}
