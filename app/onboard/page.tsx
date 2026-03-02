"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/session-client";
import type { ChannelKey, DeploymentRequest, ProviderKey, VoiceProviderKey } from "@/lib/types";

type ChannelConfig = { key: ChannelKey; label: string; placeholder: string };
type SkillConfig = { key: "web" | "files" | "code" | "calendar"; label: string; tools: string[] };

const PERSONAS: Array<{ key: string; label: string; preview: string }> = [
  {
    key: "operator",
    label: "The Operator",
    preview: "Direct, concise, no fluff. Military-style brevity. Bullet points. Never hedges.",
  },
  {
    key: "mentor",
    label: "The Mentor",
    preview: "Patient and educational. Breaks down complex topics step by step. Encourages questions.",
  },
  {
    key: "analyst",
    label: "The Analyst",
    preview: "Data-first, evidence-based. Highlights assumptions. Thinks in systems.",
  },
  {
    key: "hustler",
    label: "The Hustler",
    preview: "High energy, results-driven. Focuses on action and momentum. Cuts through noise.",
  },
  {
    key: "assistant",
    label: "The Assistant",
    preview: "Warm, professional, proactive. Top EA energy. Anticipates needs.",
  },
  {
    key: "custom",
    label: "Custom",
    preview: "Write your own persona.",
  },
];

const PERSONA_VALUES: Record<string, string> = {
  operator:
    "You are a direct, precise AI operator. Give concise answers with no fluff. Use bullet points. Never hedge. Never over-explain.",
  mentor:
    "You are a patient, knowledgeable mentor. Break down complex topics step by step. Encourage questions. Explain reasoning clearly.",
  analyst:
    "You are a rigorous analytical assistant. Always ask for data before drawing conclusions. Highlight assumptions and uncertainties. Think in systems.",
  hustler:
    "You are an energetic, results-driven assistant. Focus on action, momentum, and outcomes. Keep energy high. Cut through noise.",
  assistant:
    "You are a warm, professional AI assistant. Be proactive, anticipate needs, and communicate with clarity and care.",
};

const CHANNELS: ChannelConfig[] = [
  { key: "telegram", label: "Telegram", placeholder: "123456:ABC..." },
  { key: "discord", label: "Discord", placeholder: "Discord bot token" },
  { key: "slack", label: "Slack", placeholder: "xoxb-...|xapp-..." },
  { key: "whatsapp", label: "WhatsApp", placeholder: "Session id" },
  { key: "signal", label: "Signal", placeholder: "+1234567890" }
];

const PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  openai: ["gpt-4o", "gpt-4.1", "gpt-4o-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-latest"],
  openrouter: ["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o"],
  local: ["llama3", "mistral"],
  g4f: ["gpt-4o-mini", "gpt-4o", "claude-3.5-sonnet"]
};

const SKILLS: SkillConfig[] = [
  { key: "web", label: "Web Search", tools: ["web_search", "fetch_url"] },
  { key: "files", label: "File Ops", tools: ["read_file", "write_file", "list_directory"] },
  { key: "code", label: "Code Exec", tools: ["execute_python"] },
  { key: "calendar", label: "Calendar", tools: ["create_event", "list_events", "delete_event"] },
];

