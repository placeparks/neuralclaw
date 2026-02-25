export type BillingPlan = "monthly" | "yearly";

export type ChannelKey =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal";

export type ProviderKey = "openai" | "anthropic" | "openrouter" | "local";

export type DeploymentRequest = {
  userEmail: string;
  agentName: string;
  plan: BillingPlan;
  provider: ProviderKey;
  providerApiKey?: string;
  model: string;
  region: string;
  persona?: string;
  channels: Array<{
    channel: ChannelKey;
    token: string;
  }>;
};
