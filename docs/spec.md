# Envelo MVP spec

Single source of truth for the hackathon build. Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md); the custodial key decision is [ADR-0001](adr/0001-server-holds-owner-key.md); the flow diagram is [`envelo-flow.excalidraw`](envelo-flow.excalidraw) (open at excalidraw.com).

## Deadlines

- Submission: **Sat Nov 7 2026, 12:00 PM**. Top 10 announced 4:00 PM.
- Face-to-face pitch: **Sun Nov 8, 1:00 PM** (5 min pitch + live demo, 3 min Q&A).

## What Envelo is

Envelo is the payroll deduction a Filipino freelancer paid by foreign clients doesn't have. When a **client payment** arrives through Velo checkout, Envelo computes the freelancer's SSS, PhilHealth and Pag-IBIG **contributions**, moves a **set-aside** into three Noir-backed **envelopes** (one per **agency**), and the **agent** **remits** each one before its **deadline**. Tagline: *"Your contributions, sealed and delivered."*

Target user: freelancers (VAs, devs, designers, writers) paid by foreign clients, who already earn in foreign currency, so a stablecoin rail is natural. Not targeted yet: freelancers paid in PHP (double conversion).

## MVP scope

In:
- One freelancer, one period (the current calendar month), three envelopes.
- Full flow: invoice → Velo checkout → verified webhook → contribution computed → set-aside → `fundEscrow` → agent decision → `checkPayment` → `authorizePayment` → mock agency `claim` → receipt.
- Two refusal demos: `over_limit` and `expired`.
- Mobile-first responsive web app, live at a public URL.

Out: multi-user accounts and login, real monthly policy renewal, PHP settlement (PDAX is unavailable in the Velo SDK; mocked), real agency payment channels (mock agency accounts).

Stretch: Velo Gas Station sponsorship of owner-signed transactions.

## Architecture

pnpm monorepo:

| Package | Role | Host |
| --- | --- | --- |
| `apps/web` | Next.js, mobile-first dashboard | Vercel |
| `apps/server` | Node HTTP server: Velo webhook, Noir calls, agent loop, cron | Render or Railway (long-running process) |
| `packages/agent` | Agent decision logic (rules + Gemini) | library |
| `packages/shared` | Contribution rules, agency config, shared types | library |