export default function OnboardPage() {
  const router = useRouter();
  const [agentName, setAgentName] = useState("Joker");
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [provider, setProvider] = useState<ProviderKey>("openai");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MODELS.openai[0]);
  const [region, setRegion] = useState("us-east-1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tokens, setTokens] = useState<Record<ChannelKey, string>>({
    telegram: "",
    discord: "",
    slack: "",
    whatsapp: "",
    signal: ""
  });
  const [enabledChannels, setEnabledChannels] = useState<Record<ChannelKey, boolean>>({
    telegram: true,
    discord: false,
    slack: false,
    whatsapp: false,
    signal: false
  });
  const [selectedPersonaKey, setSelectedPersonaKey] = useState<string>("");
  const [customPersona, setCustomPersona] = useState("");
  const [enabledSkills, setEnabledSkills] = useState<Record<SkillConfig["key"], boolean>>({
    web: true,
    files: true,
    code: true,
    calendar: true,
  });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderKey>("twilio");
  const [voiceAccountSid, setVoiceAccountSid] = useState("");
  const [voiceAuthToken, setVoiceAuthToken] = useState("");
  const [voicePhoneNumber, setVoicePhoneNumber] = useState("");
  const [voiceRequireConfirmation, setVoiceRequireConfirmation] = useState(true);
  const [voicePersona, setVoicePersona] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) router.replace("/register");
  }, [router]);

  const activeChannels = useMemo(() => CHANNELS.filter((c) => enabledChannels[c.key]), [enabledChannels]);

  const resolvedPersona = useMemo(() => {
    if (!selectedPersonaKey) return undefined;
    if (selectedPersonaKey === "custom") return customPersona.trim() || undefined;
    return PERSONA_VALUES[selectedPersonaKey];
  }, [selectedPersonaKey, customPersona]);

  async function createAgent() {
    const user = getStoredUser();
    if (!user) {
      router.replace("/register");
      return;
    }
    setError("");
    setSuccess("");
    if (!agentName.trim()) return setError("Agent name is required.");
    if (provider !== "local" && provider !== "g4f" && !providerApiKey.trim()) {
      return setError("Provider API key required.");
    }
    if (activeChannels.length === 0) return setError("Enable at least one channel.");
    const missing = activeChannels.find((c) => !tokens[c.key].trim());
    if (missing) return setError(`Token required for ${missing.label}.`);

    const enabledTools = SKILLS
      .filter((s) => enabledSkills[s.key])
      .flatMap((s) => s.tools);
    if (enabledTools.length === 0) {
      return setError("Enable at least one skill.");
    }
    if (voiceEnabled) {
      if (!voiceAccountSid.trim() || !voiceAuthToken.trim() || !voicePhoneNumber.trim()) {
        return setError("Voice Agent requires Twilio Account SID, Auth Token, and outbound number.");
      }
    }

    const allTools = SKILLS.flatMap((s) => s.tools);
    const isAllToolsEnabled = enabledTools.length === allTools.length;

    const payload: DeploymentRequest = {
      userEmail: user.email,
      agentName,
      plan,
      provider,
      providerApiKey,
      model,
      region,
      persona: resolvedPersona,
      enabledTools: isAllToolsEnabled ? undefined : enabledTools,
      voice: voiceEnabled ? {
        enabled: true,
        provider: voiceProvider,
        accountSid: voiceAccountSid.trim(),
        authToken: voiceAuthToken.trim(),
        phoneNumber: voicePhoneNumber.trim(),
        requireConfirmation: voiceRequireConfirmation,
        voicePersona: voicePersona.trim() || undefined,
      } : undefined,
      channels: activeChannels.map((ch) => ({ channel: ch.key, token: tokens[ch.key] }))
    };

    try {
      setLoading(true);
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSuccess("Agent deployment submitted. Redirecting to dashboard...");
      setTimeout(() => router.push("/dashboard"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site">
      <div className="bg-orb orb-b" />
      <section className="hero-block compact">
        <p className="eyebrow">Onboarding</p>
        <h1>Create your first agent</h1>
        <p className="hero-copy">After this, you land in your dashboard with agent health and mesh controls.</p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Agent Setup</h2>
          <label className="label">Agent name</label>
          <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          <label className="label">Plan</label>
          <div className="plan-row">
            <button className={`plan ${plan === "monthly" ? "active" : ""}`} onClick={() => setPlan("monthly")}>Monthly</button>
            <button className={`plan ${plan === "yearly" ? "active" : ""}`} onClick={() => setPlan("yearly")}>Yearly</button>
          </div>
          <label className="label">Provider</label>
          <select className="select" value={provider} onChange={(e) => {
            const p = e.target.value as ProviderKey;
            setProvider(p);
            setModel(PROVIDER_MODELS[p][0]);
          }}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="g4f">Free Wrapper (g4f)</option>
            <option value="local">Local</option>
          </select>
          {provider !== "local" && provider !== "g4f" && (
            <>
              <label className="label">API key</label>
              <input className="input" type="password" value={providerApiKey} onChange={(e) => setProviderApiKey(e.target.value)} />
            </>
          )}
          {provider === "g4f" && (
            <p className="muted" style={{ fontSize: "0.78rem", margin: "8px 0 0" }}>
              g4f mode does not require a provider API key.
            </p>
          )}
          <label className="label">Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {PROVIDER_MODELS[provider].map((m) => <option key={m}>{m}</option>)}
          </select>
          <label className="label">Region</label>
          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="us-east-1">US East</option>
            <option value="us-west-1">US West</option>
            <option value="eu-west-1">EU West</option>
          </select>

          <label className="label" style={{ marginTop: 16 }}>
            Personality <span className="muted" style={{ fontSize: "0.78rem", fontWeight: 400 }}>(optional)</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {PERSONAS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`plan ${selectedPersonaKey === p.key ? "active" : ""}`}
                style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                onClick={() => setSelectedPersonaKey((prev) => prev === p.key ? "" : p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selectedPersonaKey && selectedPersonaKey !== "custom" && (
            <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 6px" }}>
              {PERSONAS.find((p) => p.key === selectedPersonaKey)?.preview}
            </p>
          )}
          {selectedPersonaKey === "custom" && (
            <textarea
              className="input"
              style={{ minHeight: 80, resize: "vertical", fontSize: "0.82rem", fontFamily: "var(--font-mono, monospace)" }}
              placeholder="You are Max, a brutally honest growth advisor for SaaS founders..."
              value={customPersona}
              onChange={(e) => setCustomPersona(e.target.value)}
            />
          )}

          <label className="label" style={{ marginTop: 16 }}>Skills</label>
          <div style={{ display: "grid", gap: 6 }}>
            {SKILLS.map((skill) => (
              <label
                key={skill.key}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}
              >
                <input
                  type="checkbox"
                  checked={enabledSkills[skill.key]}
                  onChange={(e) =>
                    setEnabledSkills((prev) => ({ ...prev, [skill.key]: e.target.checked }))
                  }
                />
                {skill.label}
              </label>
            ))}
          </div>

          <label className="label" style={{ marginTop: 16 }}>Voice Agent</label>
          <div style={{ display: "grid", gap: 10 }}>
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}
            >
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
              />
              Enable AI phone calling
            </label>
            {voiceEnabled && (
              <>
                <select className="select" value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value as VoiceProviderKey)}>
                  <option value="twilio">Twilio Voice</option>
                </select>
                <input
                  className="input"
                  placeholder="Twilio Account SID"
                  value={voiceAccountSid}
                  onChange={(e) => setVoiceAccountSid(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Twilio Auth Token"
                  value={voiceAuthToken}
                  onChange={(e) => setVoiceAuthToken(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="+15551234567"
                  value={voicePhoneNumber}
                  onChange={(e) => setVoicePhoneNumber(e.target.value)}
                />
                <label className="label" style={{ marginTop: 4 }}>
                  Call behavior <span className="muted" style={{ fontSize: "0.78rem", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  className="input"
                  style={{ minHeight: 72, resize: "vertical", fontSize: "0.82rem", fontFamily: "var(--font-mono, monospace)" }}
                  placeholder="e.g. You are a professional appointment scheduler. Confirm or reschedule meetings calmly and clearly."
                  value={voicePersona}
                  onChange={(e) => setVoicePersona(e.target.value)}
                />
                <label
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}
                >
                  <input
                    type="checkbox"
                    checked={voiceRequireConfirmation}
                    onChange={(e) => setVoiceRequireConfirmation(e.target.checked)}
                  />
                  Require explicit confirmation before each call
                </label>
                <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                  This enables call capability wiring. Live two-way AI calling still requires a telephony execution path in the runtime.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Channels</h2>
          <div className="right-list">
            {CHANNELS.map((ch) => (
              <div key={ch.key}>
                <div className="channel-row">
                  <div>{ch.label}</div>
                  <button className={`switch ${enabledChannels[ch.key] ? "on" : ""}`} onClick={() => setEnabledChannels((p) => ({ ...p, [ch.key]: !p[ch.key] }))} />
                </div>
                {enabledChannels[ch.key] && (
                  <input className="input" placeholder={ch.placeholder} value={tokens[ch.key]} onChange={(e) => setTokens((p) => ({ ...p, [ch.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <button className="solid-btn full" onClick={createAgent} disabled={loading}>
            {loading ? "Deploying..." : "Deploy Agent"}
          </button>
          {success && <div className="status ok">{success}</div>}
          {error && <div className="status err">{error}</div>}
        </div>
      </section>
    </main>
  );
}
