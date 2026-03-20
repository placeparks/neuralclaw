# NeuralClaw SaaS Platform

One-click deployment platform for [NeuralClaw](https://github.com/placeparks/neuralclaw) AI agents. Users onboard, configure channels, and get a dedicated Railway-hosted agent — no infra required.

## Architecture

```
Next.js (Vercel/Railway)  ←→  Supabase (Postgres)
        ↓
Railway GraphQL API  →  per-user agent service (neural-runtime-template)
```

Each deployed agent runs `mesh_gateway.py` on Railway, which:
- Uses the `neural-runtime-template` image pinned to `neuralclaw==1.1.6`
- Generates `~/.neuralclaw/config.toml` from env vars
- Starts `MeshAwareGateway` with the channels enabled for that agent
- Exposes `/health` and `/a2a/message` HTTP endpoints

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Required Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `RAILWAY_API_TOKEN` | Railway API token for provisioning |
| `RAILWAY_PROJECT_ID` | Railway project to deploy agent services into |
| `RAILWAY_ENVIRONMENT_ID` | Railway environment (e.g. production) |
| `RAILWAY_RUNTIME_TEMPLATE_REPO` | GitHub repo of the runtime template |
| `RAILWAY_RUNTIME_TEMPLATE_BRANCH` | Branch to deploy from (default: `main`) |
| `PROVISIONER_SECRET` | Shared secret for the `/api/provision/run` cron endpoint |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for encrypting channel tokens at rest |

## Supabase Setup

Run `supabase/schema.sql` in the Supabase SQL editor, then run the following migration to enable env vars and knowledge base:

```sql
-- Per-agent custom environment variables
ALTER TABLE agents ADD COLUMN IF NOT EXISTS custom_env JSONB DEFAULT '{}'::jsonb;

-- Per-agent knowledge base documents
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id);
```

## Provisioning Flow

1. User completes `/onboard` form (plan, provider, model, channels)
2. Record inserted into `agents` table with `status = pending`
3. Railway Cron hits `POST /api/provision/run` every minute
4. Provisioner creates a Railway service from the runtime template repo
5. Env vars injected (API keys, channel tokens, mesh config, knowledge)
6. Railway triggers deploy → status becomes `active`

```bash
POST /api/provision/run
Headers: x-provisioner-secret: <PROVISIONER_SECRET>
Body: { "limit": 3 }
```

## API Routes

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | List agents for a user |

### Agent Management
| Method | Path | Description |
|---|---|---|
| DELETE | `/api/agents/[id]` | Delete agent + Railway service |
| POST | `/api/agents/[id]/pause` | Mark agent paused |
| POST | `/api/agents/[id]/resume` | Resume agent (triggers Railway redeploy) |
| GET | `/api/agents/[id]/health` | Proxy to agent `/health` + event count |

### Environment Variables
| Method | Path | Description |
|---|---|---|
| GET | `/api/agents/[id]/env` | List custom env vars (values masked) |
| POST | `/api/agents/[id]/env` | Upsert a variable → pushed to Railway |
| DELETE | `/api/agents/[id]/env` | Remove a variable → cleared on Railway |

Body for POST/DELETE: `{ email, key, value? }`

### Knowledge Base
| Method | Path | Description |
|---|---|---|
| GET | `/api/agents/[id]/knowledge` | List knowledge documents |
| POST | `/api/agents/[id]/knowledge` | Add a document (title + content) |
| DELETE | `/api/agents/[id]/knowledge` | Remove a document by `docId` |

After any knowledge change, `NEURALCLAW_KNOWLEDGE_CONTENT` is rebuilt and pushed to Railway. The agent writes it to `~/.neuralclaw/knowledge.txt` on next boot and uses `read_file` to answer questions from it.

### Mesh Networking
| Method | Path | Description |
|---|---|---|
| GET | `/api/mesh/config` | Get mesh enabled status |
| POST | `/api/mesh/config` | Toggle mesh on/off (triggers env sync + redeploy) |
| GET | `/api/mesh/links` | List mesh delegation links |
| POST | `/api/mesh/links` | Create a mesh link (source → target, permission) |
| DELETE | `/api/mesh/links` | Remove a mesh link |

Creating or removing a link calls `syncMeshEnvForUser`, which rebuilds `NEURALCLAW_MESH_PEERS_JSON` for all affected agents and triggers Railway redeployments.

## Agent Status Model

| Status | Meaning |
|---|---|
| `pending` | Queued for provisioning |
| `provisioning` | Railway service being created |
| `active` | Deployed and healthy |
| `failed` | Provisioning error (see `error_message`) |
| `paused` | Manually paused, Railway service still exists |

## Runtime Template

See [`docs/runtime-template.md`](docs/runtime-template.md) for the full reference on the agent container.

The runtime template repo is [`neural-runtime-template`](https://github.com/placeparks/neural-runtime-template).

## Known Fixes Applied in Runtime Template

| Fix | File | Description |
|---|---|---|
| Telegram 409 Conflict | `mesh_gateway.py` | 8s startup delay (`NEURALCLAW_STARTUP_DELAY`) prevents Railway rolling-deploy race condition |
| Knowledge base file_ops | `mesh_gateway.py` | `set_allowed_roots` configured so agent can read `~/.neuralclaw/knowledge.txt` |
