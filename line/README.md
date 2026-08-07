# LINE OA ของร้าน · Siwara Cafe (@639gyrjn)

สถานะ ณ 2026-08-07 · channel id `2007854865` · แพ็กฟรี (ส่งข้อความได้ 300 ครั้ง/เดือน)

## ตอนนี้มีอะไรทำงานอยู่บ้าง

| ส่วน | อยู่ที่ไหน | สถานะ |
|---|---|---|
| ริชเมนู 6 ช่อง | `line/richmenu/` | ขึ้นแล้ว เป็นเมนูหลักของทุกคน |
| แจ้งเตือนออเดอร์เข้าร้าน | `api-proxy/worker.js` → `/notify` | ทำงาน แต่ยัง broadcast (ดูหัวข้อล่าง) |
| Webhook รับข้อความ | `api-proxy/worker.js` → `/webhook` | ขึ้นแล้ว · LINE verify ผ่าน 200 |
| Greeting / auto-reply | LINE OA Manager | ยังไม่ตั้ง (ทำในเว็บ ไม่มี API) |

## ริชเมนู

แก้ดีไซน์ → `python line/richmenu/gen.py` → เรนเดอร์ PNG → `deploy.py`

```
python line/richmenu/gen.py
python D:/workFull/scripts/render_covers_png.py --width 1250 --height 843 line/richmenu/a-wood.html
set LINE_CHANNEL_ID=2007854865
set LINE_CHANNEL_SECRET=...
python line/richmenu/deploy.py line/richmenu/a-wood.png
```

`deploy.py` ลบเมนูเก่าทิ้งให้เอง (LINE จำกัดจำนวนริชเมนูต่อ channel) · ปลายทางแต่ละช่องแก้ที่
`ACTIONS` ใน `deploy.py` · ข้อความบนภาพแก้ที่ `CELLS` ใน `gen.py` **ทั้งสองไฟล์ต้องเรียงตรงกัน**
เพราะพิกัดปุ่มคำนวณจากลำดับ ไม่ได้อ่านจากภาพ

## แจ้งเตือนออเดอร์ไปหาใคร (LINE_TARGET_ID)

`/notify` push ไปที่ `LINE_TARGET_ID` · ของเดิมถ้าไม่ตั้ง target จะ **broadcast หาผู้ติดตามทุกคน**
แปลว่าพอลูกค้าเริ่มแอดเพื่อน ทุกคนจะได้ข้อความ "ออเดอร์ใหม่" ของร้านด้วย และกินโควตา
300/เดือนเร็วมาก (1 ออเดอร์ = 1 ครั้ง × จำนวนผู้ติดตาม)

ตอนนี้ปิดทางนั้นแล้ว: ไม่มี `LINE_TARGET_ID` = ตอบ 503 ไม่ส่งอะไรเลย ถ้าอยาก broadcast จริงๆ
ต้อง set `LINE_ALLOW_BROADCAST=true` ตั้งใจเอง · ฝั่งลูกค้าไม่กระทบ เพราะ `lineNotify.js`
กลืน error อยู่แล้ว ออเดอร์ยังบันทึกปกติ แค่ไม่มีข้อความเด้ง

วิธีตั้ง:
1. เปิดแชทกับ OA (หรือสร้างกลุ่มแล้วเชิญ OA เข้า ถ้าอยากให้เตือนทั้งกลุ่มพนักงาน)
2. พิมพ์ `myid` ส่งไป · บอทจะตอบ userId/groupId กลับมา
3. `cd api-proxy && npx wrangler secret put LINE_TARGET_ID` แล้ววาง id นั้น

หลังตั้งแล้ว `/notify` จะเปลี่ยนเป็น push หา target เดียว ไม่ยุ่งกับลูกค้า

## รายชื่อคนที่แอด OA

LINE ปิด `GET /v2/bot/followers/ids` สำหรับบัญชีที่ยังไม่ verified (ตอบ
`Access to this API is not available for your account`) ดึงรายชื่อย้อนหลังไม่ได้เลย
worker เลยเก็บเองตอน webhook แจ้ง event: `follow` = คนแอดใหม่ · ข้อความทั่วไป = เก็บคนที่แอด
ไว้ก่อนหน้าแล้วเพิ่งทักมา · `unfollow` = คงประวัติไว้แล้วประทับเวลาว่าบล็อกเมื่อไหร่

```
set NOTIFY_SHARED_SECRET=...
python line/followers.py
```

เก็บใน KV `FOLLOWERS` (id `50d240ee...`) · อ่านผ่าน `POST /followers` ต้องแนบ
`Authorization: Bearer <NOTIFY_SHARED_SECRET>` เพราะเป็นชื่อลูกค้า ไม่ใช่ข้อมูลเปิด

**ข้อจำกัดที่แก้ด้วยโค้ดไม่ได้:** คนที่แอดไว้ก่อนวันที่ 2026-08-07 และไม่เคยทักอะไรมาเลย
จะไม่มีทางรู้ชื่อ · ถ้าอยากได้ครบจริงต้องสมัคร verified account (ฟรี ทำใน OA Manager)
แล้วค่อยเรียก `followers/ids` ทีเดียว

## Webhook

`https://pos-gemini-proxy.siwatid-99.workers.dev/webhook` · ตรวจลายเซ็น HMAC-SHA256 ด้วย
channel secret ทุกครั้ง (คำขอที่เซ็นไม่ถูก = 403) · ตอบเฉพาะข้อความว่า `myid` นอกนั้นเงียบ
เพื่อให้ OA ยังเป็นโหมดตอบเองตามปกติ

**ของเดิมชี้ไปที่ n8n** `https://siwatid.app.n8n.cloud/webhook-test/c3fa62a4-...` (เป็น URL
โหมดทดสอบ ทำงานเฉพาะตอนเปิด canvas ค้างไว้) ถ้าต้องการย้ายกลับ:

```
curl -X PUT https://api.line.me/v2/bot/channel/webhook/endpoint \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"endpoint":"https://siwatid.app.n8n.cloud/webhook-test/c3fa62a4-11f8-4ce8-b9e4-f4db2b5aba12"}'
```

LINE ให้ตั้ง webhook ได้ URL เดียวต่อ channel · ถ้าอยากใช้ทั้ง n8n และ worker ต้องให้ตัวหนึ่ง
forward ต่อให้อีกตัว

## ที่ยังไม่ได้ทำ (เรียงตามผลที่ได้)

1. **LIFF บัตรสมาชิก** · ลูกค้ากดช่อง "สะสมแต้ม" แล้วเห็นแต้มตัวเองเลย แทนที่จะพิมพ์ถามแล้วรอตอบ
   (แต้มผูกกับเบอร์ตามกติกาใน `src/config/constants.js` · เบอร์ = ตัวตนสมาชิก)
2. **แจ้งลูกค้าเมื่อเครื่องดื่มเสร็จ** · ต้องรู้ LINE userId ของคนสั่ง แปลว่าหน้า `/order` ต้องเปิด
   ผ่าน LIFF ไม่ใช่เว็บเปล่า แล้ว push ตอนกดเสร็จในหน้าบาริสต้า
3. **Greeting + auto-reply** · ทำใน OA Manager (ไม่มี API) · auto-reply ไม่กินโควตาส่งข้อความ
