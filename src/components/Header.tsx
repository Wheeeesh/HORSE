import { RefreshCw, QrCode, Gift } from 'lucide-react'

type Tab = 'convert' | 'qrcode'

interface HeaderProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onSupportClick: () => void
}

export function Header({ activeTab, onTabChange, onSupportClick }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-gray-200 bg-white">
          <img
            src="/logo.png"
            alt="pwr.horse logo"
            className="w-full h-full object-contain"
          />
        </div>
        <span className="font-bold text-xl">pwr.horse</span>
      </div>

      <div className="flex items-center bg-gray-100 rounded-full p-1">
        <button
          onClick={() => onTabChange('convert')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'convert'
              ? 'bg-white text-black shadow-sm'
              : 'text-gray-600 hover:text-black'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Convert
        </button>
        <button
          onClick={() => onTabChange('qrcode')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'qrcode'
              ? 'bg-white text-black shadow-sm'
              : 'text-gray-600 hover:text-black'
          }`}
        >
          <QrCode className="w-4 h-4" />
          QR Code
        </button>
      </div>

      <button
        onClick={onSupportClick}
        className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium"
      >
        <Gift className="w-4 h-4" />
        <span className="underline">Support</span>
      </button>
    </header>
  )
}
