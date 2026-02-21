# JIBJIB Meditation DApp — Flow

## Contract v4

| Chain | Contract | Rewards |
|-------|----------|---------|
| JB Chain | `0x4F17Cd4b8a1BbcB44560BD5ee5c29f277716d0bc` | JIBJIB 100K, JIBJIB C 50K, JBC 0.01 |
| KUB Testnet | `0x46210e130dA5cCA4ec68713F4E5A429010d95860` | tKUB 0.001 |

---

## Meditation Flow

```
                    +-----------+
                    |   IDLE    |  เชื่อมต่อ Wallet แล้ว พร้อมเริ่ม
                    +-----+-----+
                          |
                  กด "เริ่มทำสมาธิ"
                  (startMeditation)
                          |
               +----------v----------+
               |    MEDITATING       |  นับถอยหลัง 5 นาที
               |  secondsLeft > 0    |  ห้ามออกจากหน้าจอ
               +----------+----------+
                    |             |
              ออกจากหน้าจอ    ครบ 5 นาที
                    |        (secondsLeft = 0)
                    v             |
              +---------+    +----v--------------+
              | CHEATED |    | MEDITATING         |
              +---------+    | secondsLeft = 0    |
                    |        +----+----------+----+
             กด "เริ่มใหม่"      |              |
             (startMeditation    |              |
              auto-complete)     |              |
                    |       กด "ยืนยัน       กด "เริ่มใหม่"
                    v       รับ Reward"      (startMeditation
              +-----------+ (completeMeditation) auto-complete)
              | MEDITATING|      |              |
              +-----------+      v              v
                           +-----------+  +-----------+
                           | COMPLETED |  | MEDITATING|
                           +-----------+  +-----------+
```

---

## Reward Logic (Contract)

### startMeditation()

```
มีสมาธิค้าง (lastMeditationTime > 0)?
├── ใช่ + ครบ 5 นาที → _autoComplete() → เริ่มรอบใหม่
├── ใช่ + ยังไม่ครบ   → revert "Still meditating"
└── ไม่               → เริ่มรอบใหม่
```

### _autoComplete() — เรียกจาก startMeditation

```
บันทึก: clear state + totalSessions++
       ↓
เช็ค eligibility:
├── dailySessions >= 3          → บันทึกเฉยๆ (ครบ 3 ครั้ง/วัน)
├── lastRewardedTime > 0
│   AND gap < 3hr               → บันทึกเฉยๆ (ยังไม่ถึงเวลา)
└── ผ่าน                        → เก็บ reward เป็น pending (native token)
                                  dailySessions++, lastRewardedTime = now
```

### completeMeditation(token) — เรียกจากปุ่ม "ยืนยันรับ Reward"

```
บันทึก: clear state + totalSessions++
       ↓
เช็ค eligibility (เหมือน _autoComplete):
├── ไม่ผ่าน → emit MeditationRecorded (บันทึกแต่ไม่ได้ reward)
└── ผ่าน    → เช็ค fund:
              ├── fund พอ    → จ่าย reward ทันที (MeditationCompleted)
              └── fund ไม่พอ → เก็บ pending (PendingRewardStored)
```

### Eligibility Conditions

| เงื่อนไข | ผล |
|-----------|-----|
| ครั้งแรกตั้งแต่ deploy (lastRewardedTime = 0) | ได้ reward |
| dailySessions < 3 AND gap >= 3 ชม. | ได้ reward |
| dailySessions < 3 AND gap < 3 ชม. | ไม่ได้ reward (บันทึกเฉยๆ) |
| dailySessions >= 3 | ไม่ได้ reward (ครบ 3 ครั้ง/วัน) |
| รอบที่ 3 ของวัน + หลัง 22:00 UTC | Bonus 2x |

### Gap Check

- ใช้ `lastRewardedTime` (เวลาที่ได้ reward ล่าสุด)
- เช็คข้ามวันได้ (ไม่ reset ตอนเปลี่ยนวัน)
- ครั้งแรก (lastRewardedTime = 0) → ข้ามการเช็ค gap

