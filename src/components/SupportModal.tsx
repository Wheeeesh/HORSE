import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface SupportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-gray-200 bg-white">
              <img
                src="/logo.png"
                alt="pwr.horse logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h2 id="support-title" className="font-bold text-lg">Support pwr.horse</h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-gray-600 text-sm space-y-4">
          <p>
            pwr.horse is a free, privacy-focused tool that processes all your files locally in your browser.
          </p>
          <p>
            If you find it useful, consider supporting the project to help keep it free and maintained.
          </p>
          <div className="pt-4 border-t border-gray-100">
            <p className="text-gray-400 text-xs">
              No data leaves your browser. 100% local processing.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
