# Siwara POS · System Improvement Backlog

วันที่ตรวจ: 2026-08-14  
สถานะ: รอวางแผนและดำเนินการ  
ขอบเขตที่ตรวจ: หน้าลูกค้า `/order` → ตะกร้า → checkout → ออเดอร์ → หน้าพนักงาน → สมาชิก/แต้ม → สต็อก

## เป้าหมาย

ลดความเสี่ยงต่อราคา แต้ม สต็อก และข้อมูลร้าน ก่อนเพิ่มฟีเจอร์ขนาดใหญ่รอบถัดไป พร้อมปรับโครงสร้างตัวเลือกสินค้าให้ดูแลง่ายทั้งหน้าลูกค้าและหน้าพนักงาน

## ลำดับดำเนินการที่แนะนำ

`แยกสิทธิ์ → server-side checkout → stock transaction → automated tests → optionGroups → pagination`

---

## P0 · แยกสิทธิ์ลูกค้ากับพนักงาน

### ปัญหา

ทั้งหน้าพนักงานและหน้าลูกค้าใช้ Firebase Anonymous Auth เหมือนกัน ทำให้ Firestore Rules แยกไม่ได้ว่าใครเป็นพนักงาน ผู้ใช้ anonymous จึงมีสิทธิ์เขียนข้อมูล staff-only หลาย collection

### หลักฐาน

- `src/hooks/useAuth.js:9` · พนักงานใช้ `signInAnonymously`
- `src/customer/CustomerOrderApp.jsx` · ลูกค้าใช้ `signInAnonymously`
- `firestore.rules:62-110` · menu, categories, modifiers, settings, orders และข้อมูลหลังร้านอนุญาตด้วยเงื่อนไข `request.auth != null`
- `src/hooks/usePosData.js` · อ่าน `adminPin` และค่าตั้งค่าภายในจาก `config/settings`

### ผลกระทบ

- ผู้ใช้ที่ตั้งใจโจมตีสามารถแก้ราคา เมนู สมาชิก แต้ม หรือสถานะออเดอร์ได้
- PIN ในหน้าแอปเป็น UI lock ไม่ใช่ security boundary
- ค่าตั้งค่าภายในอาจถูกอ่านจาก client ฝั่งลูกค้า

### แนวทางแก้

1. เปลี่ยน staff login เป็น Firebase Email/Password หรือ Custom Claims
2. เพิ่ม `isStaff()` ใน Firestore Rules
3. จำกัด write ของ menu, settings, members, stock, expenses และ order status ให้ staff เท่านั้น
4. ย้าย secret และ PIN ออกจากเอกสารที่ client ลูกค้าอ่านได้
5. ทดสอบ rules ด้วย Firebase Emulator ก่อน deploy

### Definition of Done

- anonymous customer สร้าง pending order ได้เฉพาะ schema ที่กำหนด
- anonymous customer แก้เมนู ราคา แต้ม สต็อก settings หรือสถานะออเดอร์ไม่ได้
- staff ที่ผ่าน authentication จึงเข้าหน้าจัดการและเขียนข้อมูลหลังร้านได้
- ไม่มี secret หรือ admin credential อยู่ใน public-readable Firestore document

---

## P0 · ทำ QR checkout เป็น operation เดียว

### ปัญหา

checkout หน้า QR ทำงานแยกเป็นจองคิว → สร้างออเดอร์ → เขียนแต้มสมาชิก หากขั้นใดขั้นหนึ่งล้ม ข้อมูลอาจไม่ตรงกัน

### หลักฐาน

- `src/customer/CustomerOrderApp.jsx:1786` · transaction เพิ่ม queue
- `src/customer/CustomerOrderApp.jsx:1826` · `addDoc` สร้าง order แยกภายหลัง
- `src/customer/CustomerOrderApp.jsx:1853-1892` · เขียนสมาชิกหลัง order และกลืน member-write error

### ผลกระทบ