---

## Frontend State Machine

```
Phase             | แสดงอะไร
------------------|-----------------------------------------
IDLE              | ปุ่ม "เริ่มทำสมาธิ" + eligibility status
CONNECTING        | "กำลังเชื่อมต่อ..."
STARTING          | "กำลังเริ่มทำสมาธิ..."
MEDITATING (>0)   | นาฬิกานับถอยหลัง + "อย่าออกจากหน้านี้"
MEDITATING (=0)   | "ยืนยันรับ Reward" + "เริ่มทำสมาธิใหม่"
COMPLETING        | "กำลังยืนยัน..."
COMPLETED         | ข้อความผลลัพธ์ + eligibility + ปุ่มเริ่มใหม่
CHEATED           | "ตรวจพบออกจากหน้าจอ" + ปุ่ม "เริ่มใหม่"
PENDING_COMPLETE  | "มีสมาธิค้าง" + "ยืนยัน" + "เริ่มใหม่"
CLAIMING          | "กำลัง claim..."
DONATING          | "กำลังบริจาค..."
```

### Transitions

```
IDLE ──────── connectWallet ──→ CONNECTING → IDLE
IDLE ──────── handleStart ───→ STARTING → MEDITATING
MEDITATING ── ครบเวลา ───────→ MEDITATING (secondsLeft=0)
MEDITATING ── ออกจากจอ ──────→ CHEATED
MEDITATING ── handleComplete → COMPLETING → COMPLETED
MEDITATING ── handleStart ──→ STARTING → MEDITATING (auto-complete รอบก่อน)
COMPLETED ─── handleStart ──→ STARTING → MEDITATING
CHEATED ───── handleStart ──→ STARTING → MEDITATING (auto-complete รอบก่อน)
PENDING ───── handleComplete → COMPLETING → COMPLETED
PENDING ───── handleStart ──→ STARTING → MEDITATING (auto-complete)
* ──────────── switchNetwork → RESET → IDLE
* ──────────── accountsChanged/chainChanged → RESET → IDLE
```

---

## Resume on Refresh

```
Refresh ระหว่างทำสมาธิ
       ↓
loadStats → contract says isMeditating = true
       ↓
คำนวณ: elapsed = now - lastSessionTime
remaining = 300 - elapsed
       ↓
├── remaining > 0 → resume timer (MEDITATING)
└── remaining = 0 → PENDING_COMPLETE
```

---

## Pending Rewards

| สถานการณ์ | ผล |
|-----------|-----|
| completeMeditation + fund พอ | จ่ายทันที |
| completeMeditation + fund ไม่พอ | เก็บ pending |
| _autoComplete (เริ่มใหม่โดยไม่กดยืนยัน) | เก็บ pending (native token) |
| claimPendingReward | จ่ายจาก fund (ต้องมี fund พอ) |

---

## Other Features

### Anti-cheat
- ออกจากหน้าจอ (tab switch / minimize) → CHEATED → ต้องเริ่มใหม่
- Contract ยังเช็คเวลา 5 นาทีอยู่ (ไม่โกงได้จาก frontend)

### Wallet
- รองรับ MetaMask + Brave Wallet (EIP-1193)
- เปลี่ยน network → disconnect + แสดงปุ่มเชื่อมต่อใหม่
- เปลี่ยน account/chain จากใน wallet → auto-disconnect

### History
- เก็บใน localStorage (`jibjib_history`), สูงสุด 50 รายการ
- แสดง: วันที่, เวลา, network, ผลลัพธ์ (rewarded/pending/บันทึก)
- บันทึกเมื่อ completeMeditation เท่านั้น (ไม่บันทึก auto-complete)

### Donate
- Native token: ส่ง `{ value }` ตรง
- ERC20: เช็ค allowance → approve (ถ้าจำเป็น) → donate
- Reject จำนวน <= 0

### Stats Refresh
- Manual only (ไม่ auto-refresh)
- Refresh เมื่อ: connect, complete, claim, donate
