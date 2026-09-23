# Codegnan SEB Validation Service

Node.js service used by the exam app to validate Safe Exam Browser Config Key
and Browser Exam Key evidence and issue a short-lived, exam-bound session token.

The service supports both the SEB JavaScript API and a Windows HTTP-header
bootstrap fallback. The fallback is used when SEB does not inject its
`SafeExamBrowser` JavaScript object. It validates the Config Key header on a
top-level navigation and redirects back to the approved exam origin with a
short-lived token in the URL fragment.

## Local run

1. Copy `.env.example` to `.env` and replace its placeholder values.
2. Use Node.js 20.12 or newer. `npm start` loads the local `.env` file
   automatically when it exists.
3. Run `npm start`.
4. Verify `http://127.0.0.1:43126/health`.

## Render deployment

- Service type: Web Service
- Root Directory: leave blank when deploying this standalone repository
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

If Windows and macOS use different `.seb` files, configure both approved keys
as a comma-separated allow-list instead:

```text
SEB_CONFIG_KEYS=<windows-config-key>,<macos-config-key>
```

`SEB_CONFIG_KEYS` takes precedence over the single `SEB_CONFIG_KEY` value.

Never place `SEB_CONFIG_KEY`, `SEB_BROWSER_EXAM_KEYS`, or
`SEB_SESSION_SECRET` in a `VITE_*` variable. Vite variables are exposed to the
browser.

For the Windows header fallback, enable **Use Browser Exam Key and
Configuration Key** in the approved `.seb` file. Save the final configuration
before copying its Config Key into `SEB_CONFIG_KEY`.