- order สำเร็จแต่แต้มไม่ถูกหัก/เพิ่ม
- ลูกค้าอาจใช้แต้มซ้ำเมื่อเปิดหลายแท็บหรือ retry
- queue อาจถูกใช้ไปแม้ order สร้างไม่สำเร็จ
- retry หลัง partial failure อาจสร้าง order ซ้ำ

### แนวทางแก้

ย้าย checkout ไป Cloud Function หรือ trusted backend แล้วทำ transaction ที่ตรวจราคาจากฐานข้อมูลและเขียน queue, order, redemption และ member ledger พร้อมกัน เพิ่ม idempotency key ต่อการกดสั่งหนึ่งครั้ง

### Definition of Done

- operation สำเร็จทั้งหมดหรือไม่เปลี่ยนข้อมูลเลย
- retry request เดิมไม่สร้าง order หรือหักแต้มซ้ำ
- server คำนวณราคาจากเมนูจริง ไม่เชื่อ subtotal/discount/total จาก client
- มี error code ที่ UI แปลเป็นข้อความให้ลูกค้าเข้าใจได้

---

## P0 · ป้องกันตัดสต็อกซ้ำหลายเครื่อง

### ปัญหา

หน้าพนักงานตรวจ `stockDeducted` จาก state ในเครื่องก่อนสร้าง batch พนักงานสองเครื่องอาจอ่านค่า `false` พร้อมกันและตัดสต็อกซ้ำ

### หลักฐาน

- `src/App.jsx:208-222` · เช็ก `order.stockDeducted` จาก local state แล้วจึง commit batch
- `src/App.jsx:240-252` · คืนสต็อกตอนลบออเดอร์อาศัย local state เช่นกัน

### แนวทางแก้

ใช้ Firestore transaction อ่าน order document ล่าสุดจาก server ตรวจ flag และแก้ stock + order flag ใน transaction เดียว เพิ่ม ledger/audit event สำหรับการตัดและคืนสต็อก

### Definition of Done

- กด completed พร้อมกันสองเครื่องแล้วตัดสต็อกครั้งเดียว
- retry และสลับ completed → pending → completed ไม่ตัดซ้ำ
- ลบ completed order คืนสต็อกครั้งเดียว
- มีประวัติตรวจสอบว่าใคร/เมื่อไร/ออเดอร์ใดทำให้ stock เปลี่ยน

---

## P1 · เพิ่ม automated tests สำหรับเงิน แต้ม และสต็อก

### ปัญหา

`package.json` ยังไม่มี test script และไม่พบ test/spec files ทั้งที่ระบบมี business logic ที่กระทบเงินจริง

### ชุดทดสอบขั้นต่ำ

- subtotal, promotion, points discount, VAT และ rounding
- ใช้แต้ม/คืนแต้ม/idempotent retry
- ตัดและคืนสต็อก
- queue concurrency
- ความหวานต่างกันต้องเป็นคนละ cart item
- ชนิดนมต่างกันต้องเป็นคนละ cart item
- modifier + ความหวาน + นม ต้องคงข้อมูลถึง order document
- checkout ล้มกลางทางต้องไม่เหลือ partial writes

### Definition of Done

- มี `npm test` สำหรับ unit tests
- มี emulator integration tests สำหรับ Firestore Rules และ transaction
- CI บังคับ build + lint + tests ก่อน Cloudflare deploy

---

## P1 · ทำระบบตัวเลือกสินค้าแบบ config-driven

### ปัญหา

ความหวานและชนิดนมถูกเขียน logic ซ้ำใน `CustomerOrderApp.jsx` และ `PosView.jsx` อีกทั้งการแสดงตัวเลือกนมตรวจจากชื่อที่มีคำว่า `ลาเต้`/`Latte`

### หลักฐาน

- `src/config/constants.js:60` · `supportsMilkChoice()` ตรวจจากชื่อเมนู
- `src/customer/CustomerOrderApp.jsx` · modal ตัวเลือกลูกค้า
- `src/components/views/PosView.jsx` · modal ตัวเลือกพนักงานซ้ำอีกชุด

### ผลกระทบ

