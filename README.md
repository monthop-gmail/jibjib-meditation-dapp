# 🧘 JIBJIB Meditation Reward DApp

สร้าง DApp สำหรับแจก reward token บน KUB L2 ให้ผู้ใช้ที่ทำ meditation ครบ 5 นาที

## 📋 ภาพรวม

| รายการ | รายละเอียด |
|---------|-------------|
| Token | JIBJIB จาก JB Chain |
| Reward Chain | KUB L2 Testnet |
| Activity | ทำสมาธิ 5 นาที |
| Chain ID | 259251 (KUB L2 Testnet) |

## 🚀 Quick Start

### 1. Clone โปรเจค
```bash
git clone https://github.com/monthop-gmail/jibjib-meditation-dapp.git
cd jibjib-meditation-dapp
```

### 2. Deploy Smart Contract

#### ใช้ Hardhat
```bash
cd contracts
npm install
npx hardhat run scripts/deploy.js --network kubL2Testnet
```

#### ใช้ Remix
1. เปิด [Remix](https://remix.ethereum.org)
2. Copy ไฟล์ `contracts/MeditationReward.sol` ไปใส่
3. Compileและ  Deploy ไปที่ KUB L2 Testnet

### 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

## 📁 โครงสร้างโปรเจค

```
jibjib-meditation-dapp/
├── README.md
├── contracts/
│   ├── MeditationReward.sol    # Smart Contract
│   └── script/
│       └── deploy.js          # Deployment script
└── frontend/
    ├── index.html
    ├── package.json
    └── src/
        ├── App.jsx
        ├── main.jsx
        └── App.css
```

## 🔧 Configuration

### KUB L2 Testnet
| ชื่อ | ค่า |
|------|-----|
| Network Name | KUB Layer 2 Testnet |
| RPC URL | https://kublayer2.testnet.kubchain.io |
| Chain ID | 259251 |
| Symbol | tKUB |
| Explorer | https://kublayer2.testnet.kubscan.com |

## 📝 Smart Contract API

```solidity
// ฟังก์ชันหลัก
function startMeditation() external    // เริ่ม meditation
function completeMeditation() external // ยืนยันและรับ reward
function getRewardAmount() external view returns (uint256)
```

## 🎯 Features

- [x] Meditation Timer (5 นาที)
- [x] Reward Distribution
- [x] Anti-cheat (ห้าม minimize)
- [x] Connect MetaMask
- [ ] Leaderboard
- [ ] Bridge Token (JB Chain → KUB L2)

## ⚠️ Notes

- ต้องมี tKUB บน KUB L2 Testnet สำหรับทดสอบ
- Bridge token จาก KUB Testnet ได้ที่: https://faucet.kubchain.com/
- ตัว contract เป็น demo version - ควร audit ก่อนใช้จริง

## 📞 Contact

- JB Chain: https://jibchain.net
- KUB Chain: https://kubchain.com
- Docs: https://docs.kubchain.com
