import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { config } from './wagmiConfig.js'
import App from './App.jsx'
import './App.css'

const queryClient = new QueryClient()

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#ff6b81', textAlign: 'center' }}>
          <h2>เกิดข้อผิดพลาด</h2>
          <p style={{ color: '#b2bec3', marginTop: '1rem' }}>{this.state.error.message}</p>
          <button
            onClick={() => {
              const history = localStorage.getItem('jibjib_history')
              localStorage.clear()
              if (history) localStorage.setItem('jibjib_history', history)
              window.location.reload()
            }}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: '#6c5ce7', color: 'white', cursor: 'pointer' }}
          >
            ล้างข้อมูลแล้วโหลดใหม่
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme()}>
            <App />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
