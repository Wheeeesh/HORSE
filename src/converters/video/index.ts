/**
 * Video Converters
 * 
 * Provides video conversion using FFmpeg.wasm infrastructure.
 * 
 * Available converters:
 * - videoFormatConverter: Convert between video formats (MP4 ↔ WebM)
 * - videoToGifConverter: Convert video to animated GIF
 * 
 * Note: These are STUB implementations. Full functionality requires
 * @ffmpeg/ffmpeg and @ffmpeg/core packages to be installed.
 */

export {
  videoFormatConverter,
  videoToGifConverter,
  registerVideoConverters,
} from './videoConvert'
