import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'

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
            onClick={() => { localStorage.clear(); window.location.reload() }}
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