- App records (client payments, set-asides, decisions, remittances/receipts) live in one hosted Postgres (Neon or Render free tier). Chain state (escrow balances, policies) is always read from Noir, never cached as truth.
- All secrets live in the server `.env` only: owner key, agent key, three agency keys, `VELO_API_KEY`, `VELO_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `AUTH_PASSWORD_SCRYPT`, database URL. Commit `.env.example`, never `.env`.
- Dashboard reads and writes require an opaque server-side login session. Only health checks and the signature-verified Velo webhook are public.
- Node version: `@noirx402/agent-sdk` requires Node 22.23.4+ (or 24.22.1+); `@carts1024/velo-sdk` requires 22.6+. Pin a Node version both hosts support.

## Keys and accounts (Stellar Testnet, funded by Friendbot)

| Account | Signs | Notes |
| --- | --- | --- |
| **Owner** (stands in for the freelancer) | `registerDevice`, `registerAgent`, `fundEscrow`, `defundEscrow` | Held by the server (ADR-0001). Receives client payments. |
| **Agent** | `authorizePayment` | Pays its own fees: the first `authorizePayment` on a card costs ~2.3 XLM, so fund it well. |
| **SSS / PhilHealth / Pag-IBIG mock agencies** | `claim` | One merchant account each. |

## Noir integration (`@noirx402/agent-sdk` 0.3.0)

Rules from the hackathon handbook: every agent payment must go through the deployed Noir Testnet contracts **via this SDK only**. Never deploy your own contracts or call other contract IDs. Contracts were redeployed on 2026-10-24; the IDs on the registration form are retired. Use the IDs built into the SDK (`TESTNET`, the default for `new NoirAgentClient()`):

| Contract | Testnet ID |
| --- | --- |
| device_registry | `CAC4KOLHDLDYDWBOKXNKRN5KVHO56PLOIFXDLTBUWGVN6GVDEB7FQHU5` |
| agent_registry | `CCMZDSPTLX7IIJWCYEUM5DJUHOSOYSTHGK777S2TXZWEMC5ZZGPJ3EBV` |
| payment_escrow | `CC7EAW5FNJEDBS7THM5IT6XIOHO4AOYMLXT3KSZ3HWUIKEACTW7E5BFS` |

Mapping:
- **Envelope = one Noir "card" (device).** `deviceHash` = 64-char hex SHA-256 of `envelo:<freelancerId>:<agency>` (agency ∈ `sss`, `philhealth`, `pagibig`). The expired demo uses a fourth device, `envelo:<freelancerId>:sss:expired-demo`.
- `noir.execute(owner, { kind: 'registerDevice', deviceHash, agent })`, then `{ kind: 'registerAgent', deviceHash, agent, asset, maxAmount, expiresAt }`.
- `asset` / `token` is the native XLM Stellar Asset Contract address on Testnet (`Asset.native().contractId(Networks.TESTNET)` from `@stellar/stellar-sdk`). An escrow is bound to the first token it is funded with.
- `{ kind: 'fundEscrow', deviceHash, token, amount }` is signed by the owner (server).
- `noir.checkPayment({ deviceHash, agent, asset, amount })` returns `{ ok: true }` or `{ ok: false, reason }` with reason ∈ `no_agent | wrong_agent | wrong_asset | invalid_amount | over_limit | expired | insufficient_escrow`. It uses the contract's own predicate, so it never disagrees with `authorize`.
- `noir.authorizePayment({ agent: keypairSigner(AGENT_SECRET), deviceHash, merchant, asset, amount })` returns `{ hash, nonce }`. Refusals throw `NoirContractError`.
- `noir.claim({ merchant: keypairSigner(AGENCY_SECRET), token })`.
- `noir.watch({ types: ['payment.authorized'], onEvent })` can confirm remittances; dedupe on `event.id`.

Gotchas:
- **`maxAmount` is a per-payment cap, not a total.** Two payments each under the cap both pass if the escrow holds enough. The app enforces "one remittance per agency per period" itself, and the pitch says "a single remittance can never exceed the cap", not "the budget can never be exceeded".
- Amounts are **stroops** (`bigint`, 1 XLM = 10,000,000). Use `toStroops` / `fromStroops`, never floats.
- `expiresAt` is one date per policy; renewing each month means a new `registerAgent` (out of MVP scope).
- Never send `revokeDevice` while an escrow holds funds; use `unlinkDevice`.

## Velo integration (`@carts1024/velo-sdk` 1.0.0, server-side only)

Use `1.0.0` (the `latest` tag), not the old `@alpha`. `new Velo({ apiKey, environment: 'testnet' })`.

| Feature | In Envelo |
| --- | --- |
| `velo.checkout.sessions.create({ amount, asset, description, successUrl, cancelUrl })` | Invoice link the freelancer sends a client. Returns `{ checkoutUrl, paymentIntentId }`. Native XLM on Testnet. |
| `velo.paymentIntents.retrieve(id)` | Invoice status on the dashboard (`created`, `pending`, `paid`, `failed`, `expired`, `cancelled`, …). |
| Webhook verification (`Velo.webhooks.verify` / `verifyWebhookSignature`) | A verified `payment.succeeded` is **the trigger** for a set-aside. |
| `velo.gas.sponsorAndSubmit(signedXdr, { idempotencyKey })` | Stretch: sponsor fees for owner-signed transactions (Testnet only). |

- Verify against the **raw, unparsed** request body and the `x-velo-signature` header. Bad signature → respond 400 and do nothing.
- Delivery can repeat: dedupe on the delivery/event ID so a client payment is never counted twice.
- PDAX is unavailable in the SDK (changelog: "PDAX is unavailable"); the USDC → PHP step is a mock in the demo.

## Contribution rules (self-employed, 2026)

Sample values from third-party guides; issue "Verify rates and deadlines" confirms them against official sources. Keep every number in one agency config module so a correction is a one-line change.

Income basis: the PHP value of all client payments **received** in the period (cash basis). PHP value = XLM amount × a configured XLM→PHP rate.

| Agency | Rule | Monthly range |
| --- | --- | --- |
| SSS | 15% of the **MSC** + EC. MSC = `min(35000, max(5000, floor((income + 250) / 500) * 500))`. EC = ₱10 if MSC < ₱15,000, else ₱30. | ₱760 – ₱5,280 |
| PhilHealth | 5% of income, income clamped to ₱10,000 – ₱100,000 | ₱500 – ₱5,000 |
| Pag-IBIG | 4% of income, income capped at ₱10,000 (self-employed pays both shares) | up to ₱400 |

Worked examples (use as unit tests):

| Period income | SSS | PhilHealth | Pag-IBIG |
| --- | --- | --- | --- |
| ₱3,000 | 750 + 10 = **760** | **500** | **120** |
| ₱25,000 | 3,750 + 30 = **3,780** | **1,250** | **400** |
| ₱60,000 | 5,250 + 30 = **5,280** | **3,000** | **400** |

Deadlines (sample, in config, per agency): SSS has conflicting sources (by last digit of the SS number on the 10th/15th/20th of the next month, or the last day of the next month); PhilHealth: last business day of the month; Pag-IBIG: 10th of the next month.

Simplification to admit in the pitch: we use gross client payments; real self-employed members *declare* their income.

## Set-aside rule

On each verified client payment:
1. Add it to the period's income.
2. Recompute each agency's contribution from the new period income.
3. Set-aside per agency = new contribution − what that envelope already holds for this period (never negative).
4. If the client payment covers all three set-asides, fund all three.
5. If it doesn't, the **AI picks the order** (e.g. nearest deadline first) and writes a reason; fallback when the LLM fails: split proportionally to the set-asides.

A freelancer paid once a month gets the whole contribution set aside in one go; one paid in pieces gets it in pieces.

## Agent decisions

Three layers:

| Layer | Decides | Example |
| --- | --- | --- |
| Hard rules (code) | What must always hold | No remittance after the deadline; **one remittance per agency per period**; never remit more than the computed contribution |
| AI (Gemini, `gemini-3.5-flash`) | Gray areas, always with a reason | When to remit (`pay` / `wait` / `ask_user`); which envelope first when money is short |
| Contract (Noir) | Last line of defence | `checkPayment` / `authorizePayment` refuse `over_limit`, `expired`, `insufficient_escrow` even if the AI said pay |

- The LLM returns structured JSON, e.g. `{ "action": "pay" | "wait" | "ask_user", "amount": "<PHP>", "reason": "<one sentence for the freelancer>" }`. Validate it with a schema and the hard rules before any chain call.
- If the LLM call fails or returns invalid output, fall back to a deterministic rule (pay when the envelope is full and the deadline is ≤ 2 days away, otherwise wait) and say so in the reason.
- Every decision is stored and shown to the freelancer with its reason, e.g. "2 days before the deadline and the envelope is full, so I paid it."
- No agent framework; one Gemini API call per decision.

Main loop:

```
on verified velo payment.succeeded(client payment):
    set-asides = compute(period income, envelope balances)   // code
    order = ai.prioritize(set-asides, client payment) if short  // AI, fallback proportional
    fundEscrow per envelope; notify freelancer with the reason

