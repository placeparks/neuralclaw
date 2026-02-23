#!/usr/bin/env sh
set -eu

if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENROUTER_API_KEY:-}" ] \
  && [ -z "${NEURALCLAW_OPENAI_API_KEY:-}" ] && [ -z "${NEURALCLAW_ANTHROPIC_API_KEY:-}" ] && [ -z "${NEURALCLAW_OPENROUTER_API_KEY:-}" ]; then
  echo "[worker] warning: no provider API key found (OPENAI/ANTHROPIC/OPENROUTER)."
fi

if [ -z "${NEURALCLAW_TELEGRAM_TOKEN:-}" ] && [ -z "${NEURALCLAW_DISCORD_TOKEN:-}" ] \
  && [ -z "${NEURALCLAW_SLACK_BOT_API_KEY:-}" ] && [ -z "${NEURALCLAW_WHATSAPP_API_KEY:-}" ] && [ -z "${NEURALCLAW_SIGNAL_API_KEY:-}" ]; then
  echo "[worker] warning: no channel token found. Gateway will run but no external channel may be active."
fi

exec python -m neuralclaw.cli gateway
