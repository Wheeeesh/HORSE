export function Footer() {
  return (
    <footer className="flex items-center justify-between px-6 py-4 border-t border-gray-100 mt-auto">
      <div className="flex items-center gap-2 text-gray-400">
        <div className="w-4 h-4 rounded overflow-hidden border border-gray-200 bg-white">
          <img
            src="/logo.png"
            alt="pwr.horse logo"
            className="w-full h-full object-contain"
          />
        </div>
        <span className="text-sm font-medium">pwr.horse</span>
      </div>
      <span className="text-sm text-gray-400">No data leaves your browser</span>
    </footer>
  )
}
