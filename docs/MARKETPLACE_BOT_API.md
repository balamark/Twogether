# Marketplace bot API

Server-to-server upload of a role-play script into 創作市集. The bot is not a logged-in browser user. It sends `Authorization: Bearer <key>`. The script is stored as a normal `custom_scripts` row, so it shows up in the marketplace and plays with the same dialogue renderer as one created in the app.

```
POST /api/bot/marketplace/scripts
Authorization: Bearer $MARKETPLACE_BOT_API_KEY
Content-Type: application/json
```

Success is **201** the first time a script is created, and **200** when an existing `sourceKey` is updated or left unchanged. The body always includes the script `id` and its public URL.

## Environment variables

Set these on the **server only**. Do not prefix them with `VITE_` — that would copy the key into the browser bundle.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MARKETPLACE_BOT_API_KEY` | yes, in production | Bearer token. Compared in constant time. Missing or wrong key → **401**. If this variable is unset, every call returns **503** `BOT_API_DISABLED`. |
| `MARKETPLACE_BOT_AUTHOR_ID` | no | `users.id` (UUID) of the account that owns the upload. Wins when it is a UUID. Any other value is ignored. |
| `MARKETPLACE_BOT_AUTHOR_EMAIL` | no | Email of that account. When both author vars are empty, the author is `wangmark510@gmail.com`. |

The author must already be a registered Twogether user in **that** database (production and staging are separate). With no author env var, that user is `wangmark510@gmail.com`. The marketplace shows their nickname. Uploads are personal scripts (`couple_id` is left empty) so they do not land in a couple's private library or ping a partner. Signing into the app as that account shows the scripts under 我的劇本, where they can be edited or deleted. `/admin` is a separate password and does not own these rows.

Generate a key without spaces or `$` so it stays a single App Engine env value:

```bash
openssl rand -hex 32
```

Find the author id:

```sql
SELECT id, email, nickname FROM users WHERE email = 'the-official-account@example.com';
```

### Where to set them

Production and staging run on **Google App Engine**. Deploy (`.github/workflows/deploy.yml`) runs `envsubst` on `app.yaml` / `app.staging.yaml` and reads:

- GitHub **secret** `MARKETPLACE_BOT_API_KEY` (production)
- GitHub **secret** `STAGING_MARKETPLACE_BOT_API_KEY` (staging only; optional — if it is empty, the pull-request deploy mints a key and uploads it as the one-day artifact `staging-marketplace-bot-key`)
- GitHub **secret** `MARKETPLACE_BOT_AUTHOR_ID` (optional)
- GitHub **secret** `MARKETPLACE_BOT_AUTHOR_EMAIL` (optional; empty uses `wangmark510@gmail.com`)

Add a production key in the repo settings, then **redeploy**. App Engine only picks up env vars at deploy time. An empty production key leaves the endpoint disabled (503). Staging does not use the production key.

Locally, put the same names in `.env` (see `env.example`). They are not read by the Vite client.

## What gets stored

There is no separate marketplace table, and no columns for acts, role names, intensity, or a safeword. Those are rendered into the fields the in-app uploader already writes.

| Request field | Stored as |
| --- | --- |
| `title` | `custom_scripts.title` (1–100) |
| `summary` | `custom_scripts.scenario` (the card blurb, 1–500) |
| `genre` | `custom_scripts.category`: `romantic` / `adventurous` / `school` / `bold` (繁中 aliases 浪漫 / 冒險 / 校園 / 大膽). Omitted → chosen from `intensity` (`mild` → romantic, `moderate` → adventurous, `explicit` or `intense` → bold). |
| `intensity` | No rating column. Always adds tags `18+` and `強度:清淡\|中等\|露骨\|激烈`, and a `【尺度】18+・…・雙方合意` line at the top of the script. This endpoint is for adult (18+) scripts, including when intensity is `mild`. |
| `roleA` / `roleB` | Rendered into the top of `content` as `【角色】`. Dialogue uses `[男]` / `[女]` when one role is `male` and the other is `female` (the player swaps those for the couple's nicknames). Any other gender pair uses `[partner1]` / `[partner2]`, which play for every couple. |
| `acts[]` | Rendered into `content` as `第一幕` … with `（旁白：…）` narration and `角色: 對白` lines — the same shape a pasted script uses. 1–8 acts; 4 is the usual script. At least two spoken lines. |
| `safewordNotes` | A `（安全詞：…）` line in `content`. Not a separate column. |
| `tags` | `custom_scripts.tags`, plus the `18+` and intensity tags above. |
| `location` | `custom_scripts.location` (optional, ≤50). |
| `duration` | `custom_scripts.duration`. Omitted → `15-30分鐘`, the in-app default. |
| `coverImageUrl` | `thumbnail_url` and the first `custom_script_photos` row. Stored as the URL; the server does not download it. `http` or `https` only. Send `null` on a re-upload to clear it. Omit the field to leave the current cover. |
| `publish` | `custom_scripts.is_public`. Omitted → `true`, which is also the in-app default, so the script is on the marketplace. `false` saves a draft (not listed, detail URL 404s until you publish). |
| `sourceKey` | `custom_scripts.source_key`. Optional. Same key updates that row (ratings and favorites stay) instead of inserting another. Identical content returns 200 and does not write. Omit it to always create a new script. |

`content` is capped at 50,000 characters, matching the in-app limit.

Bot uploads do **not** count toward the author's free-tier custom-script quota.

## Request

```json
{
  "sourceKey": "2026-11-23-JUR-925",
  "publish": true,
  "title": "後台限定應援",
  "summary": "演唱會結束後的更衣室，粉絲和剛下台的偶像。",
  "genre": "bold",
  "intensity": "explicit",
  "tags": ["偶像", "後台"],
  "location": "後台",
  "duration": "20-30分鐘",
  "coverImageUrl": "https://example.com/covers/backstage.jpg",
  "safewordNotes": "紅燈就停，黃燈放慢。",
  "roleA": { "name": "小安", "description": "興奮的粉絲", "gender": "female" },
  "roleB": { "name": "阿哲", "description": "剛下台的偶像", "gender": "male" },
  "acts": [
    {
      "title": "闖入",
      "narration": "更衣室的燈還亮著。",
      "lines": [
        { "role": "a", "text": "天啊，真的是你。" },
        { "role": "b", "text": "你怎麼進來的？", "direction": "輕笑" }
      ]
    },
    {
      "title": "靠近",
      "narration": "距離縮短了。",
      "lines": [
        { "role": "a", "text": "我想待久一點。" },
        { "role": "b", "text": "那就別動。" }
      ]
    },
    {
      "title": "試探",
      "narration": "兩人都沒有退開。",
      "lines": [
        { "role": "b", "text": "你知道這代表什麼。" },
        { "role": "a", "text": "我知道，我還是想要。" }
      ]
    },
    {
      "title": "留下",
      "narration": "門外的人聲遠了。",
      "lines": [
        { "role": "a", "text": "今晚就到這裡，好嗎？" },
        { "role": "b", "text": "好。安全詞我記得。" }
      ]
    }
  ]
}
```

`role` on a line is `a` or `b` (role A / role B). `gender` is `male` or `female`; anything else is treated as unspecified.

## Response

```json
{
  "success": true,
  "created": true,
  "updated": false,
  "id": "8f1c2c2e-3b4a-4d5e-9f60-112233445566",
  "url": "https://twogether.fun/?market=8f1c2c2e-3b4a-4d5e-9f60-112233445566",
  "published": true,
  "sourceKey": "2026-11-23-JUR-925",
  "author": { "id": "…", "nickname": "Twogether" },
  "message": "劇本已發布到創作市集"
}
```

`url` opens the marketplace detail after the visitor signs in (`?market=<uuid>`). Drafts (`published: false`) use the same URL shape but are not listed until `publish` is true.

Validation failures are **400** `BOT_SCRIPT_INVALID` with `message` (what to fix) and `errors: [{ field, message }]`. A `sourceKey` that already belongs to a different user is **409** `BOT_SOURCE_KEY_OWNED`.

## Example

```bash
curl -sS -X POST https://twogether.fun/api/bot/marketplace/scripts \
  -H "Authorization: Bearer $MARKETPLACE_BOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d @script.json
```

Re-send the same file with the same `sourceKey` to update, or to no-op when nothing changed.

## After merging

Deploy to `main` runs migration **119** (`custom_scripts.source_key`) before the new version goes live, then redeploys App Engine. You still need to:

1. Confirm GitHub secret `MARKETPLACE_BOT_API_KEY` is set. The author defaults to `wangmark510@gmail.com`, who must exist in the production database.
2. Let that deploy finish — or re-run it — so the key is actually on the instance.
3. Send one script and open the returned `url` while logged in as that author. It should open in 創作市集 and read as a normal script.

Staging (pull-request deploys) has its own database and its own key (`STAGING_MARKETPLACE_BOT_API_KEY`, or a key minted for that deploy). `wangmark510@gmail.com` has to exist there too.
