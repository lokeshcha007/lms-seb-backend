# Codegnan SEB Validation Service

Node.js service used by the exam app to validate Safe Exam Browser Config Key
and Browser Exam Key evidence and issue a short-lived, exam-bound session token.

## Local run

1. Copy `.env.example` values into your shell environment.
2. Use Node.js 20 or newer.
3. Run `npm start`.
4. Verify `http://127.0.0.1:43126/health`.

## Render deployment

- Service type: Web Service
- Root Directory: `seb-validation-server`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Render supplies the listening port through `PORT`. Do not configure `PORT` or
`SEB_PORT` in Render. Set `SEB_HOST=0.0.0.0` so Render can reach the process.

Required staging environment values are documented in `.env.example`. For the
staging exam app, set:

```env
NODE_ENV=production
SEB_HOST=0.0.0.0
SEB_ALLOWED_ORIGINS=https://exam-staging.codegnan.ai
SEB_CONFIG_KEY=<final-config-key-from-the-approved-seb-file>
SEB_REQUIRE_BROWSER_EXAM_KEY=false
SEB_SESSION_SECRET=<random-secret-with-at-least-32-characters>
SEB_SESSION_TTL_SECONDS=300
SEB_ALLOW_SIMULATION=false
```

Never place `SEB_CONFIG_KEY`, `SEB_BROWSER_EXAM_KEYS`, or
`SEB_SESSION_SECRET` in a `VITE_*` variable. Vite variables are exposed to the
browser.
