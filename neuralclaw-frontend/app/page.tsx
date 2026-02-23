"use client";

import { useMemo, useState } from "react";
import type { ChannelKey, DeploymentRequest, ProviderKey } from "@/lib/types";

type ChannelConfig = {
  key: ChannelKey;
  label: string;
  placeholder: string;
  help: string;
};

const CHANNELS: ChannelConfig[] = [
  { key: "telegram", label: "Telegram", placeholder: "123456:ABC-DEF...", help: "Token from @BotFather" },
  { key: "discord", label: "Discord", placeholder: "Discord bot token", help: "Token from Discord Developer Portal" },
  { key: "slack", label: "Slack", placeholder: "xoxb-...|xapp-...", help: "Bot + App token, use | separator" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "Session id", help: "Bridge session id" },
  { key: "signal", label: "Signal", placeholder: "+123456789", help: "Signal phone number" }
];

const PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  openai: ["gpt-4o", "gpt-4.1", "gpt-4o-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-latest"],
  openrouter: ["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o"],
  local: ["llama3", "mistral"]
};

export default function HomePage() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [userEmail, setUserEmail] = useState("");
  const [agentName, setAgentName] = useState("My NeuralClaw Agent");
  const [provider, setProvider] = useState<ProviderKey>("openai");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MODELS.openai[0]);
  const [region, setRegion] = useState("us-east-1");

  const [enabledChannels, setEnabledChannels] = useState<Record<ChannelKey, boolean>>({
    telegram: true,
    discord: false,
    slack: false,
    whatsapp: false,
    signal: false
  });

  const [tokens, setTokens] = useState<Record<ChannelKey, string>>({
    telegram: "",
    discord: "",
    slack: "",
    whatsapp: "",
    signal: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeChannels = useMemo(() => CHANNELS.filter((c) => enabledChannels[c.key]), [enabledChannels]);

  function toggleChannel(channel: ChannelKey) {
    setEnabledChannels((prev) => ({ ...prev, [channel]: !prev[channel] }));
  }

  function setToken(channel: ChannelKey, value: string) {
    setTokens((prev) => ({ ...prev, [channel]: value }));
  }

  async function onDeploy() {
    setError("");
    setSuccess("");

    if (!userEmail.trim() || !userEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    if (!agentName.trim()) {
      setError("Agent name is required.");
      return;
    }

    if (provider !== "local" && !providerApiKey.trim()) {
      setError("Provider API key is required for hosted models.");
      return;
    }

    if (activeChannels.length === 0) {
      setError("Enable at least one channel.");
      return;
    }

    const missingToken = activeChannels.find((c) => !tokens[c.key].trim());
    if (missingToken) {
      setError(`Please enter token/session for ${missingToken.label}.`);
      return;
    }

    const payload: DeploymentRequest = {
      userEmail: userEmail.trim(),
      agentName: agentName.trim(),
      plan,
      provider,
      providerApiKey: providerApiKey.trim(),
      model,
      region,
      channels: activeChannels.map((c) => ({ channel: c.key, token: tokens[c.key].trim() }))
    };

    try {
      setLoading(true);
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Deployment request failed");
      }

      setSuccess(`Deployment queued. ID: ${data.deploymentId}. Provisioner will create a dedicated Railway service for this user.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="float-glow one" />
      <div className="float-glow two" />

      <section className="hero">
        <div className="badge"><span className="pulse-dot" /> Railway dedicated service provisioning</div>
        <h1>Launch Your Own NeuralClaw Bot in Minutes</h1>
        <p>
          Pick a plan, enable channels, provide tokens and provider key, and queue a dedicated deployment.
          Each request is provisioned as its own Railway service instance.
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>1. Plan + Agent</h2>

          <div className="plan-row">
            <button className={`plan ${plan === "monthly" ? "active" : ""}`} onClick={() => setPlan("monthly")}> 
              <div>Monthly</div>
              <div className="price">$19</div>
              <small>Billed every month</small>
            </button>
            <button className={`plan ${plan === "yearly" ? "active" : ""}`} onClick={() => setPlan("yearly")}> 
              <div>Yearly</div>
              <div className="price">$190</div>
              <small>Save 2 months</small>
            </button>
          </div>

          <label className="label">Email</label>
          <input className="input" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="you@company.com" />

          <label className="label">Agent Name</label>
          <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Acme Assistant" />

          <label className="label">Provider</label>
          <select
            className="select"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as ProviderKey;
              setProvider(p);
              setModel(PROVIDER_MODELS[p][0]);
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="local">Local (Ollama)</option>
          </select>

          {provider !== "local" && (
            <>
              <label className="label">Provider API Key</label>
              <input
                type="password"
                className="input"
                value={providerApiKey}
                onChange={(e) => setProviderApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </>
          )}

          <label className="label">Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <label className="label">Region</label>
          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="us-east-1">US East</option>
            <option value="us-west-1">US West</option>
            <option value="eu-west-1">EU West</option>
            <option value="ap-south-1">Asia South</option>
          </select>
        </div>

        <div className="card">
          <h2>2. Channels + Tokens</h2>
          <div className="right-list">
            {CHANNELS.map((ch) => (
              <div key={ch.key}>
                <div className="channel-row">
                  <div className="channel-meta">
                    <div>{ch.label}</div>
                    <small>{ch.help}</small>
                  </div>
                  <button
                    type="button"
                    aria-label={`toggle ${ch.label}`}
                    className={`switch ${enabledChannels[ch.key] ? "on" : ""}`}
                    onClick={() => toggleChannel(ch.key)}
                  />
                </div>
                {enabledChannels[ch.key] && (
                  <input
                    className="input"
                    placeholder={ch.placeholder}
                    value={tokens[ch.key]}
                    onChange={(e) => setToken(ch.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <button className="btn" disabled={loading} onClick={onDeploy}>
            {loading ? "Submitting Deployment..." : "3. Queue Dedicated Deployment"}
          </button>

          {success && <div className="status ok">{success}</div>}
          {error && <div className="status err">{error}</div>}
        </div>
      </section>
    </main>
  );
}
