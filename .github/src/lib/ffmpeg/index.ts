/**
 * FFmpeg Module
 * 
 * Provides lazy-loaded FFmpeg.wasm infrastructure for video processing.
 * 
 * Features:
 * - Progress tracking during load and transcode
 * - Cancellation support via AbortSignal (best-effort)
 * - Memory estimation and warnings
 * - Single-threaded fallback when COOP/COEP not available
 * 
 * Usage:
 *   import { getFFmpegLoader, estimateMemoryRequirements } from './lib/ffmpeg';
 *   
 *   const estimate = estimateMemoryRequirements(file);
 *   if (estimate.warning) console.warn(estimate.warning);
 *   
 *   const ffmpeg = getFFmpegLoader();
 *   await ffmpeg.load(onLoadProgress);
 *   const result = await ffmpeg.run(config, onProgress, abortSignal);
 */

// Types
export type {
  FFmpegLoadState,
  FFmpegLoadProgress,
  FFmpegOperationProgress,
  FFmpegJobConfig,
  FFmpegJobResult,
  FFmpegCapabilities,
  VideoMetadata,
  MemoryEstimate,
} from './types'

// Capabilities and utilities
export {
  checkFFmpegCapabilities,
  estimateMemoryRequirements,
  formatBytes,
  getVideoMimeType,
  isVideoFile,
  generateOutputFilename,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
} from './capabilities'

// Loader
export {
  FFmpegLoader,
  getFFmpegLoader,
  disposeFFmpegLoader,
  type LoadProgressCallback,
  type OperationProgressCallback,
  type LogCallback,
} from './loader'
