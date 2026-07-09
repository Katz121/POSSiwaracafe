# รายงานการตรวจและแก้โค้ดเชิงวิศวกรรม — 2026-07-09

ตรวจทั้งระบบด้วย fable-5 (5 review agents) แล้วแก้ด้วย 5 fix agents + งาน atomicity เพิ่มเติม
Push ขึ้น `main` แล้ว 2 commits: `6070573` (review pass) และ `2704adf` (atomicity)
Build ✓ / ESLint ✓ (เหลือ 1 warning เดิม: `MembersView` exhaustive-deps)

---

## 1. บั๊กความถูกต้อง (Correctness) — แก้แล้ว

### เงิน / แต้ม (สำคัญที่สุด)
| ไฟล์ | ปัญหา | การแก้ |
|---|---|---|
| `PosView.jsx` | ปุ่ม "ล้าง" ล้างตะกร้าแต่ไม่ล้าง `editingOrderId` → ขายลูกค้าคนถัดไปทับออเดอร์เก่าที่กำลังแก้ (ข้อมูลเสีย) | เพิ่ม `handleClearCart` รีเซ็ต `editingOrderId`, `reviewDiscount`, `memberPhone`, `memberNickname`, `currentMember`, `usePoints`, `bringOwnGlass` ครบทุกปุ่มล้าง |
| `PosView.jsx` | queue counter ใช้ `Number(queueCounter)+1` → เลขคิวซ้ำเมื่อ POS+QR สั่งพร้อมกัน | `updateDoc(queueRef, { current: increment(1) })` |
| `MembersView.jsx` | เพิ่มสมาชิกเบอร์ที่มีอยู่แล้ว `setDoc` แบบไม่ merge + reset `points:0` → ล้างแต้ม/ประวัติเดิมทิ้ง | เช็คเบอร์ซ้ำก่อน ถ้ามีแล้ว abort + `toast.error("เบอร์นี้มีสมาชิกอยู่แล้ว")` |
| `MembersView.jsx` | แก้เบอร์ (เปลี่ยน doc id) → doc ใหม่ได้แค่ name/phone/points/createdAt, `pendingPoints`+`pointsHistory` หายถาวร | copy `pendingPoints`, `pendingReason`, `pointsHistory` ไป doc ใหม่ก่อนลบ doc เก่า |
| `FinancialView.jsx` | filter เดือนใช้ `String(o.date\|\|createdAt.seconds).substring(0,7)` → ออเดอร์ที่ไม่มี field `date` ถูกตัดทิ้ง รายได้ต่ำกว่าจริง | ใช้ `getOrderDate(o).substring(0,7)` เหมือน view อื่น |
| `CustomerOrderApp.jsx` | `isExisting` เช็ค `member.phone === phone` → doc เก่าที่ id เป็นเบอร์แต่ไม่มี field phone จะถูก re-stamp `createdAt` ทับวันสมัคร | เปลี่ยนเป็น `member.id === phone` |
| `CustomerOrderApp.jsx` | order เขียน `promotionDiscountPercent: 0` ทั้งที่มีโปรโมชั่น | เขียน `combo.applies ? combo.percent : 0` |
| `StockView.jsx` | `handleAdjustStock` ไม่กันค่าติดลบ → ใส่ค่าลบทำให้สต็อก**เพิ่ม** + บันทึกของเสียติดลบ | guard `!Number.isFinite(amount) \|\| amount <= 0` |
| `menuSales.js` | `recomputeAllSoldCounts` นับทุกออเดอร์ แต่ incremental นับเฉพาะ completed → ยอดเพี้ยน | filter `status === 'completed'` ก่อนรวม |
| `publicMenu.js` | เช็คขนาดด้วย `.length` (UTF-16) เทียบ byte budget แต่ไทย 3 byte/ตัว → หลุด limit 1MiB ได้ | วัดจริงด้วย `new TextEncoder().encode(...).length` |

