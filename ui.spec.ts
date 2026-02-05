import { test, expect } from '@playwright/test'

// Disable animations for deterministic screenshots
const disableAnimations = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`

// Check if a URL is allowed (local only)
function isAllowedUrl(url: string): boolean {
  // Allow data: and blob: URLs
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return true
  }

  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname

    // Allow localhost and 127.0.0.1
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    ) {
      return true
    }

    return false
  } catch {
    // If URL parsing fails, allow it (likely a relative URL)
    return true
  }
}

// Track remote requests per test
let remoteRequests: string[] = []

test.beforeEach(async ({ page }) => {
  // Reset tracking for each test
  remoteRequests = []

  // Listen for all requests and track remote ones
  page.on('request', (request) => {
    const url = request.url()
    if (!isAllowedUrl(url)) {
      remoteRequests.push(url)
    }
  })

  // Inject CSS to disable animations
  await page.addStyleTag({ content: disableAnimations })
})

test.afterEach(async () => {
  // Fail if any remote requests were made
  expect(
    remoteRequests,
    `Remote network requests detected (local-first violation):\n${remoteRequests.join('\n')}`
  ).toHaveLength(0)
})

test.describe('UI Screenshot Tests', () => {
  test('Convert tab default', async ({ page }) => {
    await page.goto('/')
    
    // Wait for the page to be fully loaded
    await page.waitForSelector('text=Drop files to convert')
    
    // Disable animations
    await page.addStyleTag({ content: disableAnimations })
    
    // Take screenshot
    await expect(page).toHaveScreenshot('convert-tab-default.png', {
      fullPage: true,
    })
  })

  test('QR Code tab default', async ({ page }) => {
    await page.goto('/')
    
    // Click QR Code tab
    await page.click('button:has-text("QR Code")')
    
    // Wait for QR Code view to be visible
    await page.waitForSelector('text=Generate QR Code')
    
    // Disable animations
    await page.addStyleTag({ content: disableAnimations })
    
    // Take screenshot
    await expect(page).toHaveScreenshot('qrcode-tab-default.png', {
      fullPage: true,
    })
  })

  test('Support modal open', async ({ page }) => {
    await page.goto('/')
    
    // Click Support button
    await page.click('button:has-text("Support")')
    
    // Wait for modal to be visible
    await page.waitForSelector('text=Support TADAA')
    
    // Disable animations
    await page.addStyleTag({ content: disableAnimations })
    
    // Take screenshot
    await expect(page).toHaveScreenshot('support-modal-open.png', {
      fullPage: true,
    })
  })
})
