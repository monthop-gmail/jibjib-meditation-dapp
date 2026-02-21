import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers'

const KUB_TESTNET = {
  chainId: '0x6545',
  chainName: 'KUB Testnet',
  rpcUrls: ['https://rpc-testnet.bitkubchain.io'],
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  blockExplorerUrls: ['https://testnet.kubscan.com'],
}

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'
const DEFAULT_CONTRACT = '0xCc79006F652a3F091c93e02F4f9A0aA9eaa68064'

const CONTRACT_ABI = [
  'function startMeditation() external',
  'function completeMeditation(address token) external',
  'function claimPendingReward(address token) external',
  'function donate(address token, uint256 amount) external payable',
  'function getRewardAmount(address token) external view returns (uint256)',
  'function getMeditationDuration() external view returns (uint256)',
  'function getUserStats(address user) external view returns (uint256 totalSessions, uint256 lastSessionTime, bool isMeditating, uint256 todaySessions, bool canClaim)',
  'function getPendingReward(address user, address token) external view returns (uint256)',
  'function getTokenBalance(address token) external view returns (uint256)',
  'function getSupportedTokens() external view returns (address[])',
]

const MEDITATION_SECONDS = 300

function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [stats, setStats] = useState({ totalSessions: 0, isMeditating: false, todaySessions: 0, canClaim: true })
  const [secondsLeft, setSecondsLeft] = useState(MEDITATION_SECONDS)
  const [meditating, setMeditating] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [cheated, setCheated] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [completedMsg, setCompletedMsg] = useState('')
  const [rewardAmount, setRewardAmount] = useState('0')
  const [pendingReward, setPendingReward] = useState('0')
  const [fundBalance, setFundBalance] = useState('0')
  const [donateAmount, setDonateAmount] = useState('')
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
      const [totalSessions, , isMeditating, todaySessions, canClaim] = await c.getUserStats(addr)
      setStats({
        totalSessions: Number(totalSessions),
        isMeditating,
        todaySessions: Number(todaySessions),
        canClaim,
      })

      const reward = await c.getRewardAmount(NATIVE_TOKEN)
      setRewardAmount(formatEther(reward))

      const pending = await c.getPendingReward(addr, NATIVE_TOKEN)
      setPendingReward(formatEther(pending))

      const balance = await c.getTokenBalance(NATIVE_TOKEN)
      setFundBalance(formatEther(balance))
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

      // Switch to KUB Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: KUB_TESTNET.chainId }],
        })
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [KUB_TESTNET],
          })
        } else {
          setError('เชื่อมต่อ KUB Testnet ไม่สำเร็จ')
          setLoading('')
          return
        }
      }

      const signer = await provider.getSigner()
      const addr = accounts[0]
      const contractAddress = localStorage.getItem('jibjib_contract') || DEFAULT_CONTRACT
      localStorage.setItem('jibjib_contract', contractAddress)
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
    setCompletedMsg('')
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
      const tx = await contract.completeMeditation(NATIVE_TOKEN)
      const receipt = await tx.wait()

      setMeditating(false)
      setCompleted(true)
      clearInterval(timerRef.current)

      // Check events to determine if reward was paid or stored as pending
      const noRewardTopic = contract.interface.getEvent('MeditationCompletedNoReward').topicHash
      const hasPending = receipt.logs.some(log => log.topics[0] === noRewardTopic)

      if (hasPending) {
        setCompletedMsg('ทำสมาธิสำเร็จ! Reward ถูกเก็บเป็น Pending (fund หมด) — claim ได้เมื่อมี fund')
      } else {
        setCompletedMsg(`ทำสมาธิสำเร็จ! ได้รับ ${rewardAmount} tKUB`)
      }

      await loadStats(contract, account)
    } catch (err) {
      setError(err.reason || err.message || 'ยืนยันไม่สำเร็จ')
    } finally {
      setLoading('')
    }
  }

  async function handleClaimPending() {
    if (!contract) return
    setError('')
    try {
      setLoading('กำลัง claim pending reward...')
      const tx = await contract.claimPendingReward(NATIVE_TOKEN)
      await tx.wait()
      setCompletedMsg(`Claim สำเร็จ! ได้รับ ${pendingReward} tKUB`)
      setCompleted(true)
      await loadStats(contract, account)
    } catch (err) {
      setError(err.reason || err.message || 'Claim ไม่สำเร็จ')
    } finally {
      setLoading('')
    }
  }

  async function handleDonate(e) {
    e.preventDefault()
    if (!contract || !donateAmount) return
    setError('')
    try {
      setLoading('กำลังบริจาค...')
      const tx = await contract.donate(NATIVE_TOKEN, 0, { value: parseEther(donateAmount) })
      await tx.wait()
      setCompletedMsg(`บริจาค ${donateAmount} tKUB สำเร็จ!`)
      setCompleted(true)
      setDonateAmount('')
      await loadStats(contract, account)
    } catch (err) {
      setError(err.reason || err.message || 'บริจาคไม่สำเร็จ')
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
      <p className="subtitle">ทำสมาธิ 5 นาที รับ Reward บน KUB Testnet</p>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">{loading}</div>}
      {completed && <div className="success">{completedMsg}</div>}

      {!account ? (
        <button className="btn btn-connect" onClick={connectWallet} disabled={!!loading}>
          เชื่อมต่อ MetaMask
        </button>
      ) : (
        <div className="main">
          <div className="account">
            {account.slice(0, 6)}...{account.slice(-4)}
          </div>

          {!localStorage.getItem('jibjib_contract') && (
            <form className="contract-form" onSubmit={saveContractAddress}>
              <input name="addr" placeholder="Contract Address (0x...)" />
              <button type="submit" className="btn btn-sm">บันทึก</button>
            </form>
          )}

          <div className="contract-address">
            <small>Contract: {DEFAULT_CONTRACT.slice(0, 10)}...</small>
          </div>

          <div className="timer">
            <div className="timer-display">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            {meditating && <p className="timer-label">กำลังทำสมาธิ... อย่าออกจากหน้านี้</p>}
          </div>

          <div className="actions">
            {!meditating && secondsLeft === MEDITATION_SECONDS && !stats.isMeditating && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!loading || !contract || !stats.canClaim}>
                {stats.canClaim ? 'เริ่มทำสมาธิ' : 'ครบ 3 ครั้งวันนี้แล้ว'}
              </button>
            )}
            {meditating && secondsLeft === 0 && (
              <button className="btn btn-complete" onClick={handleComplete} disabled={!!loading}>
                ยืนยันรับ Reward
              </button>
            )}
            {cheated && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!loading || !contract}>
                เริ่มใหม่
              </button>
            )}
          </div>

          {/* Pending Reward */}
          {Number(pendingReward) > 0 && (
            <div className="pending-section">
              <p>Pending Reward: <strong>{pendingReward} tKUB</strong></p>
              <button className="btn btn-claim" onClick={handleClaimPending} disabled={!!loading}>
                Claim Pending Reward
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="stats">
            <h3>สถิติ</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-value">{stats.totalSessions}</span>
                <span className="stat-label">ครั้งทั้งหมด</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.todaySessions}/3</span>
                <span className="stat-label">วันนี้</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{rewardAmount}</span>
                <span className="stat-label">tKUB/ครั้ง</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{fundBalance}</span>
                <span className="stat-label">Fund คงเหลือ</span>
              </div>
            </div>
          </div>

          {/* Donate */}
          <div className="donate-section">
            <h3>บริจาค tKUB เข้า Fund</h3>
            <form className="donate-form" onSubmit={handleDonate}>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="จำนวน tKUB"
                value={donateAmount}
                onChange={e => setDonateAmount(e.target.value)}
              />
              <button type="submit" className="btn btn-donate" disabled={!!loading || !contract || !donateAmount}>
                บริจาค
              </button>
            </form>
          </div>
        </div>
      )}

      <footer>
        <p>KUB Testnet (Chain ID: 25925) | JIBJIB Meditation Reward</p>
      </footer>
    </div>
  )
}

export default App