### AI / อื่น ๆ
| ไฟล์ | ปัญหา | การแก้ |
|---|---|---|
| `aiService.js` | cache key = ความยาว+50 ตัวแรก → ชนกันคืนคำตอบผิด | hash prompt เต็ม (djb2) |
| `aiService.js` | proxy fetch ไม่เช็ค `res.ok` → หน้า error HTML ทำ `.json()` พังเปลือง retry | เช็ค `response.ok` โยน error พร้อม status |
| `aiService.js` | parse วันที่ที่ไม่มีทั้ง `date`/`createdAt` → บั๊ก "NaN" bucket | ข้ามออเดอร์ที่หาวันที่ไม่ได้ |
| `FinancialView.jsx` | `aiPlan.allocations`/`amount`/`action_plan` ไม่มี guard → จอขาว | `\|\| {}`, `Number(...\|\|0)`, `\|\| []` |
| `FinancialView.jsx` | default เดือนใช้ UTC → ก่อน 07:00 ของวันที่ 1 เลือกเดือนก่อน | ใช้ `getISODate().substring(0,7)` (timezone ไทย) |
| `App.jsx` | auto-clear error 2 วิ ล้างข้อความ error ใหม่ที่ไม่เกี่ยวด้วย | functional updater ล้างเฉพาะข้อความเดิม |
| `CategorySummaryView.jsx` | CSV ไทยไม่มี BOM → Excel เพี้ยน | เติม UTF-8 BOM |
| `MerchantView.jsx` | `#{queueCounter-1}` โชว์ `#0`/`#-1` ก่อนออเดอร์แรก | `Math.max(queueCounter-1, 0)` |

---

## 2. Atomicity — ทำให้การเขียนเงิน/สต็อกเป็น all-or-nothing (commit `2704adf`)

| ไฟล์ | เดิม | ใหม่ |
|---|---|---|
| `PosView.jsx` | `setDoc(member)` → `updateDoc(redeem)` → `addDoc(order)` → `updateDoc(queue)` แยกกัน; ถ้า order ล้ม แต้มหักไปแล้ว (redeem-leak) | รวมเป็น **`writeBatch` เดียว** + member-write map กันเขียน member doc ซ้ำใน batch |
| `App.jsx` | ตัด/คืนสต็อกแบบ absolute `Math.max(0, qty-used)` → lost-update + ตัด floor 0 แต่คืนเต็ม = สต็อกเฟ้อ | `increment(-used)` / `increment(+used)` (race-safe + สมมาตร) |
| `ExpensesView.jsx` | รายจ่าย→สต็อก เขียน quantity แบบ absolute แข่งกับ POS | `quantity: increment(...)` (unitCost คงเป็น weighted-average) |

> ⚠️ ผลข้างเคียง: สต็อกอาจแสดง**ค่าติดลบ**ได้ถ้าขายเกิน (เอา floor 0 ออกเพื่อความสมมาตร) — เป็นสัญญาณว่าขายเกิน ไม่ใช่บั๊ก

---

## 3. Error handling — toast ไม่โกหก

`runDbAction` เปลี่ยนให้ **return boolean** (สำเร็จ/ล้มเหลว) แล้ว gate toast ตามผลจริง แทนที่จะขึ้น "สำเร็จ" เสมอ (เดิม error ถูกกลืน):
- `MembersView`: `approvePending` / `rejectPending` / `creditGap` / `unlinkOrderFromMember` — สำคัญมากเพราะเดิมเจ้าของเห็น "อนุมัติแต้มแล้ว" ทั้งที่เขียนล้มเหลว
- `ExpensesView`: `syncExpenseToStock` ไม่ขึ้น "อัพเดตสต็อกสำเร็จ" เวลาล้มเหลว
- `AdminView`: seed/reset gate success toast

---

## 4. UI kit (`src/components/ui/`) — แก้เยอะ

