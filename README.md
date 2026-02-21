# JIBJIB Meditation Reward DApp

DApp สำหรับแจก reward token ให้ผู้ใช้ที่ทำสมาธิครบ 5 นาที บน KUB Chain

**Live**: https://jibjib-meditation.pages.dev

## ภาพรวม

| รายการ | รายละเอียด |
|---------|-------------|
| Token | tKUB (native) |
| Activity | ทำสมาธิ 5 นาที |
| Networks | KUB Testnet (L1) / KUB Layer 2 Testnet |
| Deploy | Cloudflare Pages (auto deploy on push) |

## Networks

| Network | Chain ID | RPC | Explorer | Contract |
|---------|----------|-----|----------|----------|
| KUB Testnet (L1) | 25925 | `https://rpc-testnet.bitkubchain.io` | [testnet.kubscan.com](https://testnet.kubscan.com) | `0xCc79006F652a3F091c93e02F4f9A0aA9eaa68064` |
| KUB L2 Testnet | 259251 | `https://kublayer2.testnet.kubchain.io` | [kublayer2.testnet.kubscan.com](https://kublayer2.testnet.kubscan.com) | TBD |

ผู้ใช้เลือก network ได้จากหน้าเว็บ — MetaMask จะ switch chain ให้อัตโนมัติ

## Features

- **Meditation Timer** — จับเวลา 5 นาที พร้อม anti-cheat (ออกจากหน้าจอ = เริ่มใหม่)
- **3 Sessions/Day** — ทำได้สูงสุด 3 ครั้งต่อวัน เว้น 3 ชม.ระหว่างรอบ
- **Bonus 2x** — รอบที่ 3 หลัง 4 ทุ่มได้ reward 2 เท่า
- **Donation** — บริจาค tKUB เข้า reward fund ได้
- **Pending Claims** — ถ้า fund หมด reward จะเก็บเป็น pending ไว้ claim ทีหลัง
- **Multi-Network** — เลือก L1 หรือ L2 ได้ตามสะดวก

## Quick Start

### 1. Clone

```bash
git clone https://github.com/monthop-gmail/jibjib-meditation-dapp.git
cd jibjib-meditation-dapp
```

### 2. Deploy Smart Contract

ดูคู่มือ: [docs/deploy-remix.md](docs/deploy-remix.md)

### 3. Frontend (dev)

```bash
cd frontend
npm install
npm run dev
```

## โครงสร้างโปรเจค

```
jibjib-meditation-dapp/
├── README.md
├── contracts/
│   ├── MeditationReward.sol      # Smart Contract
│   ├── hardhat.config.js
│   └── package.json
├── docs/
│   └── deploy-remix.md           # Remix IDE deploy guide
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx               # Main app (React + ethers v6)
        ├── App.css               # Dark theme styles
        └── main.jsx
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

## CI/CD

- Push to `master` → auto deploy to Cloudflare Pages
- GitHub Actions workflow: `.github/workflows/deploy.yml`

## Notes

- ต้องมี tKUB สำหรับ gas fee — ขอได้ที่ faucet
- Contract เป็น demo version สำหรับ testnet
- KUB L2 RPC มี nginx body size limit ทำให้ deploy ผ่าน CLI ไม่ได้ → ใช้ Remix IDE
