export type BillingPlan = "monthly" | "yearly";

export type ChannelKey =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal";

export type ProviderKey =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "venice"
  | "local"
  | "g4f"
  | "chatgpt_token"
  | "claude_token"
  | "chatgpt_session"
  | "claude_session";

export type VoiceProviderKey = "twilio";

export type FeatureFlags = {
  evolution?: boolean;
  reflective_reasoning?: boolean;
};

export type VoiceConfig = {
  enabled: boolean;
  provider: VoiceProviderKey;
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  requireConfirmation?: boolean;
  voicePersona?: string;
  openAiKey?: string;
};

export type DeploymentRequest = {
  userEmail: string;
  agentName: string;
  plan: BillingPlan;
  provider: ProviderKey;
  providerApiKey?: string;
  model: string;
  region: string;
  persona?: string;
  enabledTools?: string[];
  featureFlags?: FeatureFlags;
  voice?: VoiceConfig;
  channels: Array<{
    channel: ChannelKey;
    token: string;
  }>;
};