on tick (daily cron, or "Fast-forward to deadline" button with a simulated clock):
    for envelope in envelopes:
        decision = ai.decide(envelope, deadline, balance)       // pay | wait | ask_user
        if decision == pay and hard rules pass:
            check = noir.checkPayment(...)
            if check.ok: noir.authorizePayment(...) → agency claim → receipt
            else: explain check.reason to the freelancer
```

The simulated clock is a server-side "now" override that only the fast-forward route changes, so the same code path runs in the demo and in the cron.

## Demo (5 min)

1. Hook (30s): a freelancer who fell behind on SSS. "Why don't employees fall behind? Because the employer withholds."
2. Client payment (45s): pay the invoice in Velo checkout; show the verified webhook and "Client payment received".
3. Set-aside (45s): the agent computes the split and funds three envelopes; show the `fundEscrow` tx on Stellar Expert.
4. Remittance (60s): fast-forward to the deadline; the agent decides to pay, with a reason; `checkPayment` ok, `authorizePayment`, tx hash.
5. Punchline (45s): make the agent pay over the cap, or pay last month's expired envelope. **The contract refuses** (`over_limit` / `expired`) even though the AI said pay. "Even if the AI is wrong, the money is safe."
6. Close (30s): the vision, and the honest limits (custodial demo, mock agency, XLM not USDC).

The 2-minute submission video is steps 2–5. Keep a backup video for network failure.

## Handbook requirements

1. Agentic payment: the agent decides when, to whom and how much.
2. Noir via the SDK and the deployed contracts only.
3. Velo used for the rest: checkout, payment status, signed webhook as the trigger.
4. Stellar Testnet, Friendbot XLM only.
5. Public GitHub monorepo, root README in the handbook's exact template.
6. Live website at a public URL.

Submission checklist: public repo + README template; 2-minute demo video; short write-up (problem, how the agent works, payment flow through Velo and Noir); live link; team names and Discord handles; at least one Stellar Expert link of an agent transaction; no secrets in code, `.env.example` present, clone-and-run works. Judges check the Noir, Velo and Testnet-proof sections against the code, so links must point to real files and lines.

Judging: Agentic fit 30% · Technical execution 25% · Innovation 20% · Real-world potential 15% · Pitch and demo 10%.

## Honest limits (say these, don't hide them)

- Custodial demo: the server holds the owner key (ADR-0001). Non-custodial mode is roadmap.
- Mock agency accounts; real remittance needs reference numbers and an accredited channel or partnership.
- XLM on Testnet shown as PHP; USDC is the production plan.
- PDAX / PHP settlement is mocked.
- Rates and deadlines are sample values until verified.
- No SSS, PhilHealth or Pag-IBIG logos; label the UI "Demo · not affiliated".
- Velo and Noir are early software: ask in `#noir-sdk-and-extension` and `#velo-integration` on Discord when stuck.