- เปลี่ยนชื่อเมนูเป็น “มัทฉะนมสด” แล้วตัวเลือกนมหาย
- เพิ่มตัวเลือกใหม่ต้องแก้สองหน้าและเสี่ยง behavior ไม่ตรงกัน
- option combinations และ cart ID ซับซ้อนขึ้นเรื่อย ๆ

### แนวทางแก้

เพิ่ม `optionGroups` ในข้อมูลเมนู เช่น:

```json
[
  { "id": "sweetness", "labelTh": "ระดับความหวาน", "labelEn": "Sweetness", "required": true, "default": "100", "options": ["0", "25", "50", "75", "100"] },
  { "id": "milk", "labelTh": "ชนิดนม", "labelEn": "Milk", "required": true, "default": "cow", "options": ["cow", "oat"] }
]
```

สร้าง shared option renderer และ shared cart-item builder ใช้ทั้งลูกค้าและพนักงาน รองรับราคาเพิ่มและผลต่อ stock recipe ต่อ option

### Definition of Done

- เปิด/ปิด option จากหน้าจัดการเมนูได้โดยไม่แก้โค้ด
- UI ลูกค้าและพนักงาน render จาก schema เดียวกัน
- label ไทย/อังกฤษมาจากข้อมูลเดียวกัน
- cart identity, price และ stock recipe คำนวณจาก utility เดียวกัน

---

## P1 · จำกัดข้อมูล realtime และเพิ่ม pagination

### ปัญหา

หน้าพนักงาน subscribe ทั้ง collection ของ orders, members และ expenses ทุกครั้ง ข้อมูลและค่า Firestore จะเพิ่มขึ้นต่อเนื่อง

### หลักฐาน

- `src/hooks/usePosData.js:90-106` · `onSnapshot(collection(...))` แบบไม่จำกัดช่วงเวลา

### แนวทางแก้

- active order query: เฉพาะ pending/preparing ของวันนี้
- history query: date range + pagination
- members: search/pagination หรือ server-side index
- expenses: query ตามเดือนที่เปิดดู
- เพิ่ม Firestore composite indexes ตาม query จริง

### Definition of Done

- เปิด POS ไม่โหลดประวัติทั้งหมดตั้งแต่วันแรก
- จำนวน reads ตอนเปิดหน้าคงที่แม้ข้อมูลโตขึ้น
- หน้าประวัติยังค้นตามวันที่/สถานะ/สมาชิกได้

---

## P2 · ฟีเจอร์ปฏิบัติการที่ควรพิจารณา

### Audit log

บันทึกการแก้ราคา ยกเลิกบิล ปรับแต้ม ตัด/คืนสต็อก และผู้ดำเนินการ เพื่อแก้ข้อโต้แย้งย้อนหลัง

### Offline/retry UX

แสดงสถานะ pending sync, ป้องกันกดสั่งซ้ำ และมี recovery flow เมื่อ network หลุดหลัง submit

### Backup/restore

กำหนด scheduled export ของ Firestore และขั้นตอน restore ที่ทดสอบแล้ว

### Kitchen workflow

กำหนดสถานะ `pending → accepted → preparing → ready → completed/cancelled` พร้อมเวลาในแต่ละขั้นและเสียงแจ้งเตือนที่ acknowledge ได้

### Reporting

เพิ่มรายงาน void/refund, สินค้าขายดีตามช่วงเวลา, food cost/margin และ discrepancy ระหว่าง stock expected กับ stock count จริง

---

## หมายเหตุจากการตรวจ

- ระบบปัจจุบันใช้งานร้านจริงได้ แต่ security และ transaction เป็นความเสี่ยงก่อนการเพิ่มฟีเจอร์ใหญ่
- แนวทางที่เล็กและดูแลง่ายกว่าในระยะยาวคือทำ generic option system หนึ่งชุด แทน hardcode sweetness/milk เพิ่มทีละฟีเจอร์ในสองหน้า
- ทุก P0 ควรผ่าน Firebase Emulator และ staging test ก่อน production deployment

