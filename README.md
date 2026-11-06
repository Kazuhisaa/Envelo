# Envelo

Envelo is the payroll deduction a Filipino freelancer paid by foreign clients doesn't have. When a client payment arrives through Velo checkout, Envelo computes the freelancer's SSS, PhilHealth and Pag-IBIG contributions, sets them aside into three Noir-backed envelopes on Stellar Testnet, and an AI agent remits each one before its deadline. *Your contributions, sealed and delivered.*

**Live website:** https://envelo-swart.vercel.app (API: https://enveloserver-production.up.railway.app/health)
**Demo video (2 min):** _TBD: add link_
**Team:** _TBD: Name (Discord handle), Name (Discord handle)_

> Demo · not affiliated with SSS, PhilHealth or Pag-IBIG. Stellar Testnet only.

## Problem

Filipino freelancers paid by foreign clients have no employer to deduct SSS, PhilHealth and Pag-IBIG from their pay, so they must compute and pay their own contributions every month. Client payments arrive at random times and in random amounts, the money gets spent first, deadlines are missed, and the freelancer loses health coverage, loan eligibility and retirement credits.

## Solution

Envelo is the payroll deduction a freelancer doesn't have. The freelancer sends an invoice as a Velo checkout link. When the client pays, Envelo works out what the freelancer owes for the month by law, seals it into three on-chain **envelopes** (one Noir escrow per agency), and an **AI agent** remits each envelope before its deadline, within a cap the freelancer set once. Even if the AI is wrong, the Noir contract refuses anything over the cap or after the policy expires.

The client needs no account: they only open the checkout link and pay with their Stellar wallet.

## How the agentic payment works

1. **Client payment (Velo).** The freelancer creates an invoice; the server opens a Velo checkout session. The client pays in XLM. Velo confirms it on the ledger and sends a signed webhook, which the server verifies.
2. **Contribution (code, by law).** The server adds the client payment to this month's income and computes the monthly SSS, PhilHealth and Pag-IBIG contribution (floors and caps apply once per month), then sets aside only the difference still owed.
3. **Prioritization (AI).** If the client payment can't cover every set-aside, the agent asks Gemini which envelope to fill first (nearest deadline, cost of a lapse) and explains why in one sentence. The answer is schema-validated; anything invalid falls back to a proportional split.
4. **Set-aside (Noir, owner key).** The server funds each envelope with `fundEscrow` and sets its agent policy with `registerAgent`: **cap = this period's contribution, expiry = this period's deadline**. This is the freelancer's one-time consent.
5. **Remittance decision (AI).** On each tick (daily, or "Fast-forward to deadline" in the demo, which only moves a simulated clock), Gemini decides per envelope: `pay`, `wait` or `ask_user`, and how much, with a reason. In the live demo it paid PhilHealth (deadline in 2 hours) and waited on SSS and Pag-IBIG (deadlines weeks away).
6. **Hard rules (code).** Before any chain call, code blocks a decision that is past the deadline, already remitted this period, or above the computed contribution.
7. **Payment (Noir, agent key).** The agent calls `checkPayment`, then `authorizePayment` signed **with its own key**, to the agency's account. The mock agency collects with `claim`.
8. **Contract refusal.** "Try to break it" forces a bad payment with the hard rules bypassed: over the cap (`over_limit`) or from an expired envelope (`expired`). `authorizePayment` throws `NoirContractError` and no funds move.

**When / whom / how much:** the agent picks when (each envelope against its deadline), whom (the agency account for that envelope) and how much (the decided amount, checked by code and capped by Noir).

## Architecture

```mermaid
flowchart LR
  F[Freelancer<br/>dashboard · Next.js on Vercel] -->|create invoice| S
  C[Client<br/>Stellar wallet] -->|pays XLM| VC[Velo checkout]
  S[Envelo server · Hono on Railway<br/>Postgres · agent loop] -->|checkout.sessions.create<br/>paymentIntents.retrieve| V[(Velo)]
  V -->|signed payment webhook| S
  S -->|prioritize / decide| AI[Gemini<br/>packages/agent]
  S -->|owner key: fundEscrow, registerAgent| N
  S -->|agent key: checkPayment, authorizePayment| N[(Noir contracts<br/>Stellar Testnet)]
  N -->|claim| A[Mock agencies<br/>SSS · PhilHealth · Pag-IBIG]
  VC --- V
```

Three layers of defence on every remittance: **AI** (decides) → **hard rules** (code) → **Noir contract** (enforces cap and expiry). The server holds the owner key, like an employer that withholds; see [ADR-0001](docs/adr/0001-server-holds-owner-key.md). The full flow diagram is [`docs/envelo-flow.excalidraw`](docs/envelo-flow.excalidraw).

## Noir integration

