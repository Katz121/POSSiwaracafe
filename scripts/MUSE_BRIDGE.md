# muse-bridge · AI ของ POS ผ่าน Meta Muse (แทน Gemini)

The app writes jobs to Firestore `artifacts/siwara-pos-v1/public/data/aiJobs/{id}`
(`status: queued`). `scripts/muse-bridge.mjs`, running on the shop PC, claims one job at a time
(transaction `queued → running`), runs `python D:/workFull/scripts/muse_task.py --solo`, and
writes `done` with `result`, or `error`. It writes a heartbeat to `aiRunner/status` every 30 s.
The app treats AI as online when `lastSeen` is less than 90 s old.

## Status (done · 2026-09-24)

App side:
- `src/services/aiQueue.js`: `enqueueAiJob` (addDoc, then `onSnapshot`; after 4 min a transaction sets `queued → error`), `subscribeRunnerStatus`, and `subscribeAiActivity`.
- `src/hooks/useAiRunner.js`: `aiReady` comes from a heartbeat seen within 90 s (clock ticks every 15 s). It also exposes `pending` for the "Muse กำลังคิด…" pill.
- `aiService.callAiSecure` replaces all Gemini code. `callGeminiAPI(prompt, parseAsJson, options)` in `App.jsx` keeps its signature, with a new `options.jobType`.
- `components/AiButton.jsx`: the button is disabled when offline and shows the hint "AI ออฟไลน์ · เปิดคอมที่ร้านเพื่อใช้ AI". Used for: AI แนะนำ, Magic Write, ถาม AI, วิเคราะห์ด้วย AI, แผนการเงิน and โปรโมชั่น. Translate is also disabled when offline.
- `menu/StockSuggestReview.jsx`: a review panel with a reason, a confidence badge, checkboxes and the cost per serving. "ใส่ที่เลือก" adds the ticked lines at the top of the recipe.
- Removed: the Gemini key field, "ทดสอบการเชื่อมต่อ" and "AI เจนรูปเมนู". Settings shows "สถานะ AI (Muse)" instead.
- The worker's `POST /` returns 410. `GEMINI_API_KEY` stays, because the Telegram OCR uses it.

E2E on the emulator passed:
- Offline: buttons disabled with the hint.
- Online: stock suggestions for ชาไทยปั่น took 34–98 s and returned 8 reasoned lines, which were applied at the top of the recipe.
- Consultant: answered in 15–24 s.
- Every job doc ended `done`.

## Run

```bash
# emulator (Firestore 8181 / Auth 9099 · signs in as siwara / emu-test-1234)
node scripts/muse-bridge.mjs --emulator

# production: first put the staff password in scripts/.muse-bridge.env
cp scripts/.muse-bridge.env.example scripts/.muse-bridge.env   # then set STAFF_PASSWORD=
node scripts/muse-bridge.mjs
```

## Autostart (PM2, production only, after the E2E passes)

```bash
cd "D:/code pos/my-pos-app"
pm2 start scripts/muse-bridge.mjs --name pos-muse-bridge --kill-timeout 5000
pm2 save
pm2 logs pos-muse-bridge        # or read .claude/muse-bridge.log
pm2 stop pos-muse-bridge        # the app shows "AI ออฟไลน์" right away (writes online:false)
pm2 delete pos-muse-bridge && pm2 save   # remove it from autostart
```

## Production steps for the owner

1. Deploy the rules: `firebase deploy --only firestore:rules --project siwarapos`.
2. Create `scripts/.muse-bridge.env` with the staff password, then register the process with PM2 as shown above.
3. After the app side is finished: build and deploy the app, and deploy the worker (`cd api-proxy && npx wrangler deploy`).
4. Do **not** delete the `GEMINI_API_KEY` secret while the Telegram OCR still uses it.
5. Remove `VITE_GEMINI_PROXY_URL` from `.env` and `.env.production` once the app no longer reads it.
