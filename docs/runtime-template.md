# NeuralClaw Runtime Template

Reference for the agent container deployed to Railway per user.

Repo: [`neural-runtime-template`](https://github.com/placeparks/neural-runtime-template)

## Files

- `Dockerfile` — Python 3.12-slim, copies `start.sh` and `mesh_gateway.py`
- `start.sh` — Installs neuralclaw, generates `config.toml`, writes knowledge file, runs gateway
- `mesh_gateway.py` — `MeshAwareGateway` with HTTP mesh server, hotfixes, and knowledge setup

---

## Environment Variables

### Core (injected by provisioner)

| Variable | Description |
|---|---|
| `NEURALCLAW_AGENT_NAME` | Display name of the agent |
| `NEURALCLAW_PROVIDER` | LLM provider: `openai`, `anthropic`, `openrouter`, `venice`, `local`, `g4f`, `chatgpt_token`, `claude_token` |
| `NEURALCLAW_MODEL` | Model ID (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `OPENAI_API_KEY` | OpenAI key (if provider = openai) |
| `NEURALCLAW_OPENAI_BASE_URL` | Optional OpenAI-compatible base URL override; Venice uses `https://api.venice.ai/api/v1` |
| `ANTHROPIC_API_KEY` | Anthropic key (if provider = anthropic) |
| `OPENROUTER_API_KEY` | OpenRouter key (if provider = openrouter) |
| `CHATGPT_TOKEN` | ChatGPT session cookie used by `chatgpt_token` |
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
| `NEURALCLAW_MESH_ENABLED` | `true` / `false` — enables A2A delegation |
| `NEURALCLAW_MESH_PEERS_JSON` | JSON array of peer descriptors (auto-synced by SaaS) |
| `NEURALCLAW_MESH_SHARED_SECRET` | Optional shared secret for `/a2a/message` auth |
| `NEURALCLAW_MESH_TIMEOUT_SECONDS` | Delegation timeout in seconds (default: 45) |
| `NEURALCLAW_MESH_PORT` | HTTP port for mesh server (default: `PORT` env, fallback 8100) |

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
| `NEURALCLAW_KNOWLEDGE_CONTENT` | Combined text of all knowledge docs (auto-synced by SaaS) |

When set, `start.sh` writes it to `~/.neuralclaw/knowledge.txt`. On startup, `mesh_gateway.py` enables `file_ops` for that directory and appends a note to the agent's persona instructing it to use `read_file` when answering knowledge-related questions.

### Custom User Variables

Any key-value pairs saved via the dashboard **⚙ Env Vars** panel are pushed directly to the Railway service. The agent can read them with `os.getenv("KEY")`.

Common examples:
- `NEWSAPI_KEY` — for news search skills
- `NOTION_TOKEN` — for Notion integration
- `CUSTOM_SYSTEM_PROMPT` — override default persona

### Other

| Variable | Description |
|---|---|
| `NEURALCLAW_STARTUP_DELAY` | Seconds to wait before connecting to Telegram (default: 8). Prevents 409 Conflict during Railway rolling deploys. Set to `0` to skip. |
| `NEURALCLAW_ENABLE_DASHBOARD` | `true` / `false` — enable NeuralClaw web dashboard (default: false) |
| `NEURALCLAW_LOCAL_URL` | Ollama base URL if using local provider |

---

## Startup Sequence

1. `start.sh` runs with `neuralclaw==0.8.0`
2. Writes `~/.neuralclaw/mesh-peers.json` if `NEURALCLAW_MESH_PEERS_JSON` is set
3. Writes `~/.neuralclaw/knowledge.txt` if `NEURALCLAW_KNOWLEDGE_CONTENT` is set
4. Imports `CHATGPT_TOKEN` / `CLAUDE_SESSION_KEY` into NeuralClaw's token store when provided
5. Generates `~/.neuralclaw/config.toml` with all settings
6. Stores durable state under `/data/neuralclaw` when a Railway volume is mounted so memory, traces, sessions, and browser profiles survive restarts
7. `mesh_gateway.py` starts:
   - Enables `file_ops` for `~/.neuralclaw/` if knowledge file exists
   - Waits `NEURALCLAW_STARTUP_DELAY` seconds (Telegram 409 prevention)
   - Loads config, injects knowledge hint into persona if applicable
   - Starts `MeshAwareGateway` (all configured channels + mesh HTTP server)

---

## HTTP Endpoints

The mesh HTTP server runs on `$PORT` (Railway sets this) and exposes:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status, mesh_enabled, peers }` |
| POST | `/a2a/message` | Receives delegated tasks from peer agents |

### `/a2a/message` request body

```json
{
  "from": "Joker",
  "to": "News_agent",
  "type": "task",
  "content": "find latest news on AI",
  "payload": { "source": "mesh" }
}
```

### `/a2a/message` response

```json
{
  "content": "Here are the latest AI news stories...",
  "payload": { "source": "mesh" }
}
```

---

## Mesh Delegation

Agents receive delegation commands via Telegram/Discord in the form:

```
ask <AgentName> to <task>
delegate <AgentName> to <task>
```

The regex is:
```
^\s*(?:ask|delegate(?:\s+to)?)\s+(.+?)\s+to\s+(.+?)\s*$
```

If the target agent is in the peer list and not blocked, `MeshAwareGateway` POSTs to `{endpoint}/a2a/message` and returns the response. If delegation fails, the error reason is returned to the user directly (the local LLM does not attempt to answer).

---

## Built-in Skills

| Skill | Tools | Description |
|---|---|---|
| `web_search` | `web_search`, `fetch_url` | DuckDuckGo instant answers + URL fetch (SSRF-protected) |
| `calendar` | `create_event`, `list_events`, `delete_event` | SQLite-backed local calendar |
| `code_exec` | `execute_python` | Sandboxed Python execution, 30s timeout |
| `file_ops` | `read_file`, `write_file`, `list_directory` | Filesystem access within allowed roots |

`neuralclaw==0.8.0` also adds optional runtime-integrated skills and cortices such as vector memory, identity memory, structured reasoning, browser automation, TTS, Google Workspace, and Microsoft 365. The runtime template installs the package with the new integration extras so those features are available when enabled in config/env.

`file_ops` roots are empty by default (all access denied) unless a knowledge base file exists, in which case `~/.neuralclaw/` is added automatically.

---

## Applied Hotfixes

These are runtime compatibility behaviors carried by `mesh_gateway.py`:

The old `ToolCall.to_dict()` OpenAI patch is no longer required in `neuralclaw==0.8.0`; the package now handles JSON-string tool arguments upstream.

### 1. `ToolCall.to_dict` — OpenAI multi-turn tool use
OpenAI requires `function.arguments` to be a JSON **string**, not a Python dict.
The installed `neuralclaw` package's `ToolCall.to_dict()` returns a raw dict.
Fix: monkey-patch at startup.

```python
from neuralclaw.providers.router import ToolCall as _ToolCall
def _patched_to_dict(self):
    return {"id": self.id, "type": "function",
            "function": {"name": self.name, "arguments": json.dumps(self.arguments)}}
_ToolCall.to_dict = _patched_to_dict
```

### 2. Startup delay — Telegram 409 Conflict
Railway rolling deploys start a new container before the old one stops.
Both instances poll Telegram simultaneously → 409 Conflict → crash.
Fix: `asyncio.sleep(NEURALCLAW_STARTUP_DELAY)` before connecting (default 8s).
