import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers'

const IERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]

const NETWORKS = {
  jbchain: {
    key: 'jbchain',
    label: 'JB Chain',
    chainId: '0x22c3',
    chainName: 'JB Chain',
    rpcUrls: ['https://rpc-l1.jibchain.net'],
    nativeCurrency: { name: 'JBC', symbol: 'JBC', decimals: 18 },
    blockExplorerUrls: ['https://exp-l1.jibchain.net'],
    contract: '0x59D689A6ded742A4BaE7D89d2A462c79B0F2897B',
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
    contract: '0x17217acD1CF5DC1b38E7Ef007Ae684c3c40Ec1d8',
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
      { address: '0x0000000000000000000000000000000000000000', symbol: 'tKUB', name: 'tKUB (Native)' },
    ],
  },
}

const CONTRACT_ABI = [
  'function startMeditation() external',
  'function completeMeditation(address token) external',
  'function claimPendingReward(address token) external',
  'function donate(address token, uint256 amount) external payable',
  'function getRewardAmount(address token) external view returns (uint256)',
  'function getMeditationDuration() external view returns (uint256)',
  'function getUserStats(address user) external view returns (uint256 totalSessions, uint256 lastSessionTime, bool isMeditating, uint256 todaySessions, bool canClaim)',
  'function getRewardEligibility(address user) external view returns (bool canGetReward, uint256 secondsUntilReward, uint256 todaySessions, bool isMeditating)',
  'function getPendingReward(address user, address token) external view returns (uint256)',
  'function getTokenBalance(address token) external view returns (uint256)',
  'function getSupportedTokens() external view returns (address[])',
  'event MeditationCompleted(address indexed user, uint256 reward, address token, bool isBonus)',
  'event MeditationRecorded(address indexed user, uint256 timestamp)',
  'event PendingRewardStored(address indexed user, address token, uint256 amount)',
]

function fmtBal(val) {
  const n = Number(val)
  if (isNaN(n) || val === '-') return val
  if (n === 0) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  if (n >= 1) return n.toFixed(2)
  if (n >= 0.001) return n.toFixed(4)
  return n.toFixed(6)
}

