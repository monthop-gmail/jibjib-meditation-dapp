# Deploy MeditationReward ผ่าน Remix IDE

## ทำไมต้องใช้ Remix?

Deploy ผ่าน Hardhat (CLI) ไม่ได้เพราะ KUB L2 Testnet RPC มี **nginx body size limit (~8KB)** แต่ contract bytecode ประมาณ **~29KB** ทำให้ `eth_sendRawTransaction` ส่งไม่ผ่าน (500 Internal Server Error)

Remix IDE + MetaMask ส่ง transaction ผ่าน browser ซึ่งอาจ bypass limit นี้ได้

## ข้อมูล Network

| Item | Value |
|------|-------|
| Network Name | KUB L2 Testnet |
| RPC URL | `https://kublayer2.testnet.kubchain.io` |
| Chain ID | `259251` |
| Currency Symbol | `tKUB` |
| Explorer | https://kublayer2.testnet.kubscan.com |

## ขั้นตอน

### 1. เปิด Remix IDE

ไปที่ https://remix.ethereum.org

### 2. สร้างไฟล์ Contract

- ที่ File Explorer (ซ้ายมือ) → คลิก icon **"New File"** (กระดาษ + เครื่องหมายบวก)
- ตั้งชื่อ `MeditationReward.sol`
- Copy โค้ดทั้งไฟล์จาก [`contracts/MeditationReward.sol`](../contracts/MeditationReward.sol) วางลงไป

### 3. Compile

- คลิก tab **"Solidity Compiler"** (icon รูปตัว S ซ้ายมือ)
- เลือก Compiler version: **0.8.19**
- คลิก **"Compile MeditationReward.sol"**
- ต้องเห็นเครื่องหมายถูกสีเขียว ไม่มี error

### 4. ตั้ง MetaMask → KUB L2 Testnet

เพิ่ม Network ใน MetaMask:

1. เปิด MetaMask → Settings → Networks → Add Network
2. กรอกข้อมูล:
   - **Network Name**: `KUB L2 Testnet`
   - **New RPC URL**: `https://kublayer2.testnet.kubchain.io`
   - **Chain ID**: `259251`
   - **Currency Symbol**: `tKUB`
   - **Block Explorer URL**: `https://kublayer2.testnet.kubscan.com`
3. กด Save
4. เลือก Network เป็น **KUB L2 Testnet**

### 5. Deploy

1. กลับมาที่ Remix → คลิก tab **"Deploy & Run Transactions"** (icon ลูกศร ซ้ายมือ)
2. **Environment**: เลือก **"Injected Provider - MetaMask"**
   - MetaMask จะ popup ให้ connect → กด Connect
   - ตรวจว่า Chain ID แสดง `259251`
3. **Contract**: เลือก `MeditationReward`
4. **Gas Limit**: ใส่ `5000000` (5M)
5. คลิก **"Deploy"**
6. MetaMask จะ popup ให้ confirm transaction → กด **Confirm**
7. รอสักครู่ จะเห็น transaction hash และ contract address ที่ด้านล่าง (Deployed Contracts)

### 6. บันทึก Contract Address

เมื่อ deploy สำเร็จ:

- Copy **contract address** เก็บไว้
- ดู contract บน explorer: `https://kublayer2.testnet.kubscan.com/address/<CONTRACT_ADDRESS>`

### 7. ตั้งค่า Reward (หลัง deploy)

หลัง deploy แล้ว ต้องตั้งค่า reward amount ก่อนใช้งาน:

1. ที่ Remix → Deployed Contracts → กดเปิด contract
2. หา function **`setRewardAmount`**
3. ใส่ค่า:
   - **token**: `0x0000000000000000000000000000000000000000` (native tKUB)
   - **amount**: `1000000000000000000` (1 tKUB = 10^18 wei)
4. คลิก **transact** → MetaMask confirm

## Troubleshooting

### Deploy ไม่สำเร็จ (500 Error)

ถ้า Remix + MetaMask ยังส่งไม่ผ่าน แสดงว่า RPC nginx limit ใช้กับทุก method → ต้องแจ้งทีม KUB L2 ให้เพิ่ม `client_max_body_size` ใน nginx config

### MetaMask ไม่แสดง KUB L2 Testnet

ตรวจว่า Chain ID ถูกต้อง: `259251` (ไม่ใช่ `259347`)

### Gas ไม่พอ

ตรวจว่า wallet มี tKUB เพียงพอ (ต้องมีอย่างน้อย ~0.5 tKUB สำหรับ gas fee)

### Compile Error

ตรวจว่าเลือก Solidity version **0.8.19** ขึ้นไป

## อัพเดท Frontend หลัง Deploy

เมื่อได้ contract address แล้ว อัพเดทใน `frontend/src/App.jsx`:

```javascript
const CONTRACT_ADDRESS = "<NEW_CONTRACT_ADDRESS>";
```

และอัพเดท ABI ให้ตรงกับ contract ใหม่ (ดู [TODO ด้านล่าง](#frontend-todo))

## Frontend TODO

Contract ใหม่มี breaking changes — Frontend ต้องอัพเดท:

- [ ] `completeMeditation()` → `completeMeditation(address token)`
- [ ] `getUserStats()` return 5 ค่า (เดิม 3): +`todaySessions`, +`canClaim`
- [ ] `getRewardAmount()` → `getRewardAmount(address token)`
- [ ] เพิ่ม UI: donation, pending claims, token selection, daily session counter
