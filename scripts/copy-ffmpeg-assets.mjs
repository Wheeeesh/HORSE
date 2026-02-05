import { createRequire } from 'module'
import path from 'path'
import fs from 'fs/promises'

const require = createRequire(import.meta.url)

function log(message) {
  console.log(`[ffmpeg-assets] ${message}`)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  const packageJsonPath = require.resolve('@ffmpeg/core/package.json')
  const coreRoot = path.dirname(packageJsonPath)
  const distDir = path.join(coreRoot, 'dist', 'esm')
  const outDir = path.resolve(process.cwd(), 'public', 'ffmpeg')

  const files = [
    'ffmpeg-core.js',
    'ffmpeg-core.wasm',
    'ffmpeg-core.worker.js',
  ]

  log(`Copying FFmpeg core assets from ${distDir}`)
  await fs.mkdir(outDir, { recursive: true })

  const missing = []

  for (const file of files) {
    const src = path.join(distDir, file)
    const dest = path.join(outDir, file)

    if (!(await fileExists(src))) {
      missing.push(file)
      continue
    }

    await fs.copyFile(src, dest)
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing FFmpeg core assets: ${missing.join(', ')}. ` +
        'Make sure @ffmpeg/core is installed correctly.'
    )
  }

  log(`Copied ${files.length} files to ${outDir}`)

  const logoSrc = path.resolve(process.cwd(), 'logo.png')
  const publicDir = path.resolve(process.cwd(), 'public')
  const logoDest = path.join(publicDir, 'logo.png')

  if (await fileExists(logoSrc)) {
    await fs.mkdir(publicDir, { recursive: true })
    await fs.copyFile(logoSrc, logoDest)
    log(`Copied logo.png to ${logoDest}`)
  } else {
    log('logo.png not found at project root (skipping logo copy)')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
