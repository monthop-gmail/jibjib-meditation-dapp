# KUB L2 Testnet — Deploy Blocker

## สถานะ: ยังไม่สามารถ deploy contract ได้

## ปัญหา

KUB Layer 2 Testnet RPC (`https://kublayer2.testnet.kubchain.io`) มี **nginx body size limit** ทำให้ deploy smart contract ไม่ผ่าน

```
500 Internal Server Error
nginx/1.18.0 (Ubuntu)
```

## รายละเอียด

| รายการ | ค่า |
|--------|-----|
| RPC URL | `https://kublayer2.testnet.kubchain.io` |
| Chain ID | 259251 |
| nginx version | 1.18.0 (Ubuntu) |
| nginx limit (ประมาณ) | ~8 KB |
| Contract bytecode | ~29 KB |

## สิ่งที่ทดสอบแล้ว

| วิธี | ผลลัพธ์ |
|------|---------|
| Hardhat CLI (`npx hardhat run --network kubL2Testnet`) | 500 Internal Server Error |
| ethers.js script (`eth_sendRawTransaction`) | 500 Internal Server Error |
| Simple RPC calls (`eth_chainId`, `eth_blockNumber`) | OK |
| Simple transactions (self-transfer) | OK |
| Large payload transactions (contract deploy) | 500 Error |

ปัญหาเกิดเฉพาะ request ที่มี body ขนาดใหญ่ (เช่น deploy contract ที่มี bytecode เยอะ) — request เล็กๆ ทำงานปกติ

## สิ่งที่ต้องแก้

ทีม KUB L2 ต้องเพิ่ม `client_max_body_size` ใน nginx config:

```nginx
# เพิ่มใน nginx config ของ RPC endpoint
server {
    ...
    client_max_body_size 1m;  # เพิ่มจาก default ~8KB เป็น 1MB
    ...
}
```

แล้ว reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## ทางเลือกชั่วคราว

- ใช้ **KUB Testnet (L1)** ไปก่อน — deploy สำเร็จแล้ว
  - Chain ID: 25925
  - RPC: `https://rpc-testnet.bitkubchain.io`
  - Contract: `0x46210e130dA5cCA4ec68713F4E5A429010d95860`
- Frontend รองรับทั้ง L1 และ L2 แล้ว — เมื่อ deploy L2 สำเร็จ แค่ใส่ contract address ใน `wagmiConfig.js` → `CHAIN_CONTRACTS`

## ไทม์ไลน์

| วันที่ | เหตุการณ์ |
|--------|----------|
| 2026-02-20 | ค้นพบปัญหา — ทดสอบ deploy ผ่าน Hardhat และ ethers.js |
| 2026-02-21 | ทดสอบซ้ำ — ยังเจอปัญหาเดิม |
| | เปลี่ยนไปใช้ L1 ชั่วคราว — deploy สำเร็จ |
| | Frontend อัพเดทรองรับทั้ง L1 + L2 |
| TBD | รอทีม KUB L2 แก้ nginx config |
