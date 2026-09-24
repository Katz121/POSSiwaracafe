# muse-bridge · AI ของ POS ผ่าน Meta Muse (แทน Gemini)

The app writes jobs to Firestore `artifacts/siwara-pos-v1/public/data/aiJobs/{id}`
(`status: queued`). `scripts/muse-bridge.mjs`, running on the shop PC, claims one job at a time
(transaction `queued → running`), runs `python D:/workFull/scripts/muse_task.py --solo`, and
writes `done` with `result`, or `error`. It writes a heartbeat to `aiRunner/status` every 30 s.
The app treats AI as online when `lastSeen` is less than 90 s old.

## Status (WIP · 2026-09-24)

Done and committed:
- `src/utils/museJobs.js`: queue constants, `extractJson`, `isRunnerFresh`, `redactPII` (phone numbers), `wrapPromptForMuse`, and `effortForJobType`. Tests are in `museJobs.test.js`.
- `src/utils/stockSuggest.js`: the reasoned stock-suggestion prompt (standard recipe, unit conversion, a reason for each line, confidence, missing items, packaging presets and related shop recipes), `normalizeStockSuggestions`, `applyStockSuggestions` (new rows go at the top; in whole-cake mode `perWhole = usage × pieces`), and `selectedSuggestionCost`. Tests are in `stockSuggest.test.js`.
- `scripts/muse-bridge.mjs` (`--emulator`, `--once`): heartbeat, claim transaction, stale-`running` recovery, expiry of queued jobs older than 4 min, pruning of jobs older than 14 days, a 5 min hard kill (taskkill /T), Muse `--timeout 225`, JSON extraction (nested arrays are stored as a JSON string with `resultFormat: 'json-string'`), and a log at `.claude/muse-bridge.log`.
- `firestore.rules`: `aiJobs` and `aiRunner` are staff-only, and job creation is validated. **Not deployed.**
- `scripts/.muse-bridge.env.example`. `scripts/.muse-bridge.env` is gitignored.

Verified: Muse health check works through `muse_task.py --solo --effort low` in about 32 s. The unit tests pass (24).

## Remaining steps (not done yet)

1. **App service** `src/services/aiQueue.js`:
   - `enqueueAiJob({type, prompt, onStatus})`: `addDoc` with `{type, prompt, status:'queued', createdAt: serverTimestamp(), createdBy: auth.currentUser.email}`, then resolve through `onSnapshot` on the job doc.
   - Timeout is 4 min. On timeout, run a transaction that sets `queued → error`.
   - If `resultFormat === 'json-string'`, parse the result with `extractJson`.
   - `subscribeRunnerStatus(cb)` on `aiRunner/status`.
2. **aiService.js**:
   - Rename `callGeminiAPISecure(apiKey, …)` to `callAiSecure(prompt, opts)`. Keep the cache, rate limit and chat history. Drop the retries.
   - Delete the direct Gemini fetch, the `VITE_GEMINI_PROXY_URL` branch, `generateMenuImage` and `createGeminiCaller`.
   - Add a pending-job activity emitter for a global pill that shows `AI_THINKING_TEXT`.
3. **App.jsx**:
   - Delete `activeApiKey`.
   - Subscribe to runner status only when a staff user is signed in. Tick every 15 s.
   - Set `aiReady = isRunnerFresh(status)` and expose `aiStatus` in the config context.
   - `callGeminiAPI(prompt, parseAsJson, options)` keeps its signature. It returns `{success:false, offline:true, error: AI_OFFLINE_HINT}` straight away when offline. `options.jobType` passes `'stockSuggest'`.
4. **AiButton** (`src/components/AiButton.jsx`): wraps `<Button variant="ai">`, disables itself when `!aiReady`, and shows `AI_OFFLINE_HINT` underneath. Use it for these buttons:
   - MenuEditorSheet: AI แนะนำ, Magic Write
   - PromotionSheet: เริ่มคิดโปรโมชั่น
   - DashboardView: ถาม AI (also disable the consultant sheet's send button)
   - ExpensesView: วิเคราะห์ด้วย AI
   - FinancialView: generatePlan
   - the menu tools translate action
5. **MenuEditorSheet**:
   - Remove `generateImage` and the "AI เจนรูปเมนู" button, and the `geminiApiKey` prop (also in MenuManageView and useMenuTools).
   - Rewrite `suggestStock` with `buildStockSuggestPrompt` (+ `relatedRecipes(newItem, menu, stockById)`, `packagingPresets`, `perPiece = wholeMode`), `callGeminiAPI(prompt, true, {useCache:false, jobType:'stockSuggest'})` and then `normalizeStockSuggestions`.
   - Show a new `StockSuggestReview` panel inline in the stock section. It shows:
     - the recipe summary
     - one row per line: checkbox, stock name, usage and unit, ingredient, reason, confidence badge, cost. Already-linked lines are marked "มีแล้ว" and disabled.
     - missing items and notes
     - the selected cost per serving
     - the "ใส่ที่เลือก" button, which calls `applyStockSuggestions`
   - While waiting, show `AI_THINKING_TEXT`. Nothing is applied without the owner clicking.
6. **Prompts**: in DashboardView's consultant, replace "ใช้ Emoji ประกอบ" with concise, data-grounded answers that say when the data is insufficient. Update the Gemini wording in useMenuTools' toasts.
7. **Settings**:
   - Remove the `geminiApiKey` input, `handleTestAI` and `onTestAI` from ShopTab and AdminView, and remove `geminiApiKey` from `TAB_FIELDS.shop`, `draftFromConfig` and `buildSettingsPayload`. Update `settings.test.js`.
   - Show a "สถานะ AI (Muse)" line with online or offline and the last-seen time.
   - Keep `SENSITIVE_SETTINGS_KEYS` stripping, and do not delete the Firestore field.
   - In `usePosData`, stop reading `VITE_GEMINI_API_KEY`.
8. **Worker** `api-proxy/worker.js`:
   - Make the final `POST /` Gemini block return `410 {error:'AI ย้ายไปใช้ Muse แล้ว'}` and remove `AI_MODELS`.
   - **Keep `GEMINI_API_KEY`**, because `api-proxy/src/telegram/ocr.js` (Telegram expense OCR) still uses it.
   - Run `npx vitest run api-proxy`.
9. **Verify**:
   1. Run `npx vitest run`, `npx eslint src` and `npm run build`.
   2. Run the E2E on the emulator with `node scripts/muse-bridge.mjs --emulator`:
      - With the bridge offline, check the disabled button and hint.
      - With it online, open `#/menu?focus=vVS8s1Pwc7nD2bpvw9FB` (ชาไทยปั่น), click "AI แนะนำ", check the review panel, click apply, and confirm the new links are at the top.
      - Ask the consultant a question.
      - Confirm every job doc ends `done`.

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
