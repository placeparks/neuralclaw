# NeuralClaw Runtime Template (Railway)

Create a small repo for Railway to clone for each user deployment.

## Files to include

- `Dockerfile`
- `start.sh`

## Dockerfile

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
```

## start.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.neuralclaw"

# Install NeuralClaw package at runtime
pip install --no-cache-dir "neuralclaw[all-channels]"

cat > "$HOME/.neuralclaw/config.toml" <<EOF
[general]
name = "${NEURALCLAW_AGENT_NAME:-NeuralClaw}"
persona = "You are NeuralClaw, a helpful and intelligent AI assistant."
log_level = "INFO"
telemetry_stdout = true

[providers]
primary = "${NEURALCLAW_PROVIDER:-openai}"
fallback = ["local"]

[providers.openai]
model = "${NEURALCLAW_MODEL:-gpt-4o}"
base_url = "https://api.openai.com/v1"

[providers.anthropic]
model = "${NEURALCLAW_MODEL:-claude-sonnet-4-20250514}"
base_url = "https://api.anthropic.com"

[providers.openrouter]
model = "${NEURALCLAW_MODEL:-anthropic/claude-sonnet-4-20250514}"
base_url = "https://openrouter.ai/api/v1"

[providers.local]
model = "${NEURALCLAW_MODEL:-llama3}"
base_url = "http://localhost:11434/v1"

[channels.telegram]
enabled = true

[channels.discord]
enabled = true
EOF

exec python -m neuralclaw.cli gateway
```

## Required env vars per service

- `NEURALCLAW_PROVIDER`
- `NEURALCLAW_MODEL`
- Provider key (one of): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`
- Channel vars as needed:
  - `NEURALCLAW_TELEGRAM_TOKEN`
  - `NEURALCLAW_DISCORD_TOKEN`
  - `NEURALCLAW_SLACK_BOT_API_KEY`
  - `NEURALCLAW_SLACK_APP_API_KEY`
  - `NEURALCLAW_WHATSAPP_API_KEY`
  - `NEURALCLAW_SIGNAL_API_KEY`
