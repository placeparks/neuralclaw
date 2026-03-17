export const COMPANION_VERSION = "0.1.0";

export const COMPANION_WINDOWS_DOWNLOAD =
  "/downloads/neuralclaw-companion/windows/neuralclaw-companion-setup-0.1.0.exe";

export const COMPANION_FEATURES = [
  "Open a real browser on the user's machine",
  "Launch local apps and reveal files",
  "Keep a live secure link to the hosted agent",
  "Extend Discord and Telegram agents with real device control",
] as const;

export const COMPANION_SETUP_STEPS = [
  "Download the Windows installer from the dashboard or companion page.",
  "Install NeuralClaw Companion and keep it running in the tray.",
  "Pair the computer with your agent once the pairing backend is enabled.",
  "After pairing, hosted agents can route local-browser and desktop tasks to this machine.",
] as const;
