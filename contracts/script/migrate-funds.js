/**
 * Migrate funds between MeditationReward contracts
 *
 * Usage:
 *   PRIVATE_KEY=0x... node script/migrate-funds.js
 *
 * Edit OLD_CONTRACTS / NEW_CONTRACTS below before running.
 */

const { JsonRpcProvider, Wallet, Contract, formatEther } = require('ethers')

// ── Config ──────────────────────────────────────────────────────────
const OLD_CONTRACTS = {
  jbchain: '0x740ff5b8646c7feb3f46A475a33A992DC2CCC5c8',
  kubtestnet: '0xCc79006F652a3F091c93e02F4f9A0aA9eaa68064',
}

const NEW_CONTRACTS = {
  jbchain: '0x7DCd9A42096D9f2B97CD6680d72E71bCBCFfdCf1',
  kubtestnet: '0x740ff5b8646c7feb3f46A475a33A992DC2CCC5c8',
}

const NETWORKS = {
  jbchain: {
    rpc: 'https://rpc-l1.jibchain.net',
    label: 'JB Chain',
    tokens: [
      { address: '0x0000000000000000000000000000000000000000', symbol: 'JBC' },
      { address: '0xebe937ee67e3219d176965cc08110a258f925e01', symbol: 'JIBJIB' },
      { address: '0x440bb674a2e443d600396a69c4c46362148699a2', symbol: 'JIBJIB C' },
    ],
  },
  kubtestnet: {
    rpc: 'https://rpc-testnet.bitkubchain.io',
    label: 'KUB Testnet',
    tokens: [
      { address: '0x0000000000000000000000000000000000000000', symbol: 'tKUB' },
    ],
  },
}

const ZERO = '0x0000000000000000000000000000000000000000'

// ── ABI ─────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
  'function withdraw(address token, uint256 amount) external',
  'function donate(address token, uint256 amount) external payable',
  'function getTokenBalance(address) view returns (uint256)',
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
]

// ── Main ────────────────────────────────────────────────────────────
async function migrateNetwork(networkKey) {
  const net = NETWORKS[networkKey]
  const oldAddr = OLD_CONTRACTS[networkKey]
  const newAddr = NEW_CONTRACTS[networkKey]

  if (!oldAddr || !newAddr) {
    console.log(`Skipping ${net.label}: no contract configured`)
    return
  }

  console.log(`\n=== ${net.label}: ${oldAddr.slice(0, 8)}... → ${newAddr.slice(0, 8)}... ===`)

  const provider = new JsonRpcProvider(net.rpc)
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider)
  const oldC = new Contract(oldAddr, CONTRACT_ABI, wallet)
  const newC = new Contract(newAddr, CONTRACT_ABI, wallet)

  for (const token of net.tokens) {
    const bal = await oldC.getTokenBalance(token.address)
    console.log(`  ${token.symbol}: ${formatEther(bal)}`)

    if (bal === 0n) continue

    // Withdraw from old
    console.log(`  Withdrawing ${token.symbol}...`)
    let tx = await oldC.withdraw(token.address, bal)
    await tx.wait()

    if (token.address === ZERO) {
      // Native: donate with value
      console.log(`  Donating ${token.symbol} (native)...`)
      tx = await newC.donate(ZERO, 0, { value: bal })
    } else {
      // ERC20: approve → donate
      console.log(`  Approving ${token.symbol}...`)
      const erc20 = new Contract(token.address, ERC20_ABI, wallet)
      tx = await erc20.approve(newAddr, bal)
      await tx.wait()
      console.log(`  Donating ${token.symbol}...`)
      tx = await newC.donate(token.address, bal)
    }
    await tx.wait()
    console.log(`  ${token.symbol} ✓`)
  }
}

async function verify() {
  console.log('\n=== Verify new contract balances ===')
  for (const [key, net] of Object.entries(NETWORKS)) {
    const addr = NEW_CONTRACTS[key]
    if (!addr) continue
    const provider = new JsonRpcProvider(net.rpc)
    const c = new Contract(addr, CONTRACT_ABI, provider)
    console.log(`${net.label}:`)
    for (const token of net.tokens) {
      const bal = await c.getTokenBalance(token.address)
      console.log(`  ${token.symbol}: ${formatEther(bal)}`)
    }
  }
}

;(async () => {
  if (!process.env.PRIVATE_KEY) {
    console.error('Usage: PRIVATE_KEY=0x... node script/migrate-funds.js')
    process.exit(1)
  }
  try {
    for (const key of Object.keys(NETWORKS)) {
      await migrateNetwork(key)
    }
    await verify()
    console.log('\nDone!')
  } catch (e) {
    console.error('ERROR:', e.message)
    process.exit(1)
  }
})()