function fmtTime(seconds) {
  if (seconds <= 0) return '0'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs} ชม. ${mins} นาที`
  return `${mins} นาที`
}

const HISTORY_MAX = 50

const MEDITATION_SECONDS = 300

// ── State Machine ───────────────────────────────────────────────────
const initialMeditationState = {
  phase: 'IDLE', // IDLE | CONNECTING | STARTING | MEDITATING | COMPLETING | COMPLETED | CHEATED | PENDING_COMPLETE | CLAIMING | DONATING
  error: '',
  loading: '',
  completedMsg: '',
}

function meditationReducer(state, action) {
  switch (action.type) {
    case 'CONNECT_START':
      return { phase: 'CONNECTING', loading: 'กำลังเชื่อมต่อ...', error: '', completedMsg: '' }
    case 'CONNECT_SUCCESS':
      return { ...state, phase: 'IDLE', loading: '' }
    case 'CONNECT_FAIL':
      return { ...state, phase: 'IDLE', loading: '', error: action.error }

    case 'START_BEGIN':
      return { phase: 'STARTING', loading: 'กำลังเริ่มทำสมาธิ...', error: '', completedMsg: '' }
    case 'START_SUCCESS':
      return { ...state, phase: 'MEDITATING', loading: '' }
    case 'START_FAIL':
      return { ...state, phase: 'IDLE', loading: '', error: action.error }

    case 'CHEAT_DETECTED':
      return { ...state, phase: 'CHEATED', loading: '', error: 'ตรวจพบว่าออกจากหน้าจอ กรุณาเริ่มทำสมาธิใหม่' }

    case 'COMPLETE_BEGIN':
      return { ...state, phase: 'COMPLETING', loading: 'กำลังยืนยัน...', error: '' }
    case 'COMPLETE_SUCCESS':
      return { phase: 'COMPLETED', loading: '', error: '', completedMsg: action.msg }
    case 'COMPLETE_FAIL':
      return { ...state, phase: 'IDLE', loading: '', error: action.error }

    case 'RESUME_TIMER':
      return { ...state, phase: 'MEDITATING' }
    case 'PENDING_DETECTED':
      return { ...state, phase: 'PENDING_COMPLETE' }
    case 'SKIP_PENDING':
      return { ...state, phase: 'COMPLETED', completedMsg: 'ข้ามไปก่อน — กลับมากดยืนยันได้ทุกเมื่อ' }

    case 'CLAIM_BEGIN':
      return { ...state, phase: 'CLAIMING', loading: 'กำลัง claim pending reward...', error: '' }
    case 'CLAIM_SUCCESS':
      return { phase: 'COMPLETED', loading: '', error: '', completedMsg: action.msg }
    case 'CLAIM_FAIL':
      return { ...state, phase: 'IDLE', loading: '', error: action.error }

    case 'DONATE_BEGIN':
      return { ...state, phase: 'DONATING', loading: action.loadingMsg || 'กำลังบริจาค...', error: '' }
    case 'DONATE_SUCCESS':
      return { phase: 'COMPLETED', loading: '', error: '', completedMsg: action.msg }
    case 'DONATE_FAIL':
      return { ...state, phase: 'IDLE', loading: '', error: action.error }

    case 'SET_ERROR':
      return { ...state, error: action.error }
    case 'SET_LOADING':
      return { ...state, loading: action.msg }
    case 'RESET':
      return { ...initialMeditationState }

    default:
      return state
  }
}

// ── Component ───────────────────────────────────────────────────────
function App() {
  const [network, setNetwork] = useState(() => {
    const saved = localStorage.getItem('jibjib_network')
    if (saved && NETWORKS[saved]) return saved
    localStorage.removeItem('jibjib_network')
    return 'jbchain'
  })
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [stats, setStats] = useState({ totalSessions: 0, isMeditating: false, todaySessions: 0, canClaim: true })
  const [eligibility, setEligibility] = useState({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
  const [secondsLeft, setSecondsLeft] = useState(MEDITATION_SECONDS)
  const [rewardAmounts, setRewardAmounts] = useState({})
  const [pendingRewards, setPendingRewards] = useState({})
  const [fundBalances, setFundBalances] = useState({})
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0)
  const [walletBalances, setWalletBalances] = useState({})
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jibjib_history') || '[]') } catch { return [] }
  })
  const [mState, dispatch] = useReducer(meditationReducer, initialMeditationState)
  const timerRef = useRef(null)

  const net = NETWORKS[network] || NETWORKS.jbchain
  const selectedToken = net.tokens[selectedTokenIdx] || net.tokens[0]
  const isLocked = ['STARTING', 'MEDITATING', 'COMPLETING', 'CONNECTING', 'CLAIMING', 'DONATING'].includes(mState.phase)

  // Cleanup timer on unmount + listen for account/chain changes
  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return () => clearInterval(timerRef.current)
    const disconnect = () => {
      clearInterval(timerRef.current)
      setSecondsLeft(MEDITATION_SECONDS)
      dispatch({ type: 'RESET' })
      setAccount(null)
      setContract(null)
      setStats({ totalSessions: 0, isMeditating: false, todaySessions: 0, canClaim: true })
      setEligibility({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
      setRewardAmounts({})
      setPendingRewards({})
      setFundBalances({})
      setWalletBalances({})
    }
    eth.on('accountsChanged', disconnect)
    eth.on('chainChanged', disconnect)
    return () => {
      clearInterval(timerRef.current)
      eth.removeListener('accountsChanged', disconnect)
      eth.removeListener('chainChanged', disconnect)
    }
  }, [])

  // Anti-cheat: detect tab switch / minimize
  useEffect(() => {
    if (mState.phase !== 'MEDITATING') return
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timerRef.current)
        dispatch({ type: 'CHEAT_DETECTED' })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [mState.phase])

  // Resume timer if contract says isMeditating (e.g. after page refresh)
  useEffect(() => {
    if (!stats.isMeditating || !stats.lastSessionTime) return
    if (mState.phase !== 'IDLE') return
    const elapsed = Math.floor(Date.now() / 1000) - stats.lastSessionTime
    const remaining = Math.max(0, MEDITATION_SECONDS - elapsed)
    if (remaining > 0) {
      setSecondsLeft(remaining)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0 }
          return prev - 1
        })
      }, 1000)
      dispatch({ type: 'RESUME_TIMER' })
    } else {
      dispatch({ type: 'PENDING_DETECTED' })
    }
  }, [stats.isMeditating, stats.lastSessionTime, mState.phase])

  const loadStats = useCallback(async (c, addr) => {
    try {
      const [totalSessions, lastSessionTime, isMeditating, todaySessions, canClaim] = await c.getUserStats(addr)
      setStats({
        totalSessions: Number(totalSessions),
        lastSessionTime: Number(lastSessionTime),
        isMeditating,
        todaySessions: Number(todaySessions),
        canClaim,
      })
    } catch (err) {
      console.error('getUserStats failed:', err.message, 'contract:', c.target, 'addr:', addr)
      dispatch({ type: 'SET_ERROR', error: 'ดึงข้อมูลไม่ได้ — ลอง Hard Refresh (Ctrl+Shift+R) หรือเปลี่ยน network แล้วกลับมา' })
      return
    }

    try {
      const [canGetReward, secondsUntilReward, todaySessions, isMeditating] = await c.getRewardEligibility(addr)
      setEligibility({
        canGetReward,
        secondsUntilReward: Number(secondsUntilReward),
        todaySessions: Number(todaySessions),
        isMeditating,
      })
    } catch (err) {
      console.error('getRewardEligibility failed:', err.message)
      setEligibility({ canGetReward: true, secondsUntilReward: 0, todaySessions: stats.todaySessions, isMeditating: stats.isMeditating })
    }

    const rewards = {}
    const pendings = {}
    const balances = {}
    const walletBals = {}

    const provider = c.runner?.provider || c.runner
    for (const token of net.tokens) {
      try {
        const [reward, pending, balance] = await Promise.all([
          c.getRewardAmount(token.address),
          c.getPendingReward(addr, token.address),
          c.getTokenBalance(token.address),
        ])
        rewards[token.symbol] = formatEther(reward)
        pendings[token.symbol] = formatEther(pending)
        balances[token.symbol] = formatEther(balance)
      } catch {
        rewards[token.symbol] = '0'
        pendings[token.symbol] = '0'
        balances[token.symbol] = '0'
      }

      try {
        if (token.address === '0x0000000000000000000000000000000000000000') {
          const bal = await provider.getBalance(addr)
          walletBals[token.symbol] = formatEther(bal)
        } else {
          const erc20 = new Contract(token.address, IERC20_ABI, provider)
          const bal = await erc20.balanceOf(addr)
          walletBals[token.symbol] = formatEther(bal)
        }
      } catch {
        walletBals[token.symbol] = '-'
      }
    }

    setRewardAmounts(rewards)
    setPendingRewards(pendings)
    setFundBalances(balances)
    setWalletBalances(walletBals)
  }, [net.tokens])

  function switchNetwork(key) {
    clearInterval(timerRef.current)
    setSecondsLeft(MEDITATION_SECONDS)
    dispatch({ type: 'RESET' })
    localStorage.setItem('jibjib_network', key)
    setNetwork(key)
    setSelectedTokenIdx(0)
    setRewardAmounts({})
    setPendingRewards({})
    setFundBalances({})
    setWalletBalances({})
    setAccount(null)
    setContract(null)
    setStats({ totalSessions: 0, isMeditating: false, todaySessions: 0, canClaim: true })
    setEligibility({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
  }

  async function connectWallet() {
    const ethereum = window.ethereum
    if (!ethereum) {
      dispatch({ type: 'SET_ERROR', error: 'ไม่พบ Wallet — กรุณาติดตั้ง MetaMask หรือใช้ Brave Wallet' })
      return
    }
    const contractAddress = net.contract
    if (!contractAddress) {
      dispatch({ type: 'SET_ERROR', error: `ยังไม่มี Contract บน ${net.label} — กรุณาเลือก network อื่น` })
      return
    }

    dispatch({ type: 'CONNECT_START' })
    try {
      await ethereum.request({ method: 'eth_requestAccounts' })

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: net.chainId }],
        })
      } catch (switchErr) {
        if (switchErr.code === 4902 || switchErr.code === -32603) {
          try {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: net.chainId,
                chainName: net.chainName,
                rpcUrls: net.rpcUrls,
                nativeCurrency: net.nativeCurrency,
                blockExplorerUrls: net.blockExplorerUrls,
              }],
            })
          } catch {
            dispatch({ type: 'CONNECT_FAIL', error: `เพิ่ม ${net.label} ไม่สำเร็จ — กรุณาเพิ่ม network ใน Wallet เอง` })
            return
          }
        } else if (switchErr.code === 4001) {
          dispatch({ type: 'CONNECT_FAIL', error: 'ผู้ใช้ปฏิเสธการเปลี่ยน network' })
          return
        } else {
          dispatch({ type: 'CONNECT_FAIL', error: `เชื่อมต่อ ${net.label} ไม่สำเร็จ: ${switchErr.message || 'ลองเพิ่ม network เอง'}` })
          return
        }
      }

      const provider = new BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
      const c = new Contract(contractAddress, CONTRACT_ABI, signer)
      setContract(c)
      setAccount(addr)
      dispatch({ type: 'CONNECT_SUCCESS' })
      await loadStats(c, addr)
    } catch (err) {
      dispatch({ type: 'CONNECT_FAIL', error: err.message || 'เชื่อมต่อไม่สำเร็จ' })
    }
  }

  function startTimer(seconds) {
    setSecondsLeft(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleStart() {
    if (!contract) return
    dispatch({ type: 'START_BEGIN' })
    try {
      const tx = await contract.startMeditation()
      await tx.wait()
      startTimer(MEDITATION_SECONDS)
      dispatch({ type: 'START_SUCCESS' })
    } catch (err) {
      dispatch({ type: 'START_FAIL', error: err.reason || err.message || 'เริ่มทำสมาธิไม่สำเร็จ' })
    }
  }

  async function handleComplete() {
    if (!contract) return
    dispatch({ type: 'COMPLETE_BEGIN' })
    try {
      const tx = await contract.completeMeditation(selectedToken.address)
      const receipt = await tx.wait()

      clearInterval(timerRef.current)
      setSecondsLeft(MEDITATION_SECONDS)

      const completedTopic = contract.interface.getEvent('MeditationCompleted').topicHash
      const pendingTopic = contract.interface.getEvent('PendingRewardStored').topicHash

      const hasCompleted = receipt.logs.some(log => log.topics[0] === completedTopic)
      const hasPending = receipt.logs.some(log => log.topics[0] === pendingTopic)
      const reward = rewardAmounts[selectedToken.symbol] || '0'

      let msg, result = 'recorded'
      if (hasCompleted) {
        msg = `ทำสมาธิสำเร็จ! ได้รับ ${fmtBal(reward)} ${selectedToken.symbol}`
        result = 'rewarded'
      } else if (hasPending) {
        msg = 'ทำสมาธิสำเร็จ! Reward ถูกเก็บเป็น Pending (fund หมด) — claim ได้เมื่อมี fund'
        result = 'pending'
      } else {
        msg = 'บันทึกสำเร็จ! (ยังไม่ถึงเวลารับ Reward)'
      }

      dispatch({ type: 'COMPLETE_SUCCESS', msg })

      const entry = { ts: Date.now(), net: net.label, token: selectedToken.symbol, reward, result }
      setHistory(prev => {
        const updated = [entry, ...prev].slice(0, HISTORY_MAX)
        localStorage.setItem('jibjib_history', JSON.stringify(updated))
        return updated
      })

      await loadStats(contract, account)
    } catch (err) {
      dispatch({ type: 'COMPLETE_FAIL', error: err.reason || err.message || 'ยืนยันไม่สำเร็จ' })
    }
  }

  async function handleClaimPending() {
    if (!contract) return
    dispatch({ type: 'CLAIM_BEGIN' })
    try {
      const tx = await contract.claimPendingReward(selectedToken.address)
      await tx.wait()
      const pending = pendingRewards[selectedToken.symbol] || '0'
      dispatch({ type: 'CLAIM_SUCCESS', msg: `Claim สำเร็จ! ได้รับ ${fmtBal(pending)} ${selectedToken.symbol}` })
      await loadStats(contract, account)
    } catch (err) {
      dispatch({ type: 'CLAIM_FAIL', error: err.reason || err.message || 'Claim ไม่สำเร็จ' })
    }
  }

  async function handleDonate(e, token) {
    e.preventDefault()
    if (!contract) return
    const amount = e.target.elements.donateAmount.value
    if (!amount || Number(amount) <= 0) {
      dispatch({ type: 'SET_ERROR', error: 'กรุณาใส่จำนวนที่ถูกต้อง' })
      return
    }

    dispatch({ type: 'DONATE_BEGIN', loadingMsg: 'กำลังบริจาค...' })
    try {
      const parsedAmount = parseEther(amount)
      let tx

      if (token.address === '0x0000000000000000000000000000000000000000') {
        tx = await contract.donate(token.address, 0, { value: parsedAmount })
      } else {
        const signer = await new BrowserProvider(window.ethereum).getSigner()
        const erc20 = new Contract(token.address, IERC20_ABI, signer)
        const allowance = await erc20.allowance(account, net.contract)

        if (allowance < parsedAmount) {
          dispatch({ type: 'SET_LOADING', msg: `กำลัง approve ${token.symbol}...` })
          const approveTx = await erc20.approve(net.contract, parsedAmount)
          await approveTx.wait()
        }

        dispatch({ type: 'SET_LOADING', msg: 'กำลังบริจาค...' })
        tx = await contract.donate(token.address, parsedAmount)
      }

      await tx.wait()
      dispatch({ type: 'DONATE_SUCCESS', msg: `บริจาค ${amount} ${token.symbol} สำเร็จ!` })
      e.target.elements.donateAmount.value = ''
      await loadStats(contract, account)
    } catch (err) {
      dispatch({ type: 'DONATE_FAIL', error: err.reason || err.message || 'บริจาคไม่สำเร็จ' })
    }
  }

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="app">
      <h1>JIBJIB Meditation</h1>
      <p className="subtitle">ทำสมาธิ 5 นาที รับ Reward บน Blockchain</p>

      {/* Network Selector */}
      <div className="network-selector">
        {Object.values(NETWORKS).map(n => (
          <button
            key={n.key}
            className={`network-btn ${network === n.key ? 'active' : ''} ${!n.contract ? 'no-contract' : ''}`}
            onClick={() => switchNetwork(n.key)}
            disabled={isLocked}
          >
            {n.label}
            {!n.contract && <span className="soon-badge">เร็วๆนี้</span>}
          </button>
        ))}
      </div>

      {/* Token Selector */}
      {net.tokens.length > 1 && (
        <div className="token-selector">
          <label>เลือก Token ที่จะใช้:</label>
          <select
            value={selectedTokenIdx}
            onChange={(e) => setSelectedTokenIdx(Number(e.target.value))}
            disabled={isLocked || account === null}
          >
            {net.tokens.map((t, i) => (
              <option key={i} value={i}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {mState.error && <div className="error">{mState.error}</div>}
      {mState.loading && <div className="loading">{mState.loading}</div>}
      {mState.phase === 'COMPLETED' && <div className="success">{mState.completedMsg}</div>}

      {!account ? (
        <button className="btn btn-connect" onClick={connectWallet} disabled={!!mState.loading}>
          เชื่อมต่อ Wallet
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
          </div>

          <div className="actions">
            {/* Eligibility Status */}
            {mState.phase === 'IDLE' && !stats.isMeditating && eligibility.todaySessions > 0 && (
              <div className={`eligibility ${eligibility.canGetReward ? 'eligible' : 'waiting'}`}>
                {eligibility.canGetReward
                  ? '✓ พร้อมรับ Reward'
                  : `⏳ ต้องรออีก ${fmtTime(eligibility.secondsUntilReward)} ถึงจะได้รับ Reward`}
              </div>
            )}
            {mState.phase === 'IDLE' && !stats.isMeditating && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contract || !stats.canClaim}>
                {stats.canClaim ? 'เริ่มทำสมาธิ' : 'ครบ 3 ครั้งวันนี้แล้ว'}
              </button>
            )}
            {mState.phase === 'MEDITATING' && secondsLeft === 0 && (
              <button className="btn btn-complete" onClick={handleComplete} disabled={!!mState.loading}>
                ยืนยันรับ Reward
              </button>
            )}
            {mState.phase === 'MEDITATING' && secondsLeft > 0 && (
              <p className="timer-label">กำลังทำสมาธิ... อย่าออกจากหน้านี้</p>
            )}
            {mState.phase === 'PENDING_COMPLETE' && (
              <div className="pending-complete">
                <p className="pending-notice">มีสมาธิค้างจากรอบก่อน</p>
                <button className="btn btn-complete" onClick={handleComplete} disabled={!!mState.loading}>
                  ยืนยันรับ Reward
                </button>
                <button className="btn btn-skip" onClick={() => {
                  setStats(s => ({ ...s, isMeditating: false }))
                  dispatch({ type: 'SKIP_PENDING' })
                }} disabled={!!mState.loading}>
                  ไว้ทีหลัง
                </button>
              </div>
            )}
            {mState.phase === 'CHEATED' && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contract}>
                เริ่มใหม่
              </button>
            )}
          </div>

          {/* Pending Reward */}
          {Number(pendingRewards[selectedToken.symbol] || 0) > 0 && (
            <div className="pending-section">
              <p>Pending Reward: <strong>{fmtBal(pendingRewards[selectedToken.symbol])} {selectedToken.symbol}</strong></p>
              <button className="btn btn-claim" onClick={handleClaimPending} disabled={!!mState.loading}>
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
                <span className="stat-value">3 ชม.</span>
                <span className="stat-label">พักระหว่างรอบ</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">22:00</span>
                <span className="stat-label">Bonus 2x (UTC)</span>
              </div>
            </div>

            {/* Per-token stats */}
            <div className="token-stats">
              <div className="token-stat-header">
                <span className="token-name"></span>
                <span className="token-wallet">กระเป๋า</span>
                <span className="token-reward">รางวัล</span>
                <span className="token-fund">Fund</span>
              </div>
              {net.tokens.map(token => (
                <div key={token.symbol} className="token-stat-row">
                  <span className="token-name">{token.symbol}</span>
                  <span className="token-wallet">{fmtBal(walletBalances[token.symbol] || '-')}</span>
                  <span className="token-reward">{fmtBal(rewardAmounts[token.symbol] || '0')}</span>
                  <span className="token-fund">{fmtBal(fundBalances[token.symbol] || '0')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Donate */}
          <div className="donate-section">
            <h3>บริจาคเข้า Fund</h3>
            <div className="donate-list">
              {net.tokens.map(token => (
                <div key={token.symbol} className="donate-row">
                  <div className="donate-token-info">
                    <span className="donate-token-name">{token.symbol}</span>
                    <span className="donate-token-fund">Fund: {fmtBal(fundBalances[token.symbol] || '0')}</span>
                  </div>
                  <form className="donate-form" onSubmit={(e) => handleDonate(e, token)}>
                    <input
                      name="donateAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={token.symbol}
                    />
                    <button type="submit" className="btn btn-donate-sm" disabled={!!mState.loading || !contract}>
                      +
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="history-section">
        <h3>ประวัติ {history.length > 0 && `(${history.length})`}</h3>
        {history.length === 0 ? (
          <p className="history-empty">ยังไม่มีประวัติ — เริ่มทำสมาธิเลย!</p>
        ) : (
          <>
            <div className="history-list">
              {history.map((h, i) => (
                <div key={i} className={`history-row ${h.result}`}>
                  <span className="history-date">{new Date(h.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="history-time">{new Date(h.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="history-net">{h.net}</span>
                  <span className="history-result">
                    {h.result === 'rewarded' ? `+${fmtBal(h.reward)} ${h.token}` : h.result === 'pending' ? 'pending' : 'บันทึก'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn-clear-history" onClick={() => { setHistory([]); localStorage.removeItem('jibjib_history') }}>
              ล้างประวัติ
            </button>
          </>
        )}
      </div>

      <footer>
        <p>{net.label} | JIBJIB Meditation Reward</p>
      </footer>
    </div>
  )
}

export default App
