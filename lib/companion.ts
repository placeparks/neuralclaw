export const COMPANION_VERSION = "0.1.0";

const DEFAULT_COMPANION_WINDOWS_DOWNLOAD =
  "https://github.com/placeparks/neuralclaw/releases/latest/download/neuralclaw-companion-setup-0.1.0.exe";

export const COMPANION_WINDOWS_DOWNLOAD =
  process.env.NEXT_PUBLIC_COMPANION_WINDOWS_URL ??
  DEFAULT_COMPANION_WINDOWS_DOWNLOAD;

export const COMPANION_FEATURES = [
  "Open a real browser on the user's machine",
  "Launch local apps and reveal files",
  "Keep a live secure link to the hosted agent",
  "Extend Discord and Telegram agents with real device control",
] as const;

export const COMPANION_SETUP_STEPS = [
  "Download the Windows installer from the dashboard or companion page.",
  "Install NeuralClaw Companion and keep it running in the tray.",
  "Issue a pairing token in the dashboard, then paste the relay URL and token into the companion app.",
  "After pairing, hosted agents can route local-browser and local-app tasks to this machine from Telegram, Discord, and other channels.",
] as const;
