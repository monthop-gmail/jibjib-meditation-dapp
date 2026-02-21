import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'

const KUB_L2_TESTNET = {
  chainId: '0x3F4B3',
  chainName: 'KUB Layer 2 Testnet',
  rpcUrls: ['https://kublayer2.testnet.kubchain.io'],
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  blockExplorerUrls: ['https://kublayer2.testnet.kubscan.com'],
}

const CONTRACT_ABI = [
  'function startMeditation() external',
  'function completeMeditation() external',
  'function getRewardAmount() external view returns (uint256)',
  'function getMeditationDuration() external view returns (uint256)',
  'function getUserStats(address user) external view returns (uint256 totalSessions, uint256 lastSessionTime, bool isMeditating)',
]

const MEDITATION_SECONDS = 300

function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [stats, setStats] = useState({ totalSessions: 0, isMeditating: false })
  const [secondsLeft, setSecondsLeft] = useState(MEDITATION_SECONDS)
  const [meditating, setMeditating] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [cheated, setCheated] = useState(false)
  const [completed, setCompleted] = useState(false)
  const timerRef = useRef(null)

  // Anti-cheat: detect tab switch / minimize
  useEffect(() => {
    if (!meditating) return
    const handleVisibility = () => {
      if (document.hidden) {
        setCheated(true)
        clearInterval(timerRef.current)
        setMeditating(false)
        setError('ตรวจพบว่าออกจากหน้าจอ กรุณาเริ่มทำสมาธิใหม่')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [meditating])

  const loadStats = useCallback(async (c, addr) => {
    try {
      const [totalSessions, , isMeditating] = await c.getUserStats(addr)
      setStats({ totalSessions: Number(totalSessions), isMeditating })
    } catch { /* ignore */ }
  }, [])

  async function connectWallet() {
    setError('')
    if (!window.ethereum) {
      setError('กรุณาติดตั้ง MetaMask')
      return
    }
    try {
      setLoading('กำลังเชื่อมต่อ...')
      const provider = new BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])

      // Switch to KUB L2 Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: KUB_L2_TESTNET.chainId }],
        })
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [KUB_L2_TESTNET],
          })
        } else {
          setError('เชื่อมต่อ KUB L2 ไม่สำเร็จ: ' + (switchErr.message || 'ลองเพิ่ม network เอง'))
          setLoading('')
          return
        }
      }

      const signer = await provider.getSigner()
      const addr = accounts[0]
      // Contract address - ต้องใส่หลัง deploy
      const contractAddress = localStorage.getItem('jibjib_contract') || ''
      if (!contractAddress) {
        setAccount(addr)
        setLoading('')
        setError('ยังไม่ได้ตั้ง Contract Address กรุณาใส่ที่ช่องด้านล่าง')
        return
      }
      const c = new Contract(contractAddress, CONTRACT_ABI, signer)
      setContract(c)
      setAccount(addr)
      await loadStats(c, addr)
    } catch (err) {
      setError(err.message || 'เชื่อมต่อไม่สำเร็จ')
    } finally {
      setLoading('')
    }
  }

  async function handleStart() {
    if (!contract) return
    setError('')
    setCheated(false)
    setCompleted(false)
    try {
      setLoading('กำลังเริ่มทำสมาธิ...')
      const tx = await contract.startMeditation()
      await tx.wait()
      setMeditating(true)
      setSecondsLeft(MEDITATION_SECONDS)

      timerRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setError(err.reason || err.message || 'เริ่มทำสมาธิไม่สำเร็จ')
    } finally {
      setLoading('')
    }
  }

  async function handleComplete() {
    if (!contract) return
    setError('')
    try {
      setLoading('กำลังยืนยัน...')
      const tx = await contract.completeMeditation()
      await tx.wait()
      setMeditating(false)
      setCompleted(true)
      clearInterval(timerRef.current)
      await loadStats(contract, account)
    } catch (err) {
      setError(err.reason || err.message || 'ยืนยันไม่สำเร็จ')
    } finally {
      setLoading('')
    }
  }

  function saveContractAddress(e) {
    e.preventDefault()
    const addr = e.target.elements.addr.value.trim()
    if (addr) {
      localStorage.setItem('jibjib_contract', addr)
      window.location.reload()
    }
  }

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="app">
      <h1>🧘 JIBJIB Meditation</h1>
      <p className="subtitle">ทำสมาธิ 5 นาที รับ Reward Token บน KUB L2</p>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">{loading}</div>}
      {completed && <div className="success">ทำสมาธิสำเร็จ! ได้รับ 1 JIBJIB Reward 🎉</div>}

      {!account ? (
        <button className="btn btn-connect" onClick={connectWallet} disabled={!!loading}>
          เชื่อมต่อ MetaMask
        </button>
      ) : (
        <div className="main">
          <div className="account">
            🔗 {account.slice(0, 6)}...{account.slice(-4)}
          </div>

          {!localStorage.getItem('jibjib_contract') && (
            <form className="contract-form" onSubmit={saveContractAddress}>
              <input name="addr" placeholder="Contract Address (0x...)" />
              <button type="submit" className="btn btn-sm">บันทึก</button>
            </form>
          )}

          <div className="timer">
            <div className="timer-display">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            {meditating && <p className="timer-label">กำลังทำสมาธิ... อย่าออกจากหน้านี้</p>}
          </div>

          <div className="actions">
            {!meditating && secondsLeft === MEDITATION_SECONDS && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!loading || !contract}>
                🧘 เริ่มทำสมาธิ
              </button>
            )}
            {meditating && secondsLeft === 0 && (
              <button className="btn btn-complete" onClick={handleComplete} disabled={!!loading}>
                ✅ ยืนยันรับ Reward
              </button>
            )}
            {cheated && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!loading || !contract}>
                🔄 เริ่มใหม่
              </button>
            )}
          </div>

          <div className="stats">
            <h3>📊 สถิติ</h3>
            <p>ทำสมาธิทั้งหมด: <strong>{stats.totalSessions}</strong> ครั้ง</p>
            <p>สถานะ: {stats.isMeditating ? '🧘 กำลังทำสมาธิ' : '⏸️ พร้อมเริ่ม'}</p>
          </div>
        </div>
      )}

      <footer>
        <p>KUB L2 Testnet (Chain ID: 259251) | JIBJIB Meditation Reward</p>
      </footer>
    </div>
  )
}

export default App
