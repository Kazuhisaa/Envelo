# Envelo

Envelo is the payroll deduction a Filipino freelancer paid by foreign clients doesn't have. When a client payment arrives through Velo checkout, Envelo computes the freelancer's SSS, PhilHealth and Pag-IBIG contributions, sets them aside into three Noir-backed envelopes on Stellar Testnet, and an AI agent remits each one before its deadline. *Your contributions, sealed and delivered.*

**Live website:** _TBD_
**Demo video (2 min):** _TBD_
**Team:** _TBD_

> Demo · not affiliated with SSS, PhilHealth or Pag-IBIG. Stellar Testnet only.

## Problem

_TBD_

## Solution

_TBD_

## How the agentic payment works

_TBD_

## Architecture

_TBD_

## Noir integration

_TBD_

## Velo integration

_TBD_

## Testnet proof

_TBD_

## Repo structure

```
apps/web/         Next.js dashboard (Vercel)
apps/server/      Hono API: Velo webhook, Noir calls, agent loop (Railway)
packages/agent/   Agent decision logic
packages/shared/  Contribution rules, agency config, shared types
docs/             Spec, ADRs, mockups
```

## Run it locally

### Prerequisites

- **Node 22.23.4+**: `nvm install && nvm use` reads `.nvmrc`.
- **pnpm 10** via corepack: `corepack enable pnpm` (the version is pinned in `package.json`).
- **Postgres**, local or hosted. The quickest local option:
  ```bash
  docker run -d --name envelo-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
  ```
- **A Velo account** (velo-build.dev dashboard, Testnet). Only needed for the checkout and webhook flow.
- Internet access to Stellar Testnet (Horizon, Friendbot, Noir contracts).

### Steps

1. **Install dependencies** at the repo root:
   ```bash
   pnpm install
   ```
2. **Create `.env`** at the repo root. The server reads this root file locally.
   ```bash
   cp .env.example .env
   ```
   You need at least these:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
   DEMO_PASSCODE=pick-any-passcode
   XLM_PHP_RATE=15.00
   ```
   Leave the five `*_SECRET` values empty. The next step fills them in.
3. **Build the Testnet world**:
   ```bash
   pnpm setup:testnet
   ```
   The script:
   - creates the owner, agent and three mock agency accounts, Friendbot-funds them, and writes their secrets to `.env`;
   - registers the three envelopes (Noir devices) with their agent policies;
   - registers the expired demo envelope, whose policy lapses two minutes after the first run.

   The first run takes a few minutes. You can run it again safely: it reuses the keys and skips anything already registered. After a Testnet reset, clear the five `*_SECRET` values and run it again.
4. **Start the app**:
   ```bash
   pnpm dev
   ```
   - Web: http://localhost:3000
   - Server: http://localhost:8787. Check it with `curl localhost:8787/health`, which should return `"db": true`.

   Database migrations (`apps/server/migrations/*.sql`) run automatically when the server starts.

### Velo webhook (optional, local)

Velo has to reach `POST /webhooks/velo` from the internet. Expose the server with a tunnel such as `ngrok http 8787` or `cloudflared tunnel --url http://localhost:8787`. Then set `<tunnel-url>/webhooks/velo` as the webhook URL in the Velo dashboard, and copy its signing secret into `VELO_WEBHOOK_SECRET`.

### Writes need the passcode

Every non-GET request except the Velo webhook needs the `x-demo-passcode: <DEMO_PASSCODE>` header. If `DEMO_PASSCODE` is unset, every write is rejected.

### Tests, lint, build

```bash
pnpm test     # unit tests; DB-backed tests are skipped unless TEST_DATABASE_URL is set
TEST_DATABASE_URL=postgres://... pnpm test   # also runs DB tests (they TRUNCATE tables — use a throwaway DB)
pnpm lint     # tsc across every package
pnpm build
```

### Deploy

- **Server → Railway**: `railway.json` runs `pnpm start` and health-checks `/health`. Set the same environment variables as in `.env`, and set `WEB_URL` to the Vercel URL.
- **Web → Vercel**: set the root directory to `apps/web` and `NEXT_PUBLIC_SERVER_URL` to the Railway URL.

## Environment variables

| Variable | Used by | Required | Notes |
| --- | --- | --- | --- |
| `PORT` | server | no | Default `8787` |
| `DATABASE_URL` | server | **yes** | Postgres connection string. The server won't start without it |
| `DEMO_PASSCODE` | server | **yes** | Required in the `x-demo-passcode` header on writes |
| `OWNER_SECRET` | server | **yes** | Freelancer's Stellar key. Signs envelope writes (ADR-0001). Written by `pnpm setup:testnet` |
| `AGENT_SECRET` | server | **yes** | Agent's Stellar key. Written by `pnpm setup:testnet` |
| `SSS_AGENCY_SECRET`, `PHILHEALTH_AGENCY_SECRET`, `PAGIBIG_AGENCY_SECRET` | server | **yes** | Mock agency accounts. Written by `pnpm setup:testnet` |
| `VELO_API_KEY` | server | for checkout | Velo Testnet API key |
| `VELO_WEBHOOK_SECRET` | server | for webhook | Signing secret for `/webhooks/velo` |
| `ANTHROPIC_API_KEY` | server (agent) | for agent | Claude API key |
| `XLM_PHP_RATE` | server | **yes** | PHP value of 1 XLM, e.g. `15.00` |
| `WEB_URL` | server | no | Velo checkout redirects. Default `http://localhost:3000` |
| `NEXT_PUBLIC_SERVER_URL` | web | no | API base URL. Default `http://localhost:8787` |

## Screenshots

_TBD_

## What's next

_TBD_

## Credits

_TBD_
