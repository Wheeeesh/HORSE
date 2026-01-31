import { useState } from 'react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ConvertView } from './components/ConvertView'
import { QRCodeView } from './components/QRCodeView'
import { SupportModal } from './components/SupportModal'

type Tab = 'convert' | 'qrcode'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('convert')
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSupportClick={() => setIsSupportModalOpen(true)}
      />
      <main className="flex-1">
        {activeTab === 'convert' ? <ConvertView /> : <QRCodeView />}
      </main>
      <Footer />
      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
      />
    </div>
  )
}

export default App
