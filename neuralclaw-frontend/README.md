# NeuralClaw Frontend

Frontend + provisioner for one-click NeuralClaw bot deployments.

## What This App Does

- User onboarding UI (plan, channels, tokens, provider)
- Stores encrypted deployment requests in Supabase
- Provisioner endpoint creates a dedicated Railway service per user
- Injects per-user environment variables and triggers deploy

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env.local
```

3. Run development server:

```bash
npm run dev
```

## Supabase Setup

Run `supabase/schema.sql` in your Supabase SQL editor.

## Railway Setup

1. Deploy this frontend on Railway.
2. Fill env vars in `.env.example`.
3. Set `RAILWAY_RUNTIME_TEMPLATE_REPO` to a small runtime template repo.

## Recommended Runtime Template Repo (pip install flow)

Your runtime template repo should be minimal and deployable by Railway.
Each user service is created from this template.

Example behavior in that template service:

1. Install package:

```bash
pip install "neuralclaw[all-channels]"
```

2. Generate `~/.neuralclaw/config.toml` from env vars (non-interactive).
3. Run:

```bash
python -m neuralclaw.cli gateway
```

Notes:
- Do not rely on `neuralclaw init` in cloud automation because it is interactive.
- Use env vars for keys/tokens (`OPENAI_API_KEY`, `NEURALCLAW_TELEGRAM_TOKEN`, etc.).

## Triggering Provisioning

Call:

```bash
POST /api/provision/run
Headers: x-provisioner-secret: <PROVISIONER_SECRET>
Body: { "limit": 3 }
```

Use Railway Cron (or external scheduler) to hit this endpoint every minute.

## Current Status Model

- `pending`: request queued
- `provisioning`: picked by worker
- `active`: Railway service created + deploy triggered
- `failed`: provisioning error, see `error_message`
