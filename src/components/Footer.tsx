import { Zap } from 'lucide-react'

export function Footer() {
  return (
    <footer className="flex items-center justify-between px-6 py-4 border-t border-gray-100 mt-auto">
      <div className="flex items-center gap-2 text-gray-400">
        <Zap className="w-4 h-4" />
        <span className="text-sm font-medium">TADAA</span>
      </div>
      <span className="text-sm text-gray-400">No data leaves your browser</span>
    </footer>
  )
}
