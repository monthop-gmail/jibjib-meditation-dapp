import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { useAccount, useChainId, useSwitchChain, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { readContract } from 'wagmi/actions'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther, parseEther, parseEventLogs } from 'viem'
import { config, CHAIN_CONTRACTS, CHAIN_TOKENS, jbchain } from './wagmiConfig.js'

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

const IERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
]

const CONTRACT_ABI = [
  { name: 'startMeditation', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'completeMeditation', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { name: 'claimPendingReward', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { name: 'donate', type: 'function', stateMutability: 'payable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'getRewardAmount', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getUserStats', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'totalSessions', type: 'uint256' }, { name: 'lastSessionTime', type: 'uint256' }, { name: 'isMeditating', type: 'bool' }, { name: 'todaySessions', type: 'uint256' }, { name: 'canClaim', type: 'bool' }] },
  { name: 'getRewardEligibility', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'canGetReward', type: 'bool' }, { name: 'secondsUntilReward', type: 'uint256' }, { name: 'todaySessions', type: 'uint256' }, { name: 'isMeditating', type: 'bool' }] },
  { name: 'getPendingReward', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getTokenBalance', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'MeditationCompleted', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'reward', type: 'uint256' }, { name: 'token', type: 'address' }, { name: 'isBonus', type: 'bool' }] },
  { name: 'MeditationRecorded', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'timestamp', type: 'uint256' }] },
  { name: 'PendingRewardStored', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }] },
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

function getEligibilityReason(eligibility, todaySessions) {
  if (todaySessions === 0) return null
  if (!eligibility.canGetReward) {
    if (eligibility.secondsUntilReward > 0) {
      return { icon: '⏳', text: `ต้องรออีก ${fmtTime(eligibility.secondsUntilReward)} ถึงจะได้รับ Reward` }
    }
    return { icon: '🚫', text: 'ครบ 3 ครั้ง/วันแล้ว' }
  }
  return { icon: '✓', text: 'พร้อมรับ Reward' }
}

function getResultIcon(result) {
  switch (result) {
    case 'rewarded': return '✓'
    case 'pending': return '⏳'
    case 'recorded': return '📝'
    default: return '?'
  }
}

function getResultText(result, token, reward) {
  switch (result) {
    case 'rewarded': return `ได้รับ ${fmtBal(reward)} ${token}`
    case 'pending': return `เก็บ Pending ${fmtBal(reward)} ${token}`
    case 'recorded': return 'บันทึกแล้ว (ยังไม่ถึงเวลารับ)'
    default: return ''
  }
}

const HISTORY_MAX = 50
const MEDITATION_SECONDS = 300

// ── State Machine ───────────────────────────────────────────────────
const initialMeditationState = {
  phase: 'IDLE',
  error: '',
  loading: '',
  completedMsg: '',
}

