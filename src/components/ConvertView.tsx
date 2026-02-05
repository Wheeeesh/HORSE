import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Upload, FileText, Image, Video, Music, Archive, Database, X, File, ArrowRight, ChevronDown, AlertCircle, Download, ChevronUp, Square, CheckCircle, AlertTriangle, Info, Package } from 'lucide-react'
import { conversionRegistry, type Converter, type ConverterOptions } from '../lib/convert'
import { ConvertOptionsForm, getDefaultValues } from './ConvertOptionsForm'
import { runConversion, formatDuration, type LogEntry, type ConversionRunState } from '../lib/convert/run'
import { downloadFile, downloadAsZip, generateZipFilename } from '../lib/convert/download'
import type { ConversionProgress, ConversionResult } from '../lib/convert/types'
// Import to register sample converters
import '../lib/convert/converters'

type CategoryLabel = 'PDF' | 'Images' | 'Video' | 'Audio' | 'Archives' | 'Data'

const categories: { icon: typeof FileText; label: CategoryLabel }[] = [
  { icon: FileText, label: 'PDF' },
  { icon: Image, label: 'Images' },
  { icon: Video, label: 'Video' },
  { icon: Music, label: 'Audio' },
  { icon: Archive, label: 'Archives' },
  { icon: Database, label: 'Data' },
]

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Get icon component based on file MIME type
 */
function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Video
  if (type.startsWith('audio/')) return Music
  if (type.includes('pdf')) return FileText
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return Archive
  if (type.includes('json') || type.includes('csv') || type.includes('xml')) return Database
  return File
}

