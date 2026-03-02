export type BillingPlan = "monthly" | "yearly";

export type ChannelKey =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal";

export type ProviderKey = "openai" | "anthropic" | "openrouter" | "local" | "g4f";

export type VoiceProviderKey = "twilio";

export type VoiceConfig = {
  enabled: boolean;
  provider: VoiceProviderKey;
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  requireConfirmation?: boolean;
  voicePersona?: string;
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
  voice?: VoiceConfig;
  channels: Array<{
    channel: ChannelKey;
    token: string;
  }>;
};