- **SDK:** `@noirx402/agent-sdk` **0.3.0**, default `TESTNET` contracts (no custom contract IDs anywhere in the repo): `device_registry` `CAC4KOLH…FQHU5`, `agent_registry` `CCMZDSPT…J3EBV`, `payment_escrow` `CC7EAW5F…E5BFS`.
- **Client:** `new NoirAgentClient()` in [`apps/server/src/noir.ts:9`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L9).
- **Signers:** `keypairSigner` for the owner (server-held, ADR-0001) and the agent (its own key). The Noir Chrome extension is not used because no browser wallet signs envelope writes.

| Method | Contract | Signed by | Where |
| --- | --- | --- | --- |
| `registerDevice` | device_registry | owner | [`apps/server/scripts/setup-testnet.ts:57`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/scripts/setup-testnet.ts#L57) |
| `registerAgent` (cap + expiry per period) | agent_registry | owner | [`apps/server/src/noir.ts:99`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L99), [`apps/server/scripts/setup-testnet.ts:67`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/scripts/setup-testnet.ts#L67) |
| `revokeAgent` (before re-registering a new cap) | agent_registry | owner | [`apps/server/src/noir.ts:96`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L96) |
| `fundEscrow` (each set-aside) | payment_escrow | owner | [`apps/server/src/noir.ts:81`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L81) |
| `getPolicy`, `getEscrowBalance` | agent_registry, payment_escrow | read | [`apps/server/src/noir.ts:93`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L93), [`apps/server/src/agent.ts:121`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/agent.ts#L121) |
| `checkPayment` | agent_registry + escrow | read | [`apps/server/src/agent.ts:194`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/agent.ts#L194), [`apps/server/src/refusal.ts:44`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/refusal.ts#L44) |
| `authorizePayment` | payment_escrow | **agent** | [`apps/server/src/agent.ts:214`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/agent.ts#L214), [`apps/server/src/refusal.ts:59`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/refusal.ts#L59) |
| `claim` | payment_escrow | mock agency | [`apps/server/src/agent.ts:222`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/agent.ts#L222) |
| `NoirContractError` handling | – | – | [`apps/server/src/agent.ts:233`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/agent.ts#L233), [`apps/server/src/refusal.ts:67`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/refusal.ts#L67) |

Agent decision logic: [`decideRemittance:248`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/packages/agent/src/index.ts#L248), [`applyHardRules:168`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/packages/agent/src/index.ts#L168), [`prioritizeSetAsides:43`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/packages/agent/src/index.ts#L43); the model call is [`geminiJson:7`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/packages/agent/src/gemini.ts#L7).

## Velo integration

- **SDK:** `@carts1024/velo-sdk` **1.0.0**, `environment: 'testnet'`, server-side only ([`apps/server/src/velo.ts:8`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/velo.ts#L8)).
- **Checkout:** each invoice opens a checkout session, `velo.checkout.sessions.create` ([`apps/server/src/velo.ts:82`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/velo.ts#L82)). The freelancer copies the link to the client.
- **Signed webhook:** `Velo.webhooks.verify` over the raw body and `x-velo-signature` ([`apps/server/src/velo.ts:156`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/velo.ts#L156)). This is the trigger for every set-aside. Velo SDK 1.0.0's shape check rejects the dashboard's summary payload after the HMAC passes, so the server then takes the amount from the payment intent instead of trusting the body.
- **Payment status:** `velo.paymentIntents.retrieve` confirms the amount and refreshes invoice status ([`apps/server/src/velo.ts:194`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/velo.ts#L194), [`apps/server/src/velo.ts:116`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/velo.ts#L116)).
- **Gas Station (optional, off in the live demo):** with `USE_GAS_STATION=true`, owner-signed Noir transactions are prepared with `noir.prepare`, signed, and fee-sponsored with `velo.gas.sponsorAndSubmit`, recovering timeouts with `velo.gas.waitForResult` without re-signing ([`apps/server/src/gas.ts:44`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/gas.ts#L44), [`apps/server/src/noir.ts:55`](https://github.com/Kazuhisaa/Envelo/blob/1850950531530532913fcd9059fa8871adbf11ee/apps/server/src/noir.ts#L55)).

## Testnet proof

From the live demo on Nov 7, 2026 (same accounts as the live site):

| Step | Transaction |
| --- | --- |
| Client payment, ₱1,500 invoice: client `GARYXE…` → freelancer, 100 XLM | [`0c5422e0…bb48`](https://stellar.expert/explorer/testnet/tx/0c5422e0fafa1e6ae452b922e4662ae485acbe8fe56cd369521eca9f23acbb48) |
| Set-aside `fundEscrow`, SSS ₱225 | [`976cdc51…95cb`](https://stellar.expert/explorer/testnet/tx/976cdc51e98b714734523e88f8836f751b366e7b36a8c228ec97d0542fd795cb) |
| Set-aside `fundEscrow`, PhilHealth ₱75 | [`45a9394f…ff37`](https://stellar.expert/explorer/testnet/tx/45a9394fd71b172acc2390534852b664c6b60ad4e41481ff3e8b08e11184ff37) |
| Set-aside `fundEscrow`, Pag-IBIG ₱400 | [`16671015…d4e6`](https://stellar.expert/explorer/testnet/tx/166710154aa7c6ea5602d9adae9fcce71999b080c03570bfdc32b2d54277d4e6) |
| **Agent `authorizePayment`**, PhilHealth remittance 38.83 XLM (₱582.50), signed by the agent key | [`9e697693…cc1d`](https://stellar.expert/explorer/testnet/tx/9e6976936a9e6f5be221dafb5ca47a1f4da89ba10728f21fa8303b93bb87cc1d) |
| Mock PhilHealth `claim`, account credited +38.8333333 XLM | [`56d0f0ab…fd36`](https://stellar.expert/explorer/testnet/tx/56d0f0abce5364e09b12a10217eae081dd3c1ab05914328aa79a0935c422fd36) |

**Agent decisions** (Gemini `gemini-3.5-flash`, after "Fast-forward to deadline"): PhilHealth **pay**, "The envelope holds the full contribution and the deadline is within two days." SSS and Pag-IBIG **wait**, "…since the deadline is still far away…"

**Refused by the contract** ("Try to break it", hard rules bypassed on purpose): paying ₱2,735 from SSS against its ₱1,735 cap → `checkPayment: over_limit`, `authorizePayment: NoirContractError AgentNotAuthorized`, no funds moved. A refused call fails in simulation, so it has no transaction hash; it is recorded in the decision log on the dashboard.

**Accounts:** agent [`GCVXITPC…RLNY6`](https://stellar.expert/explorer/testnet/account/GCVXITPC6MOO2VQ7QKNEMIB4IT2YXYSBRUJXVIVZHUIPMVICDDYRLNY6) · envelope owner [`GCB22WNG…BZBSJ7`](https://stellar.expert/explorer/testnet/account/GCB22WNG34MRFT4JFGDP2DI52QG372UV6C7YLNX4LR3Q4MBPYTBZBSJ7) · mock agencies SSS [`GAZEWLJT…GM734`](https://stellar.expert/explorer/testnet/account/GAZEWLJTJZRARH5T4RHKS4IAHZS2FZLY5GICFWG2K26WYY7VWZQGM734), PhilHealth [`GAY3F2DA…BIKWK`](https://stellar.expert/explorer/testnet/account/GAY3F2DAOINXENYNJCJVJZBNOGQTH6TNPCIDLZYYXQNZXXL6Y75BIKWK), Pag-IBIG [`GBMRSQDE…6HERH`](https://stellar.expert/explorer/testnet/account/GBMRSQDEOYQXIULLPUQFX7QPPEVDYWKD5GBH5KCGJQMP4V7NVKP6HERH).

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
| `USE_GAS_STATION` | server | no | Feature flag (`true`/`false`) for Velo Gas Station fee sponsorship. Default `false` |
| `VELO_GAS_API_KEY` | server | for gas | Velo Gas Station Testnet API key (`tg_test_...`) |
| `VELO_GAS_BASE_URL` | server | no | Gas Station endpoint. Default `https://www.velo-build.dev` |
| `GEMINI_API_KEY` | server (agent) | for agent | Gemini API key (free at aistudio.google.com). Unset = fallback rules |
| `GEMINI_MODEL` | server (agent) | no | Default `gemini-3.5-flash` (falls back to `gemini-3.5-flash-lite` when busy) |
| `XLM_PHP_RATE` | server | **yes** | PHP value of 1 XLM, e.g. `15.00` |
| `WEB_URL` | server | no | Velo checkout redirects. Default `http://localhost:3000` |
| `NEXT_PUBLIC_SERVER_URL` | web | no | API base URL. Default `http://localhost:8787` |

## Screenshots

_TBD_

## What's next

- **Real remittance:** connect to an accredited payment channel (the agencies accept payments with a Payment Reference Number through partners such as GCash, Maya or Bayad Center). Today the agencies are mock Testnet accounts.
- **PHP off-ramp:** settle in pesos (e.g. PDAX) once it is available in Velo; USDC instead of XLM in production.
- **Non-custodial mode:** the freelancer's own wallet signs envelope writes instead of the server (ADR-0001).
- **Monthly policy renewal** and an Approve button for `ask_user` decisions.
- **Verified rates and deadlines:** confirm each agency's 2026 self-employed rates and deadlines against official circulars (issue #4); the demo values are labelled samples until then.

## Credits

- [Noir](https://github.com/noirx402/noir) `@noirx402/agent-sdk` and its deployed Testnet contracts; [Velo](https://github.com/Velo-Ecosystem-Collection/Velo) `@carts1024/velo-sdk`.
- [Stellar JS SDK](https://github.com/stellar/js-stellar-sdk), Friendbot and [Stellar Expert](https://stellar.expert).
- Google Gemini API for the agent's decisions.
- Next.js, React, Hono, postgres.js, zod, Vitest.
- Contribution rules from public SSS, PhilHealth and Pag-IBIG guidance (to be verified, see issue #4).
