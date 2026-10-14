# Google Sheets progress sync

## Files
- `Code.gs`: Google Apps Script API; validates signed Telegram Mini App `initData` and stores progress by Telegram ID.
- `engine/progress-sync.js`: optional client integration; localStorage remains a fallback and existing local progress is migrated on first cloud load.
- The client uses JSONP to read Apps Script ContentService responses cross-origin from GitHub Pages.

## Setup
1. Create a Google Sheet.
2. Open **Extensions → Apps Script** and paste `Code.gs` into the editor.
3. In Apps Script **Project Settings → Script Properties**, add `BOT_TOKEN` (secret bot token) and `SPREADSHEET_ID` (the ID from the spreadsheet URL between `/d/` and `/edit`).
4. **Deploy → New deployment → Web app**. Execute as **Me**; access **Anyone**. Deploy and copy the URL ending in `/exec`.
5. Put that URL into `API_URL` in `engine/progress-sync.js`. Never put the bot token in GitHub Pages.
6. Ensure the Mini App is launched from Telegram and its URL is configured in BotFather.

## Test
- Open the Mini App in Telegram and complete episode 1; a `Progress` sheet should be created with a row for your Telegram ID.
- Reopen on the same device and another device using the same Telegram account.
- Episode 2 should not be recorded as completed unless episode 1 is completed.

The prototype currently allows episodes 1 and 2; update `ALLOWED_EPISODES` as new episodes are added. Google quotas apply. The client cannot prove that every slide was read; this is progress sync, not anti-cheat protection.