- **Tailwind JIT**: `Avatar/Badge/IconButton/Skeleton` ใช้ static `roundedClasses` map แทน `rounded-${x}` (เดิม class หลุด JIT ไม่มีมุมโค้ง)
- **Spinner**: เอา framer-motion หมุนซ้อนกับ `animate-spin` ออก (เดิมหมุน 2 เท่า/กระตุก)
- **Modal**: `useId()` แทน id ตายตัว, save/restore body overflow (modal ซ้อนไม่ปลด scroll ผิด), map `variant="info"`→`primary` ให้ปุ่ม, forward `className` ใน ConfirmModal/InputModal
- **Toast**: `useMemo` context value, `role="status" aria-live="polite"`, fallback `toastConfig[type]\|\|info`, clear timer ตอน unmount
- **Table**: ลบ dead class `w-[${width}]`, `scope="col"`, clamp หน้าเมื่อ data หด (กันแฟลช "ไม่พบข้อมูล")
- **Input/Select**: `aria-invalid`/`aria-describedby`, Textarea border ternary เดียว, `aria-haspopup`/`aria-expanded`, ผูก outside-click listener เฉพาะตอนเปิด
- **Button**: `aria-busy={loading}`
- **Badge CountBadge**: merge `className` แทน replace
- **Tabs**: null-guard context + error ชัดเจน, `layoutId` per-instance ด้วย `useId()` (กัน 2 Tabs cross-animate)
- **forwardRef/displayName**: เติมให้ครบตาม convention

---

## 5. Performance / cleanup

- `DashboardView` `menuPerformance`: สร้าง `Map` index แทน nested `find` ใน loop (เดิม O(orders×items×menu×stock))
- `CustomerOrderApp`: `useMemo` totals/`availableMenu`/`filteredMenu`, per-invocation load cancellation (แทน shared ref ที่ un-cancel กันเอง), guard WelcomePopup ที่ปิดถาวร
- `MenuManageView`: strip `id` + coerce ตัวเลขก่อนเขียน, Magic Write ใช้ state แทน DOM mutation (เดิมทำลาย icon), เอา `via.placeholder.com` ออก (พังตอน offline)
- `MembersView`: รวม stats เป็น `useMemo`
- `ExpensesView`: ลบ dead code + unused imports + cleanup timer
- `sw.js`: แก้ eslint error (unused `err`)
- `constants.js`: `formatCurrency` cap fraction digits ≤ 2 (กัน float residue)
- `usePosData.js`: `adminPin`/`geminiApiKey` รับค่าว่าง (`!= null`) เพื่อให้ล้าง/แก้ได้จริง

---

## 6. ❌ ยังไม่แก้ (ต้องเจ้าของตัดสินใจ / ทดสอบก่อน)

1. **Firestore security** — ทุก client ใช้ Anonymous Auth เหมือนกัน (POS/ลูกค้าแยกไม่ได้ที่ layer rules) ลูกค้าเขียน `total`/ราคา/`config/settings`/`menu`/`members` ได้, `adminPin`+`geminiApiKey` อยู่ใน doc ที่อ่านได้สาธารณะ
   → ต้องย้าย staff ไป **Firebase Email/Password auth** ก่อน (มี `firestore.rules` เขียน upgrade path ไว้แล้ว) หรือทำ **Cloud Function** validate
2. **Customer redeem double-spend** — ส่วนลด bake ลง order ก่อนหักแต้ม; เปิด 2 แท็บ redeem ซ้ำได้ → ต้องรื้อ checkout ให้ order+redeem อยู่ transaction เดียว (**ทดสอบ flow QR จริงก่อน ship**)
3. **`stockDeducted` idempotency** อ่าน local cache → ตัดสต็อกซ้ำข้ามเครื่องได้ (ต้อง transaction บน order doc)
4. **`usePosData`** ยัง subscribe ทั้ง collection (orders/expenses/members) → ควร bound ด้วย date-window query
5. **ย้ายสีเป็น CSS variable** — Admin/MenuManage/Dashboard/Members hardcode `bg-white`/`text-gray-*` (dark mode พังในหน้าพวกนี้)
6. **Modal focus-trap** + split `CustomerOrderApp` (2155 บรรทัด) + `useAuth` surface error แทน spinner ค้าง
