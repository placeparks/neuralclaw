# NeuralClaw Runtime Template

Reference for the agent container deployed to Railway per user.

Repo: [`neural-runtime-template`](https://github.com/placeparks/neural-runtime-template)

## Files

- `Dockerfile` - Python 3.12-slim image pinned to `neuralclaw==1.0.1`, copies `start.sh` and `mesh_gateway.py`
- `start.sh` - Generates `config.toml`, writes knowledge and mesh files, and starts the gateway
- `mesh_gateway.py` - `MeshAwareGateway` with HTTP mesh server, channel/runtime glue, and knowledge setup

---

## Environment Variables

### Core (injected by provisioner)

| Variable | Description |
|---|---|
| `NEURALCLAW_AGENT_NAME` | Display name of the agent |
| `NEURALCLAW_PROVIDER` | LLM provider: `openai`, `anthropic`, `openrouter`, `proxy`, `venice`, `local`, `chatgpt_app`, `claude_app`, `chatgpt_token`, `claude_token` |
| `NEURALCLAW_MODEL` | Model ID (for example `gpt-5.4` or `claude-sonnet-4-6`) |
| `OPENAI_API_KEY` | OpenAI key when provider = `openai` |
| `NEURALCLAW_OPENAI_BASE_URL` | Optional OpenAI-compatible base URL override; Venice uses `https://api.venice.ai/api/v1` |
| `ANTHROPIC_API_KEY` | Anthropic key when provider = `anthropic` |
| `OPENROUTER_API_KEY` | OpenRouter key when provider = `openrouter` |
| `CHATGPT_TOKEN` | ChatGPT session cookie or exported credential used by `chatgpt_token` |
| `CLAUDE_SESSION_KEY` | Claude `sessionKey` used by `claude_token` |

### Channels

| Variable | Description |
|---|---|
| `NEURALCLAW_TELEGRAM_TOKEN` | Telegram bot token |
| `NEURALCLAW_DISCORD_TOKEN` | Discord bot token |
| `NEURALCLAW_SLACK_BOT_API_KEY` | Slack bot OAuth token |
| `NEURALCLAW_SLACK_APP_API_KEY` | Slack app-level token |
| `NEURALCLAW_WHATSAPP_API_KEY` | WhatsApp session key |
| `NEURALCLAW_SIGNAL_API_KEY` | Signal phone number |

### Mesh Networking

| Variable | Description |
|---|---|
| `NEURALCLAW_MESH_ENABLED` | `true` / `false` enables A2A delegation |
| `NEURALCLAW_MESH_PEERS_JSON` | JSON array of peer descriptors |
| `NEURALCLAW_MESH_SHARED_SECRET` | Optional shared secret for `/a2a/message` auth |
| `NEURALCLAW_MESH_TIMEOUT_SECONDS` | Delegation timeout in seconds |
| `NEURALCLAW_MESH_PORT` | HTTP port for mesh server; defaults to `PORT` or `8100` |

Peer descriptor shape:

```json
{
  "agentId": "uuid",
  "agentName": "News_agent",
  "permission": "delegate",
  "endpoint": "https://news-agent-production.up.railway.app"
}
```

### Knowledge Base

| Variable | Description |
|---|---|
| `NEURALCLAW_KNOWLEDGE_CONTENT` | Combined text of all knowledge docs |

When set, `start.sh` writes it to `~/.neuralclaw/knowledge.txt`. On startup, `mesh_gateway.py` enables `file_ops` for that directory and appends a note to the agent's persona instructing it to use `read_file` when answering knowledge-related questions.

### Other

| Variable | Description |
|---|---|
| `NEURALCLAW_STARTUP_DELAY` | Seconds to wait before connecting to Telegram. Default `8`. |
| `NEURALCLAW_ENABLE_DASHBOARD` | `true` / `false` enable NeuralClaw web dashboard |
| `NEURALCLAW_LOCAL_URL` | Ollama or compatible local endpoint when provider = `local` |
| `NEURALCLAW_PROXY_BASE_URL` | OpenAI-compatible base URL when provider = `proxy` |

---

## Startup Sequence

1. The image boots with `neuralclaw==1.0.1`.
2. `start.sh` writes `~/.neuralclaw/mesh-peers.json` if `NEURALCLAW_MESH_PEERS_JSON` is set.
3. `start.sh` writes `~/.neuralclaw/knowledge.txt` if `NEURALCLAW_KNOWLEDGE_CONTENT` is set.
4. `start.sh` imports `CHATGPT_TOKEN` and `CLAUDE_SESSION_KEY` into NeuralClaw's token store when provided.
5. `start.sh` generates `~/.neuralclaw/config.toml`.
6. Durable state is stored under `/data/neuralclaw` when a Railway volume is mounted so memory, traces, sessions, and browser profiles survive restarts.
7. `mesh_gateway.py` starts:
   - enables `file_ops` for `~/.neuralclaw/` if the knowledge file exists
   - waits `NEURALCLAW_STARTUP_DELAY` seconds to avoid Telegram 409 races
   - starts `MeshAwareGateway` with the configured channels and mesh HTTP server

---

## HTTP Endpoints

The mesh HTTP server runs on `$PORT` and exposes:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status, mesh_enabled, peers }` |
| POST | `/a2a/message` | Receives delegated tasks from peer agents |

---

## Built-in Runtime Notes

- The runtime template matches the published `neuralclaw==1.0.1` package instead of the older `0.8.0` pin.
- `g4f` is no longer a supported runtime provider in this template.
- The installed extras cover the runtime features used here, including voice, vector memory, Google Workspace, and Microsoft 365 support.
- `file_ops` roots stay empty by default unless a knowledge base file is present, in which case `~/.neuralclaw/` is added automatically.

---

## Applied Behaviors

- Startup delay avoids Telegram 409 conflicts during rolling deploys.
- Knowledge deployments automatically enable `file_ops` for `~/.neuralclaw/knowledge.txt`.
