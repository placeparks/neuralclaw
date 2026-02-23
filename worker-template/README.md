# NeuralClaw Worker Template

Use this directory as the Railway root directory for your worker template service.

It installs `neuralclaw[all-channels]` from PyPI and starts:

`python -m neuralclaw.cli gateway`

This service should be used as `RAILWAY_SERVICE_ID` in owner mode so each user gets a cloned agent instance with their own env vars.