function meditationReducer(state, action) {
  switch (action.type) {
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
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { disconnect } = useDisconnect()
  const { writeContractAsync } = useWriteContract()

  const contractAddress = CHAIN_CONTRACTS[chainId] || ''
  const tokens = CHAIN_TOKENS[chainId] || CHAIN_TOKENS[jbchain.id]
  const chainLabel = { [8899]: 'JB Chain', [25925]: 'KUB Testnet', [259251]: 'KUB L2 Testnet' }[chainId] || 'Unknown'

  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(MEDITATION_SECONDS)
  const [stats, setStats] = useState({ totalSessions: 0, lastSessionTime: 0, isMeditating: false, todaySessions: 0, canClaim: true })
  const [eligibility, setEligibility] = useState({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
  const [rewardAmounts, setRewardAmounts] = useState({})
  const [pendingRewards, setPendingRewards] = useState({})
  const [fundBalances, setFundBalances] = useState({})
  const [walletBalances, setWalletBalances] = useState({})
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jibjib_history') || '[]') } catch { return [] }
  })
  const [mState, dispatch] = useReducer(meditationReducer, initialMeditationState)
  const timerRef = useRef(null)
  const prevAddressRef = useRef(null)

  const selectedToken = tokens[selectedTokenIdx] || tokens[0]
  const isLocked = ['STARTING', 'MEDITATING', 'COMPLETING', 'CLAIMING', 'DONATING'].includes(mState.phase)

  // Reset state on account/chain change
  useEffect(() => {
    if (prevAddressRef.current && prevAddressRef.current !== address) {
      clearInterval(timerRef.current)
      setSecondsLeft(MEDITATION_SECONDS)
      dispatch({ type: 'RESET' })
      setStats({ totalSessions: 0, lastSessionTime: 0, isMeditating: false, todaySessions: 0, canClaim: true })
      setEligibility({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
      setRewardAmounts({})
      setPendingRewards({})
      setFundBalances({})
      setWalletBalances({})
    }
    prevAddressRef.current = address
  }, [address])

  useEffect(() => {
    clearInterval(timerRef.current)
    setSecondsLeft(MEDITATION_SECONDS)
    dispatch({ type: 'RESET' })
    setSelectedTokenIdx(0)
    setRewardAmounts({})
    setPendingRewards({})
    setFundBalances({})
    setWalletBalances({})
    setStats({ totalSessions: 0, lastSessionTime: 0, isMeditating: false, todaySessions: 0, canClaim: true })
    setEligibility({ canGetReward: true, secondsUntilReward: 0, todaySessions: 0, isMeditating: false })
  }, [chainId])

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(timerRef.current), [])

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

  // Resume timer if contract says isMeditating
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

  const loadStats = useCallback(async () => {
    if (!isConnected || !address || !contractAddress) return

    try {
      const statsResult = await readContract(config, {
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'getUserStats',
        args: [address],
      })
      setStats({
        totalSessions: Number(statsResult[0]),
        lastSessionTime: Number(statsResult[1]),
        isMeditating: statsResult[2],
        todaySessions: Number(statsResult[3]),
        canClaim: statsResult[4],
      })
    } catch (err) {
      console.error('getUserStats failed:', err.message)
      dispatch({ type: 'SET_ERROR', error: 'ดึงข้อมูลไม่ได้ — ลอง Hard Refresh (Ctrl+Shift+R) หรือเปลี่ยน network แล้วกลับมา' })
      return
    }

    try {
      const eligResult = await readContract(config, {
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'getRewardEligibility',
        args: [address],
      })
      setEligibility({
        canGetReward: eligResult[0],
        secondsUntilReward: Number(eligResult[1]),
        todaySessions: Number(eligResult[2]),
        isMeditating: eligResult[3],
      })
    } catch (err) {
      console.error('getRewardEligibility failed:', err.message)
    }

    const rewards = {}
    const pendings = {}
    const balances = {}
    const walletBals = {}

    for (const token of tokens) {
      try {
        const [reward, pending, balance] = await Promise.all([
          readContract(config, { address: contractAddress, abi: CONTRACT_ABI, functionName: 'getRewardAmount', args: [token.address] }),
          readContract(config, { address: contractAddress, abi: CONTRACT_ABI, functionName: 'getPendingReward', args: [address, token.address] }),
          readContract(config, { address: contractAddress, abi: CONTRACT_ABI, functionName: 'getTokenBalance', args: [token.address] }),
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
        if (token.address === ZERO_ADDR) {
          const bal = await readContract(config, { address: contractAddress, abi: [{ name: 'nativeBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'nativeBalance', args: [] })
          // For wallet balance, we can't easily read it via readContract — use a placeholder
          walletBals[token.symbol] = '-'
        } else {
          const bal = await readContract(config, { address: token.address, abi: IERC20_ABI, functionName: 'balanceOf', args: [address] })
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
  }, [isConnected, address, contractAddress, tokens])

  // Load stats when connected
  useEffect(() => {
    if (isConnected && address && contractAddress) {
      loadStats()
    }
  }, [isConnected, address, contractAddress, loadStats])

  // Get native balance via wagmi hook
  const { data: nativeBalance } = useBalance({ address })
  useEffect(() => {
    if (nativeBalance && tokens.length > 0) {
      const nativeToken = tokens.find(t => t.address === ZERO_ADDR)
      if (nativeToken) {
        setWalletBalances(prev => ({ ...prev, [nativeToken.symbol]: formatEther(nativeBalance.value) }))
      }
    }
  }, [nativeBalance, tokens])

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
    if (!contractAddress) return
    dispatch({ type: 'START_BEGIN' })
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'startMeditation',
      })
      const { waitForTransactionReceipt } = await import('wagmi/actions')
      const receipt = await waitForTransactionReceipt(config, { hash })

      // Check for auto-complete events
      const events = parseEventLogs({ abi: CONTRACT_ABI, logs: receipt.logs })
      const hasCompleted = events.some(e => e.eventName === 'MeditationCompleted')
      const hasPending = events.some(e => e.eventName === 'PendingRewardStored')
      const hasRecorded = events.some(e => e.eventName === 'MeditationRecorded')
      const reward = rewardAmounts[selectedToken.symbol] || '0'

      // Only show message if there was an auto-complete
      if (hasCompleted || hasPending || hasRecorded) {
        let msg, result
        if (hasCompleted) {
          msg = `✓ รอบก่อน: ได้รับ ${fmtBal(reward)} ${selectedToken.symbol}`
          result = 'rewarded'
        } else if (hasPending) {
          msg = `⏳ รอบก่อน: เก็บ Pending ${fmtBal(reward)} ${selectedToken.symbol}`
          result = 'pending'
        } else {
          msg = '📝 รอบก่อน: บันทึกแล้ว'
          result = 'recorded'
        }

        // Add to history
        const entry = { ts: Date.now(), net: chainLabel, token: selectedToken.symbol, reward, result }
        setHistory(prev => {
          const updated = [entry, ...prev].slice(0, HISTORY_MAX)
          localStorage.setItem('jibjib_history', JSON.stringify(updated))
          return updated
        })
      }

      startTimer(MEDITATION_SECONDS)
      dispatch({ type: 'START_SUCCESS' })
      await loadStats()
    } catch (err) {
      dispatch({ type: 'START_FAIL', error: err.shortMessage || err.message || 'เริ่มทำสมาธิไม่สำเร็จ' })
    }
  }

  async function handleComplete() {
    if (!contractAddress) return
    dispatch({ type: 'COMPLETE_BEGIN' })
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'completeMeditation',
        args: [selectedToken.address],
      })
      const { waitForTransactionReceipt } = await import('wagmi/actions')
      const receipt = await waitForTransactionReceipt(config, { hash })

      clearInterval(timerRef.current)
      setSecondsLeft(MEDITATION_SECONDS)

      const events = parseEventLogs({ abi: CONTRACT_ABI, logs: receipt.logs })
      const hasCompleted = events.some(e => e.eventName === 'MeditationCompleted')
      const hasPending = events.some(e => e.eventName === 'PendingRewardStored')
      const hasRecorded = events.some(e => e.eventName === 'MeditationRecorded')
      const reward = rewardAmounts[selectedToken.symbol] || '0'

      let msg, result = 'recorded'
      if (hasCompleted) {
        msg = `✓ ทำสมาธิสำเร็จ! ได้รับ ${fmtBal(reward)} ${selectedToken.symbol}`
        result = 'rewarded'
      } else if (hasPending) {
        msg = `⏳ ทำสมาธิสำเร็จ! เก็บ Pending ${fmtBal(reward)} ${selectedToken.symbol} — claim ได้เมื่อมี fund`
        result = 'pending'
      } else if (hasRecorded) {
        msg = '📝 บันทึกสำเร็จ! (ยังไม่ถึงเวลารับ Reward)'
        result = 'recorded'
      } else {
        msg = 'ทำสมาธิเสร็จ!'
      }

      dispatch({ type: 'COMPLETE_SUCCESS', msg })

      const entry = { ts: Date.now(), net: chainLabel, token: selectedToken.symbol, reward, result }
      setHistory(prev => {
        const updated = [entry, ...prev].slice(0, HISTORY_MAX)
        localStorage.setItem('jibjib_history', JSON.stringify(updated))
        return updated
      })

      await loadStats()
    } catch (err) {
      dispatch({ type: 'COMPLETE_FAIL', error: err.shortMessage || err.message || 'ยืนยันไม่สำเร็จ' })
    }
  }

  async function handleClaimPending() {
    if (!contractAddress) return
    dispatch({ type: 'CLAIM_BEGIN' })
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'claimPendingReward',
        args: [selectedToken.address],
      })
      const { waitForTransactionReceipt } = await import('wagmi/actions')
      await waitForTransactionReceipt(config, { hash })
      const pending = pendingRewards[selectedToken.symbol] || '0'
      dispatch({ type: 'CLAIM_SUCCESS', msg: `Claim สำเร็จ! ได้รับ ${fmtBal(pending)} ${selectedToken.symbol}` })
      await loadStats()
    } catch (err) {
      dispatch({ type: 'CLAIM_FAIL', error: err.shortMessage || err.message || 'Claim ไม่สำเร็จ' })
    }
  }

  async function handleDonate(e, token) {
    e.preventDefault()
    if (!contractAddress) return
    const amount = e.target.elements.donateAmount.value
    if (!amount || Number(amount) <= 0) {
      dispatch({ type: 'SET_ERROR', error: 'กรุณาใส่จำนวนที่ถูกต้อง' })
      return
    }

    dispatch({ type: 'DONATE_BEGIN', loadingMsg: 'กำลังบริจาค...' })
    try {
      const parsedAmount = parseEther(amount)
      const { waitForTransactionReceipt } = await import('wagmi/actions')

      if (token.address === ZERO_ADDR) {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'donate',
          args: [token.address, 0n],
          value: parsedAmount,
        })
        await waitForTransactionReceipt(config, { hash })
      } else {
        const allowance = await readContract(config, {
          address: token.address,
          abi: IERC20_ABI,
          functionName: 'allowance',
          args: [address, contractAddress],
        })

        if (allowance < parsedAmount) {
          dispatch({ type: 'SET_LOADING', msg: `กำลัง approve ${token.symbol}...` })
          const approveHash = await writeContractAsync({
            address: token.address,
            abi: IERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, parsedAmount],
          })
          await waitForTransactionReceipt(config, { hash: approveHash })
        }

        dispatch({ type: 'SET_LOADING', msg: 'กำลังบริจาค...' })
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'donate',
          args: [token.address, parsedAmount],
        })
        await waitForTransactionReceipt(config, { hash })
      }

      dispatch({ type: 'DONATE_SUCCESS', msg: `บริจาค ${amount} ${token.symbol} สำเร็จ!` })
      e.target.elements.donateAmount.value = ''
      await loadStats()
    } catch (err) {
      dispatch({ type: 'DONATE_FAIL', error: err.shortMessage || err.message || 'บริจาคไม่สำเร็จ' })
    }
  }

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="app">
      <h1>JIBJIB Meditation</h1>
      <p className="subtitle">ทำสมาธิ 5 นาที รับ Reward บน Blockchain</p>

      {/* Wallet Connect */}
      <div className="wallet-connect">
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>

      {/* Token Selector */}
      {isConnected && tokens.length > 1 && (
        <div className="token-selector">
          <label>เลือก Token ที่จะใช้:</label>
          <select
            value={selectedTokenIdx}
            onChange={(e) => setSelectedTokenIdx(Number(e.target.value))}
            disabled={isLocked}
          >
            {tokens.map((t, i) => (
              <option key={i} value={i}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {mState.error && <div className="error">{mState.error}</div>}
      {mState.loading && <div className="loading">{mState.loading}</div>}
      {mState.phase === 'COMPLETED' && <div className="success">{mState.completedMsg}</div>}

      {isConnected && contractAddress && (
        <div className="main">
          <div className="account">
            {address.slice(0, 6)}...{address.slice(-4)}
            <span className="network-badge">{chainLabel}</span>
          </div>

          <div className="contract-address">
            <small>Contract: {contractAddress.slice(0, 10)}...{contractAddress.slice(-4)}</small>
          </div>

          <div className="timer">
            <div className="timer-display">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
          </div>

          <div className="actions">
            {/* Eligibility Status + Reward Preview */}
            {['IDLE', 'COMPLETED'].includes(mState.phase) && !stats.isMeditating && (
              <>
                {eligibility.todaySessions > 0 && (
                  <div className={`eligibility ${eligibility.canGetReward ? 'eligible' : 'waiting'}`}>
                    {(() => {
                      const reason = getEligibilityReason(eligibility, eligibility.todaySessions)
                      return reason ? `${reason.icon} ${reason.text}` : null
                    })()}
                  </div>
                )}
                <div className="reward-preview">
                  รอบนี้จะได้รับ: <strong>{eligibility.canGetReward ? `${fmtBal(rewardAmounts[selectedToken.symbol] || '0')} ${selectedToken.symbol}` : 'บันทึกอย่างเดียว'}</strong>
                </div>
              </>
            )}
            {['IDLE', 'COMPLETED'].includes(mState.phase) && !stats.isMeditating && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contractAddress || !stats.canClaim}>
                {stats.canClaim ? 'เริ่มทำสมาธิ' : 'ครบ 3 ครั้งวันนี้แล้ว'}
              </button>
            )}
            {mState.phase === 'MEDITATING' && secondsLeft === 0 && (
              <div className="pending-complete">
                <button className="btn btn-complete" onClick={handleComplete} disabled={!!mState.loading}>
                  ยืนยันรับ Reward
                </button>
                <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contractAddress}>
                  เริ่มทำสมาธิใหม่
                </button>
              </div>
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
                <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contractAddress}>
                  เริ่มทำสมาธิใหม่
                </button>
              </div>
            )}
            {mState.phase === 'CHEATED' && (
              <button className="btn btn-start" onClick={handleStart} disabled={!!mState.loading || !contractAddress}>
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
              {tokens.map(token => (
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
              {tokens.map(token => (
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
                    <button type="submit" className="btn btn-donate-sm" disabled={!!mState.loading || !contractAddress}>
                      +
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isConnected && !contractAddress && (
        <div className="error">ยังไม่มี Contract บน {chainLabel} — กรุณาเลือก network อื่น</div>
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
                    {getResultIcon(h.result)} {getResultText(h.result, h.token, h.reward)}
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
        <p>{chainLabel} | JIBJIB Meditation Reward</p>
      </footer>
    </div>
  )
}

export default App
