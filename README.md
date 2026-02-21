# JIBJIB Meditation Reward DApp

DApp สำหรับแจก reward token ให้ผู้ใช้ที่ทำสมาธิครบ 5 นาที รองรับหลาย chain

**Live**: https://jibjib-meditation.pages.dev

## ภาพรวม

| รายการ | รายละเอียด |
|---------|-------------|
| Activity | ทำสมาธิ 5 นาที → รับ reward token |
| Networks | JB Chain (mainnet) / KUB Testnet |
| Tokens | JIBJIB, JIBJIB C, JBC, tKUB |
| Deploy | Cloudflare Pages (auto deploy on push to master) |

## Networks & Contracts

| Network | Chain ID | RPC | Contract | Status |
|---------|----------|-----|----------|--------|
| **JB Chain** | 8899 (0x22c3) | `rpc-l1.jibchain.net` | `0x740ff5b8646c7feb3f46A475a33A992DC2CCC5c8` | Working |
| **KUB Testnet** | 25925 (0x6545) | `rpc-testnet.bitkubchain.io` | `0xCc79006F652a3F091c93e02F4f9A0aA9eaa68064` | Working |
| KUB L2 Testnet | 259251 (0x3F4B3) | `kublayer2.testnet.kubchain.io` | - | [Blocked](docs/kub-l2-deploy-blocker.md) |

## Reward Amounts

| Network | Token | Reward/session | Bonus (22:00 UTC) |
|---------|-------|---------------|-------------------|
| JB Chain | JIBJIB | 100,000 | 200,000 |
| JB Chain | JIBJIB C | 50,000 | 100,000 |
| JB Chain | JBC (native) | 0.01 | 0.02 |
| KUB Testnet | tKUB (native) | 0.001 | 0.002 |

## Features

- **Meditation Timer** — จับเวลา 5 นาที พร้อม anti-cheat (ออกจากหน้าจอ = เริ่มใหม่)
- **3 Sessions/Day** — ทำได้สูงสุด 3 ครั้งต่อวัน เว้น 3 ชม.ระหว่างรอบ
- **Bonus 2x** — รอบที่ 3 หลัง 22:00 UTC ได้ reward 2 เท่า
- **Multi-Token** — เลือก token ที่จะรับ reward ได้ (JIBJIB, JIBJIB C, JBC)
- **Auto Network Switch** — กดปุ่มเปลี่ยน chain ได้เลย wallet switch ให้อัตโนมัติ
- **Wallet Balance** — แสดง balance ของทุก token ในกระเป๋า
- **Donation** — บริจาคเข้า reward fund ได้ (ERC20 auto-approve)
- **Pending Claims** — ถ้า fund หมด reward เก็บเป็น pending ไว้ claim ทีหลัง
- **Wallet Support** — MetaMask, Brave Wallet

## Quick Start (Dev)

### 1. Clone & Install

```bash
git clone https://github.com/monthop-gmail/jibjib-meditation-dapp.git
cd jibjib-meditation-dapp/frontend
npm install
npm run dev
```

### 2. Deploy Smart Contract

**Via Hardhat:**
```bash
cd contracts
npm install
PRIVATE_KEY=0x... npx hardhat run script/deploy-debug.js --network jbchain
```

**Via Remix IDE:** ดูคู่มือ [docs/deploy-remix.md](docs/deploy-remix.md)

### 3. Set Reward Amounts (after deploy)

```bash
PRIVATE_KEY=0x... npx hardhat console --network jbchain
```
```javascript
const MR = await ethers.getContractFactory("MeditationReward");
const c = MR.attach("CONTRACT_ADDRESS");
await (await c.setRewardAmount("TOKEN_ADDRESS", ethers.parseEther("100000"))).wait();
```

## โครงสร้างโปรเจค

```
jibjib-meditation-dapp/
├── .gitignore
├── README.md
├── contracts/
│   ├── src/MeditationReward.sol    # Smart Contract (Solidity 0.8.19)
│   ├── script/deploy-debug.js      # Deploy script with verification
│   ├── hardhat.config.js           # Networks: jbchain, kubTestnet, kubL2Testnet
│   └── package.json
├── docs/
│   ├── deploy-remix.md             # Remix IDE deploy guide
│   └── kub-l2-deploy-blocker.md    # L2 nginx issue documentation
├── frontend/
│   ├── public/_headers             # CF Pages cache control
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                 # Main app (React + ethers v6)
│       ├── App.css                 # Dark theme, responsive
│       └── main.jsx
└── .github/workflows/
    └── deploy.yml                  # Auto deploy to CF Pages
```

## Smart Contract API

```solidity
// Meditation
function startMeditation() external
function completeMeditation(address token) external

// Rewards
function claimPendingReward(address token) external
function getRewardAmount(address token) view returns (uint256)
function getPendingReward(address user, address token) view returns (uint256)

// Donation & Fund
function donate(address token, uint256 amount) payable
function getTokenBalance(address token) view returns (uint256)

// Stats
function getUserStats(address user) view returns (
    uint256 totalSessions, uint256 lastSessionTime,
    bool isMeditating, uint256 todaySessions, bool canClaim
)

// Admin
function setRewardAmount(address token, uint256 amount) onlyOwner
function withdraw(address token, uint256 amount) onlyOwner
```

## Known Issues

- **KUB L2 Testnet**: RPC nginx body size limit (~8KB) blocks contract deployment (~29KB bytecode) — ดู [docs/kub-l2-deploy-blocker.md](docs/kub-l2-deploy-blocker.md)
- Contract owner: `0x523a88e0DE9a48ebFdb18840771CfeE516772AFd`

## CI/CD

- Push to `master` → auto build & deploy to Cloudflare Pages
- Workflow: `.github/workflows/deploy.yml`
- Secrets needed: `CF_API_TOKEN`, `CF_ACCOUNT_ID`
