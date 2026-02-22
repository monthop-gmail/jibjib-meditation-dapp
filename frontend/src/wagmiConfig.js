import { defineChain } from 'viem'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const jbchain = defineChain({
  id: 8899,
  name: 'JB Chain',
  nativeCurrency: { name: 'JBC', symbol: 'JBC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-l1.jibchain.net'] } },
  blockExplorers: { default: { name: 'JBScan', url: 'https://exp-l1.jibchain.net' } },
})

export const kubtestnet = defineChain({
  id: 25925,
  name: 'KUB Testnet',
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-testnet.bitkubchain.io'] } },
  blockExplorers: { default: { name: 'KubScan', url: 'https://testnet.kubscan.com' } },
})

export const kubl2testnet = defineChain({
  id: 259251,
  name: 'KUB L2 Testnet',
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  rpcUrls: { default: { http: ['https://kublayer2.testnet.kubchain.io'] } },
  blockExplorers: { default: { name: 'KubScan', url: 'https://kublayer2.testnet.kubscan.com' } },
})

export const CHAIN_CONTRACTS = {
  [jbchain.id]: '0x4F17Cd4b8a1BbcB44560BD5ee5c29f277716d0bc',
  [kubtestnet.id]: '0x46210e130dA5cCA4ec68713F4E5A429010d95860',
  [kubl2testnet.id]: '',
}

export const CHAIN_TOKENS = {
  [jbchain.id]: [
    { address: '0xebe937ee67e3219d176965cc08110a258f925e01', symbol: 'JIBJIB', name: 'JIBJIB' },
    { address: '0x440bb674a2e443d600396a69c4c46362148699a2', symbol: 'JIBJIB C', name: 'JIBJIB C' },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'JBC', name: 'JBC (Native)' },
  ],
  [kubtestnet.id]: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'tKUB', name: 'tKUB (Native)' },
  ],
  [kubl2testnet.id]: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'tKUB', name: 'tKUB (Native)' },
  ],
}

export const config = getDefaultConfig({
  appName: 'JIBJIB Meditation',
  projectId: 'jibjib-meditation',
  chains: [jbchain, kubtestnet, kubl2testnet],
})
