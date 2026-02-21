import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers'

const NETWORKS = {
  jbchain: {
    key: 'jbchain',
    label: 'JB Chain',
    chainId: '0x22c3',
    chainName: 'JB Chain',
    rpcUrls: ['https://rpc-l1.jibchain.net'],
    nativeCurrency: { name: 'JBC', symbol: 'JBC', decimals: 18 },
    blockExplorerUrls: ['https://exp-l1.jibchain.net'],
    contract: '0x5234C5baD4819Cf70a39d87696dfB3e0e1eAFcaF',
    tokens: [
      { address: '0xebe937ee67e3219d176965cc08110a258f925e01', symbol: 'JIBJIB', name: 'JIBJIB' },
      { address: '0x440bb674a2e443d600396a69c4c46362148699a2', symbol: 'JIBJIB C', name: 'JIBJIB C' },
      { address: '0x0000000000000000000000000000000000000000', symbol: 'JBC', name: 'JBC (Native)' },
    ],
  },
  kubtestnet: {
    key: 'kubtestnet',
    label: 'KUB Testnet',
    chainId: '0x6545',
    chainName: 'KUB Testnet',
    rpcUrls: ['https://rpc-testnet.bitkubchain.io'],
    nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
    blockExplorerUrls: ['https://testnet.kubscan.com'],
    contract: '0xCc79006F652a3F091c93e02F4f9A0aA9eaa68064',
    tokens: [
      { address: '0x0000000000000000000000000000000000000000', symbol: 'tKUB', name: 'tKUB (Native)' },
    ],
  },
  kubl2: {
    key: 'kubl2',
    label: 'KUB Layer 2 Testnet',
    chainId: '0x3F4B3',
    chainName: 'KUB Layer 2 Testnet',
    rpcUrls: ['https://kublayer2.testnet.kubchain.io'],
    nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
    blockExplorerUrls: ['https://kublayer2.testnet.kubscan.com'],
    contract: '',
    tokens: [
      { address: '0x0000000000000000000000000000000000000000000', symbol: 'tKUB', name: 'tKUB (Native)' },
    ],
  },
}

const currentToken.address = '0x0000000000000000000000000000000000000000'

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
  const [network, setNetwork] = useState(() => localStorage.getItem('jibjib_network') || 'jbchain')
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
  const [selectedToken, setSelectedToken] = useState(0)
  const timerRef = useRef(null)

  const net = NETWORKS[network]
  const currentToken = net.tokens[selectedToken]

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

      const reward = await c.getRewardAmount(currentToken.address)
      setRewardAmount(formatEther(reward))

      const pending = await c.getPendingReward(addr, currentToken.address)
      setPendingReward(formatEther(pending))

      const balance = await c.getTokenBalance(currentToken.address)
      setFundBalance(formatEther(balance))
    } catch { /* ignore */ }
  }, [currentToken])

  function switchNetwork(key) {
    if (meditating) return
    localStorage.setItem('jibjib_network', key)
    setNetwork(key)
    // Disconnect and reset state so user reconnects on new network
    setAccount(null)
    setContract(null)
    setStats({ totalSessions: 0, isMeditating: false, todaySessions: 0, canClaim: true })
    setRewardAmount('0')
    setPendingReward('0')
    setFundBalance('0')
    setError('')
    setCompleted(false)
    setCompletedMsg('')
  }

  async function connectWallet() {
    setError('')
    if (!window.ethereum) {
      setError('กรุณาติดตั้ง MetaMask')
      return
    }

    const contractAddress = net.contract
    if (!contractAddress) {
      setError(`ยังไม่มี Contract บน ${net.label} — กรุณาเลือก network อื่น`)
      return
    }

    try {
      setLoading('กำลังเชื่อมต่อ...')
      const provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])

      // Switch to selected network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: net.chainId }],
        })
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: net.chainId,
              chainName: net.chainName,
              rpcUrls: net.rpcUrls,
              nativeCurrency: net.nativeCurrency,
              blockExplorerUrls: net.blockExplorerUrls,
            }],
          })
        } else {
          setError(`เชื่อมต่อ ${net.label} ไม่สำเร็จ`)
          setLoading('')
          return
        }
      }

      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
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
      const tx = await contract.completeMeditation(currentToken.address)
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
      const tx = await contract.claimPendingReward(currentToken.address)
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
      const tx = await contract.donate(currentToken.address, 0, { value: parseEther(donateAmount) })
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

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="app">
      <h1>JIBJIB Meditation</h1>
      <p className="subtitle">ทำสมาธิ 5 นาที รับ Reward บน KUB Chain</p>

      {/* Network Selector */}
      <div className="network-selector">
        {Object.values(NETWORKS).map(n => (
          <button
            key={n.key}
            className={`network-btn ${network === n.key ? 'active' : ''} ${!n.contract ? 'no-contract' : ''}`}
            onClick={() => switchNetwork(n.key)}
            disabled={meditating}
          >
            {n.label}
            {!n.contract && <span className="soon-badge">เร็วๆนี้</span>}
          </button>
        ))}
      </div>

      {/* Token Selector */}
      {net.tokens.length > 1 && (
        <div className="token-selector">
          <label>เลือก Token ที่จะรับ:</label>
          <select 
            value={selectedToken} 
            onChange={(e) => setSelectedToken(Number(e.target.value))}
            disabled={meditating || account === null}
          >
            {net.tokens.map((t, i) => (
              <option key={i} value={i}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

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
            <span className="network-badge">{net.label}</span>
          </div>

          {net.contract && (
            <div className="contract-address">
              <small>Contract: {net.contract.slice(0, 10)}...{net.contract.slice(-4)}</small>
            </div>
          )}

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
        <p>{net.label} | JIBJIB Meditation Reward</p>
      </footer>
    </div>
  )
}

export default App
