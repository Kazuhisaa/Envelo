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

1. Prerequisites: Node 22.23.4+ (`nvm use` reads `.nvmrc`), corepack (`corepack enable pnpm`), a Postgres database.
2. `pnpm install` at the root.
3. Copy `.env.example` to `.env` and fill it in (at least `DATABASE_URL` and `DEMO_PASSCODE`).
4. `pnpm dev`: web on http://localhost:3000, server on http://localhost:8787.

`pnpm test`, `pnpm lint` and `pnpm build` run across every package.

## Environment variables

See [`.env.example`](.env.example). _Table TBD._

## Screenshots

_TBD_

## What's next

_TBD_

## Credits

_TBD_