export function ConvertView() {
  const [files, setFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryLabel>>(new Set())
  const [selectedConverter, setSelectedConverter] = useState<Converter | null>(null)
  const [selectedOutputFormat, setSelectedOutputFormat] = useState<string>('')
  const [converterOptions, setConverterOptions] = useState<ConverterOptions>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Conversion runner state
  const [runState, setRunState] = useState<ConversionRunState>({
    status: 'idle',
    progress: { percent: 0 },
    logs: [],
    result: null,
    error: null,
  })
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [downloadsExpanded, setDownloadsExpanded] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Find converters that can handle the selected files
  const applicableConverters = useMemo(() => {
    if (files.length === 0) return []
    return conversionRegistry.findConvertersForFiles(files)
  }, [files])

  // Reset converter selection when files change
  useEffect(() => {
    if (applicableConverters.length > 0) {
      // Auto-select first converter if available
      const first = applicableConverters[0]
      setSelectedConverter(first)
      setSelectedOutputFormat(first.outputs[0]?.mimeType || '')
      setConverterOptions(getDefaultValues(first.optionsSchema))
    } else {
      setSelectedConverter(null)
      setSelectedOutputFormat('')
      setConverterOptions({})
    }
  }, [applicableConverters])

  // Get output formats for selected converter
  const outputFormats = useMemo(() => {
    if (!selectedConverter) return []
    return selectedConverter.outputs
  }, [selectedConverter])

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    
    // Add files, avoiding duplicates by name+size+lastModified
    setFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}-${f.size}-${f.lastModified}`))
      const filesToAdd = Array.from(newFiles).filter(
        f => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`)
      )
      return [...prev, ...filesToAdd]
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFiles])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const toggleCategory = useCallback((label: CategoryLabel) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }, [])

  const handleConverterChange = useCallback((converterId: string) => {
    const converter = applicableConverters.find(c => c.id === converterId)
    if (converter) {
      setSelectedConverter(converter)
      setSelectedOutputFormat(converter.outputs[0]?.mimeType || '')
      setConverterOptions(getDefaultValues(converter.optionsSchema))
    }
  }, [applicableConverters])

  // Reset run state when files or converter changes
  useEffect(() => {
    setRunState({
      status: 'idle',
      progress: { percent: 0 },
      logs: [],
      result: null,
      error: null,
    })
    setLogsExpanded(false)
  }, [files, selectedConverter])

  // Start conversion
  const handleStartConversion = useCallback(async () => {
    if (!selectedConverter || files.length === 0) return

    // Create abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Reset state
    setRunState({
      status: 'running',
      progress: { percent: 0, stage: 'Starting' },
      logs: [],
      result: null,
      error: null,
    })

    const callbacks = {
      onProgress: (progress: ConversionProgress) => {
        setRunState(prev => ({ ...prev, progress }))
      },
      onLog: (entry: LogEntry) => {
        setRunState(prev => ({ ...prev, logs: [...prev.logs, entry] }))
      },
      onComplete: (result: ConversionResult) => {
        setRunState(prev => ({
          ...prev,
          status: 'completed',
          result,
        }))
      },
      onError: (error: string) => {
        setRunState(prev => ({
          ...prev,
          status: 'error',
          error,
        }))
      },
      onCancel: () => {
        setRunState(prev => ({
          ...prev,
          status: 'cancelled',
        }))
      },
    }

    await runConversion(
      selectedConverter,
      {
        files,
        outputType: selectedOutputFormat,
        options: converterOptions,
      },
      callbacks,
      abortController.signal
    )

    abortControllerRef.current = null
  }, [selectedConverter, files, selectedOutputFormat, converterOptions])

  // Cancel conversion
  const handleCancelConversion = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  // Download all results as ZIP (or single file if only one)
  const handleDownloadAll = useCallback(async () => {
    if (!runState.result?.files || runState.result.files.length === 0) return
    
    if (runState.result.files.length === 1) {
      // Single file - download directly
      downloadFile(runState.result.files[0])
    } else {
      // Multiple files - download as ZIP
      const zipName = generateZipFilename('converted')
      await downloadAsZip(runState.result.files, zipName)
    }
  }, [runState.result])

  // Download a single file by index
  const handleDownloadSingle = useCallback((index: number) => {
    if (runState.result?.files?.[index]) {
      downloadFile(runState.result.files[index])
    }
  }, [runState.result])

  // Get all registered converters filtered by selected categories (for browsing when no files)
  const browsableConverters = useMemo(() => {
    if (selectedCategories.size === 0) return []
    return conversionRegistry.getAll().filter(c => 
      selectedCategories.has(c.category as CategoryLabel)
    )
  }, [selectedCategories])

  return (
    <div className="flex flex-col items-center px-6 py-8">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Dropzone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-4xl border-2 border-dashed rounded-3xl p-12 flex flex-col items-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-gray-900 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
          <Upload className="w-8 h-8 text-gray-600" />
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Drop files to convert</h2>
        <p className="text-gray-500 mb-8">or click to browse</p>
        
        <div className="flex flex-wrap justify-center gap-3">
          {categories.map(({ icon: Icon, label }) => {
            const isSelected = selectedCategories.has(label)
            return (
              <button
                key={label}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleCategory(label)
                }}
                className={`flex items-center gap-2 px-4 py-2 border rounded-full text-sm transition-colors ${
                  isSelected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Available Conversions from Registry (when browsing categories, no files selected) */}
      {files.length === 0 && browsableConverters.length > 0 && (
        <div className="w-full max-w-4xl mt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Available Conversions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {browsableConverters.map((converter) => (
              <div
                key={converter.id}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
              >
                <span className="font-medium">{converter.inputs[0]?.label || '?'}</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="font-medium">{converter.outputs[0]?.label || '?'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="w-full max-w-4xl mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Selected Files ({files.length})
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFiles([])
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-200">
            {files.map((file, index) => {
              const FileIcon = getFileIcon(file.type)
              return (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileIcon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                      {file.type && ` • ${file.type}`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(index)
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Conversion Options (when files are selected) */}
      {files.length > 0 && (
        <div className="w-full max-w-4xl mt-6">
          {applicableConverters.length > 0 ? (
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Conversion Options
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Converter Selection */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Converter</label>
                  <div className="relative">
                    <select
                      value={selectedConverter?.id || ''}
                      onChange={(e) => handleConverterChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      {applicableConverters.map((converter) => (
                        <option key={converter.id} value={converter.id}>
                          {converter.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Output Format Selection */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Output Format</label>
                  <div className="relative">
                    <select
                      value={selectedOutputFormat}
                      onChange={(e) => setSelectedOutputFormat(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      {outputFormats.map((format) => (
                        <option key={format.mimeType} value={format.mimeType}>
                          {format.label} (.{format.extensions[0]})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Converter Options (rendered from schema) */}
              {selectedConverter && selectedConverter.optionsSchema.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs text-gray-500 mb-3">Options</h4>
                  <ConvertOptionsForm
                    schema={selectedConverter.optionsSchema}
                    values={converterOptions}
                    onChange={setConverterOptions}
                  />
                </div>
              )}

              {/* Converter Info */}
              {selectedConverter && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Category: {selectedConverter.category}</span>
                    <span>•</span>
                    <span>Cost: {selectedConverter.cost}</span>
                    {selectedConverter.multiFile && (
                      <>
                        <span>•</span>
                        <span>Multi-file supported</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Conversion Controls */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                {runState.status === 'idle' && (
                  <button
                    onClick={handleStartConversion}
                    className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Convert
                  </button>
                )}

                {runState.status === 'running' && (
                  <div className="space-y-3">
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{runState.progress.stage || 'Processing...'}</span>
                        <span className="text-gray-500">{runState.progress.percent}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full transition-all duration-300"
                          style={{ width: `${runState.progress.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Cancel button */}
                    <button
                      onClick={handleCancelConversion}
                      className="w-full px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Square className="w-3 h-3" />
                      Cancel
                    </button>
                  </div>
                )}

                {runState.status === 'completed' && runState.result?.success && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Conversion complete! ({runState.result.files?.length || 0} file{(runState.result.files?.length || 0) !== 1 ? 's' : ''})
                      </span>
                    </div>
                    
                    {runState.result.files && runState.result.files.length > 0 && (
                      <>
                        {/* Primary download button - ZIP if multiple, single file if one */}
                        <button
                          onClick={handleDownloadAll}
                          className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                          {runState.result.files.length > 1 ? (
                            <>
                              <Package className="w-4 h-4" />
                              Download all as ZIP
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Download {runState.result.files[0].name}
                            </>
                          )}
                        </button>

                        {/* Individual downloads (collapsible, only for multiple files) */}
                        {runState.result.files.length > 1 && (
                          <div className="border border-gray-100 rounded-lg">
                            <button
                              onClick={() => setDownloadsExpanded(!downloadsExpanded)}
                              className="flex items-center justify-between w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
                            >
                              <span>Individual downloads ({runState.result.files.length} files)</span>
                              {downloadsExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            
                            {downloadsExpanded && (
                              <div className="border-t border-gray-100 divide-y divide-gray-50">
                                {runState.result.files.map((file, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between px-3 py-2"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <File className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                      <span className="text-xs text-gray-600 truncate">{file.name}</span>
                                      <span className="text-xs text-gray-400 flex-shrink-0">
                                        ({formatFileSize(file.data.size)})
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => handleDownloadSingle(index)}
                                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 flex-shrink-0 ml-2"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {runState.result.stats && (
                      <p className="text-xs text-gray-500 text-center">
                        Processed in {formatDuration(runState.result.stats.processingTime)} •
                        Output: {formatFileSize(runState.result.stats.outputSize)}
                      </p>
                    )}

                    <button
                      onClick={() => {
                        setRunState(prev => ({ ...prev, status: 'idle', result: null, logs: [] }))
                        setDownloadsExpanded(false)
                      }}
                      className="w-full px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Convert Again
                    </button>
                  </div>
                )}

                {runState.status === 'cancelled' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Conversion cancelled</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      The conversion was stopped. No files were created.
                    </p>
                    <button
                      onClick={() => setRunState(prev => ({ ...prev, status: 'idle', logs: [] }))}
                      className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {runState.status === 'error' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Conversion failed</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {runState.error || 'An unknown error occurred'}
                    </p>
                    <button
                      onClick={() => setRunState(prev => ({ ...prev, status: 'idle', error: null, logs: [] }))}
                      className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>

              {/* Log Panel */}
              {runState.logs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setLogsExpanded(!logsExpanded)}
                    className="flex items-center justify-between w-full text-xs text-gray-500 hover:text-gray-700"
                  >
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      What happened ({runState.logs.length} steps)
                    </span>
                    {logsExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  
                  {logsExpanded && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                      {runState.logs.map((log, index) => (
                        <div
                          key={index}
                          className={`flex items-start gap-2 px-3 py-2 text-xs border-b border-gray-50 last:border-b-0 ${
                            log.level === 'error' ? 'bg-red-50 text-red-700' :
                            log.level === 'warn' ? 'bg-amber-50 text-amber-700' :
                            log.level === 'success' ? 'bg-green-50 text-green-700' :
                            'bg-white text-gray-600'
                          }`}
                        >
                          <span className="text-gray-400 flex-shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No converters available - calm empty state */
            <div className="border border-gray-200 rounded-xl p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                No conversions available
              </h3>
              <p className="text-sm text-gray-500">
                No converters found for the selected file type{files.length > 1 ? 's' : ''}.
                <br />
                Try selecting different files or check back later for more conversion options.
              </p>
            </div>
          )}
        </div>
      )}
      
      <p className="mt-8 text-gray-400 text-sm">
        100% free • Files processed locally • No uploads
      </p>
    </div>
  )
}
