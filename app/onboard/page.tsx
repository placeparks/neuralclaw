"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/session-client";
import type { ChannelKey, DeploymentRequest, FeatureFlags, ProviderKey, VoiceProviderKey } from "@/lib/types";

type ChannelConfig = { key: ChannelKey; label: string; placeholder: string };
type SkillConfig = { key: "web" | "files" | "code" | "calendar"; label: string; tools: string[] };

const PERSONAS: Array<{ key: string; label: string; preview: string }> = [
  {
    key: "coder",
    label: "Coder",
    preview: "Senior engineer. Production-ready code only. Reviews for edge cases, correctness, and performance.",
  },
  {
    key: "marketing",
    label: "Marketing Agent",
    preview: "Growth strategist. ICP-first thinking. High-converting copy, sharp positioning, no fluff.",
  },
  {
    key: "sales",
    label: "Sales Agent",
    preview: "B2B closer. Outbound scripts, objection handling, pipeline discipline. Gets to the deal.",
  },
  {
    key: "support",
    label: "Support Agent",
    preview: "Takes ownership. Diagnoses before answering. Resolves with empathy and precision.",
  },
  {
    key: "research",
    label: "Research Agent",
    preview: "Rigorous and cited. Separates primary sources from synthesis. Never speculates unlabelled.",
  },
  {
    key: "analyst",
    label: "The Analyst",
    preview: "Data-first, evidence-based. Highlights assumptions and uncertainties. Thinks in systems.",
  },
  {
    key: "operator",
    label: "The Operator",
    preview: "Direct, concise, no fluff. Military-style brevity. Bullet points. Never hedges.",
  },
  {
    key: "assistant",
    label: "Executive Assistant",
    preview: "EA-level. Protects principal's time. Proactive, clear, anticipates and removes blockers.",
  },
  {
    key: "mentor",
    label: "The Mentor",
    preview: "Patient and educational. Breaks down complex topics step by step. Encourages questions.",
  },
  {
    key: "hustler",
    label: "The Hustler",
    preview: "High energy, results-driven. Focuses on action and momentum. Cuts through noise.",
  },
  {
    key: "custom",
    label: "Custom",
    preview: "Write your own persona.",
  },
];

const PERSONA_VALUES: Record<string, string> = {
  coder:
    "You are a senior software engineer with 15+ years of experience across systems, web, and distributed infrastructure. Your job is to write production-grade code — not demos, not approximations. Every function you write should handle edge cases, be readable by a peer reviewer, and be correct before it is fast. When reviewing or explaining code, you cite specific risks (race conditions, memory leaks, injection vectors). You never cut corners unless explicitly asked to prototype. When something has multiple valid approaches, you pick the most maintainable one and explain why.",
  marketing:
    "You are a senior growth and marketing strategist. Before you write a single word of copy, you identify the ideal customer profile, their top pain point, and the single job-to-be-done your message must accomplish. Your writing is direct, benefit-first, and stripped of jargon. Headlines make one strong promise. CTAs are specific verbs. You A/B-test mentally — if two framings exist, you name both and recommend one. You understand positioning, competitive differentiation, and funnel economics. You never produce generic copy.",
  sales:
    "You are a B2B sales professional with a track record in outbound and enterprise closing. Your approach: research the prospect before the first message, open with a relevant insight not a pitch, qualify hard on budget/authority/need/timeline, and earn the next step rather than rushing to close. You know objection handling cold — you welcome objections as buying signals. Your scripts feel like conversations, not templates. You track follow-up cadence, know when to walk away, and never confuse activity with progress.",
  support:
    "You are a tier-2 customer support specialist. Your first move is always to understand the problem completely before proposing a fix — you ask clarifying questions if the issue is ambiguous. You own the problem from first message to resolution: no deflection, no blame-shifting. Your tone is warm but efficient. You summarise what you understood, confirm the fix worked, and proactively mention if a related issue could arise. You escalate with context, not just a ticket number.",
  research:
    "You are a research analyst trained in rigorous academic and investigative methodology. You always distinguish between primary sources, secondary analysis, and your own synthesis — and you label each clearly. You cite sources when you have them, flag when you don't, and never present speculation as fact. When asked a question, you structure your answer: what is known with confidence, what is contested, and what remains open. You push back on leading questions and correct faulty premises before answering.",
  analyst:
    "You are a rigorous analytical advisor. You never form conclusions before examining the data. When presented with a claim, you ask: what assumptions does this rest on, what would falsify it, and what are the second-order effects? You think in systems — identifying feedback loops, bottlenecks, and leverage points. You communicate findings in structured form: situation, complication, insight, recommendation. You flag uncertainty explicitly and distinguish correlation from causation.",
  operator:
    "You are a high-performance operator. Brevity is the standard. Responses are structured in bullet points or numbered lists unless a flowing explanation is explicitly necessary. You never hedge, qualify without reason, or pad with pleasantries. When given a task, you output the result — not a description of how you will produce the result. If something is ambiguous, you state the most reasonable interpretation and proceed. You treat time as the scarcest resource.",
  assistant:
    "You are a world-class executive assistant. Your role is to protect the principal's time and decision bandwidth. You anticipate needs before they are stated, prepare information in a format ready for immediate action, and flag blockers proactively. You draft communications that match the principal's voice. You manage ambiguity by making sensible calls and documenting them. You are warm but professional, never sycophantic. Nothing falls through the cracks on your watch.",
  mentor:
    "You are a patient, skilled mentor with deep expertise across technical and strategic domains. You meet the learner where they are — you first assess their current understanding before teaching. You explain by building intuition first, then adding precision. You use concrete examples and analogies. You never make the learner feel slow; you frame every correction as a natural part of the learning process. You ask questions that lead the learner to discover the answer themselves when the opportunity exists.",
  hustler:
    "You are a high-velocity operator focused relentlessly on outcomes. You cut through analysis paralysis with a bias for action — 80% right and moving beats 100% right and stalled. You think in experiments: what can we ship this week, measure, and learn from? You surface the highest-leverage move in any situation and push hard on it. You keep energy high, celebrate small wins, and don't let perfect be the enemy of done. You hold people accountable without being a jerk about it.",
};

const CHANNELS: ChannelConfig[] = [
  { key: "telegram", label: "Telegram", placeholder: "123456:ABC..." },
  { key: "discord", label: "Discord", placeholder: "Discord bot token" },
  { key: "slack", label: "Slack", placeholder: "xoxb-...|xapp-..." },
  { key: "whatsapp", label: "WhatsApp", placeholder: "Session name (e.g. myagent)" },
  { key: "signal", label: "Signal", placeholder: "+1234567890" }
];

const PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  openai: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "o3", "o4-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-latest"],
  openrouter: ["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o", "google/gemini-2.0-flash", "meta-llama/llama-4-scout"],
  venice: ["venice-uncensored", "llama-3.3-70b", "qwen3-next-80b", "openai-gpt-oss-120b"],
  local: ["qwen3.5:2b", "gemma3", "mistral", "llama3"],
  g4f: ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet"],
  chatgpt_token: ["auto", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  claude_token: ["auto", "claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"],
  chatgpt_session: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  claude_session: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"],
};

const SESSION_GUIDES: Record<"chatgpt_session" | "claude_session", { title: string; steps: string[] }> = {
  chatgpt_session: {
    title: "How to get your ChatGPT session token",
    steps: [
      "Open chat.openai.com in Chrome or Firefox and log in.",
      "Press F12 to open DevTools → go to the Application tab.",
      "Expand Cookies → click https://chat.openai.com.",
      "Find the cookie named __Secure-next-auth.session-token.",
      "Copy the full Value (it's a long JWT string) and paste it below.",
    ],
  },
  claude_session: {
    title: "How to get your Claude session token",
    steps: [
      "Open claude.ai in Chrome or Firefox and log in.",
      "Press F12 to open DevTools → go to the Application tab.",
      "Expand Cookies → click https://claude.ai.",
      "Find the cookie named sessionKey.",
      "Copy the full Value and paste it below.",
    ],
  },
};

const TOKEN_GUIDES: Record<"chatgpt_token" | "claude_token", { title: string; steps: string[]; placeholder: string }> = {
  chatgpt_token: {
    title: "How to get your ChatGPT session credential",
    steps: [
      "Preferred: run neuralclaw session auth chatgpt --stealth on your own machine to complete the new OpenAI auth flow.",
      "If you already have a valid session cookie, you can still paste it here directly.",
      "If copying manually, inspect cookies for chatgpt.com or chat.openai.com.",
      "Use the value of __Secure-next-auth.session-token or next-auth.session-token.",
      "Paste it below. The runtime imports it into NeuralClaw's token store on boot.",
    ],
    placeholder: "OAuth-derived session cookie or __Secure-next-auth.session-token",
  },
  claude_token: {
    title: "How to get your Claude session credential",
    steps: [
      "Preferred: run neuralclaw session auth claude --stealth on your own machine to complete the new Claude auth flow.",
      "If you already have a valid Claude session key, you can still paste it here directly.",
      "If copying manually, inspect cookies for claude.ai.",
      "Find the cookie named sessionKey.",
      "Paste it below. The runtime imports it into NeuralClaw's token store on boot.",
    ],
    placeholder: "sessionKey",
  },
};

const SKILLS: SkillConfig[] = [
  { key: "web", label: "Web Search", tools: ["web_search", "fetch_url"] },
  { key: "files", label: "File Ops", tools: ["read_file", "write_file", "list_directory"] },
  { key: "code", label: "Code Exec", tools: ["execute_python"] },
  { key: "calendar", label: "Calendar", tools: ["create_event", "list_events", "delete_event"] },
];

function OnboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [agentName, setAgentName] = useState("");
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [provider, setProvider] = useState<ProviderKey>("openai");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MODELS.openai[0]);
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ evolution: false, reflective_reasoning: true });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderKey>("twilio");
  const [voiceAccountSid, setVoiceAccountSid] = useState("");
  const [voiceAuthToken, setVoiceAuthToken] = useState("");
  const [voicePhoneNumber, setVoicePhoneNumber] = useState("");
  const [voiceRequireConfirmation, setVoiceRequireConfirmation] = useState(true);
  const [voicePersona, setVoicePersona] = useState("");
  const [voiceOpenAiKey, setVoiceOpenAiKey] = useState("");
  const [authFlowToken, setAuthFlowToken] = useState("");
  const [authFlowUrl, setAuthFlowUrl] = useState("");
  const [authCallbackUrl, setAuthCallbackUrl] = useState("");
  const [authAssistantInput, setAuthAssistantInput] = useState("");
  const [authAssistantBusy, setAuthAssistantBusy] = useState(false);
  const [authAssistantError, setAuthAssistantError] = useState("");
  const [authAssistantSuccess, setAuthAssistantSuccess] = useState("");
  const [chatgptManualFallback, setChatgptManualFallback] = useState(false);
  const chatgptCredFetched = useRef(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) router.replace("/register");
  }, [router]);

  useEffect(() => {
    setAuthFlowToken("");
    setAuthFlowUrl("");
    setAuthCallbackUrl("");
    setAuthAssistantInput("");
    setAuthAssistantError("");
    setAuthAssistantSuccess("");
    setChatgptManualFallback(false);
  }, [provider]);

  // Handle automatic ChatGPT OAuth return
  useEffect(() => {
    const connected = searchParams.get("chatgpt_connected");
    const oauthError = searchParams.get("chatgpt_error");
    if (!connected && !oauthError) return;
    if (chatgptCredFetched.current) return;
    chatgptCredFetched.current = true;

    // Clean up URL params without re-render loop
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, "", cleanUrl);

    if (oauthError) {
      setProvider("chatgpt_token");
      setAuthAssistantError(decodeURIComponent(oauthError));
      return;
    }

    setProvider("chatgpt_token");
    setModel(PROVIDER_MODELS.chatgpt_token[0]);
    setAuthAssistantBusy(true);
    fetch("/api/session-auth/chatgpt/credential")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to retrieve credential.");
        setProviderApiKey(data.credential);
        setAuthAssistantSuccess("ChatGPT connected. Credential ready — complete setup below.");
      })
      .catch((e) => {
        setAuthAssistantError(e instanceof Error ? e.message : "Failed to retrieve credential.");
      })
      .finally(() => setAuthAssistantBusy(false));
  }, [searchParams]);

  const isTokenProvider = provider === "chatgpt_token" || provider === "claude_token";

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
    const resolvedProviderCredential = provider === "claude_token"
      ? (providerApiKey.trim() || authAssistantInput.trim())
      : providerApiKey.trim();

    if (provider !== "local" && provider !== "g4f" && !resolvedProviderCredential) {
      return setError(isTokenProvider ? "Session token required." : "Provider API key required.");
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
      providerApiKey: resolvedProviderCredential,
      model,
      region: "us-east-1",
      persona: resolvedPersona,
      enabledTools: isAllToolsEnabled ? undefined : enabledTools,
      featureFlags,
      voice: voiceEnabled ? {
        enabled: true,
        provider: voiceProvider,
        accountSid: voiceAccountSid.trim(),
        authToken: voiceAuthToken.trim(),
        phoneNumber: voicePhoneNumber.trim(),
        requireConfirmation: voiceRequireConfirmation,
        voicePersona: voicePersona.trim() || undefined,
        openAiKey: voiceOpenAiKey.trim() || undefined,
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

  async function startChatGPTAuth() {
    try {
      setAuthAssistantBusy(true);
      setAuthAssistantError("");
      setAuthAssistantSuccess("");
      const res = await fetch("/api/session-auth/chatgpt/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start ChatGPT auth.");
      // Store flowToken + URL for manual fallback, then redirect browser to OpenAI
      setAuthFlowToken(data.flowToken);
      setAuthFlowUrl(data.authUrl);
      window.location.href = data.authUrl;
    } catch (e) {
      setAuthAssistantBusy(false);
      setAuthAssistantError(e instanceof Error ? e.message : "Unexpected error");
    }
    // Note: don't reset busy — page is navigating away
  }

  async function finishChatGPTAuth() {
    try {
      setAuthAssistantBusy(true);
      setAuthAssistantError("");
      setAuthAssistantSuccess("");
      const res = await fetch("/api/session-auth/chatgpt/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowToken: authFlowToken, callbackUrl: authCallbackUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to finish ChatGPT auth.");
      setProviderApiKey(data.credential);
      setAuthAssistantSuccess("ChatGPT session credential captured and inserted into the deploy form.");
    } catch (e) {
      setAuthAssistantError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setAuthAssistantBusy(false);
    }
  }

  async function extractClaudeCredential() {
    try {
      setAuthAssistantBusy(true);
      setAuthAssistantError("");
      setAuthAssistantSuccess("");
      const res = await fetch("/api/session-auth/claude/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: authAssistantInput || providerApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract Claude session key.");
      setProviderApiKey(data.credential);
      setAuthAssistantSuccess("Claude sessionKey extracted and inserted into the deploy form.");
    } catch (e) {
      setAuthAssistantError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setAuthAssistantBusy(false);
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
          <input className="input" autoComplete="new-password" placeholder="e.g. Sales Bot" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
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
            <option value="openai">OpenAI (API key)</option>
            <option value="anthropic">Anthropic (API key)</option>
            <option value="openrouter">OpenRouter (API key)</option>
            <option value="venice">Venice API</option>
            <option value="chatgpt_token">ChatGPT (Session / OAuth)</option>
            <option value="claude_token">Claude (Session / OAuth)</option>
            <option value="g4f">Free Wrapper (g4f)</option>
            <option value="local">Local (Ollama)</option>
          </select>

          {provider === "chatgpt_token" && (
            <div style={{ margin: "10px 0 4px", padding: "10px 12px", background: "var(--surface-alt, rgba(255,255,255,0.04))", borderRadius: 6, border: "1px solid var(--border, #30363d)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Connect ChatGPT</div>
              {providerApiKey ? (
                <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                  Credential captured. You can proceed to deploy, or reconnect to replace it.
                </p>
              ) : (
                <>
                  {/* eslint-disable react/no-unescaped-entities */}
                <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                  Click below — you'll be sent to OpenAI to approve access and automatically redirected back here.
                </p>
                  {/* eslint-enable react/no-unescaped-entities */}
                </>
              )}
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <button type="button" className="solid-btn" onClick={startChatGPTAuth} disabled={authAssistantBusy}>
                  {authAssistantBusy ? "Redirecting to OpenAI..." : providerApiKey ? "Reconnect ChatGPT" : "Connect ChatGPT"}
                </button>

                {/* Manual fallback toggle */}
                <button
                  type="button"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted, #8b949e)", fontSize: "0.74rem", padding: 0, textAlign: "left" }}
                  onClick={() => setChatgptManualFallback((v) => !v)}
                >
                  {chatgptManualFallback ? "▼" : "▶"} Automatic redirect not working? Use manual fallback
                </button>

                {chatgptManualFallback && (
                  <>
                    <p className="muted" style={{ fontSize: "0.74rem", margin: 0 }}>
                      1. Click <strong>Connect ChatGPT</strong> above — if the auto-redirect fails, copy the auth URL shown, open it in the browser where ChatGPT is logged in, then paste the resulting callback URL below.
                    </p>
                    {authFlowUrl && (
                      <>
                        <label className="label">Auth URL (open in ChatGPT browser)</label>
                        <textarea
                          className="input"
                          style={{ minHeight: 60, resize: "vertical", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace)" }}
                          readOnly
                          value={authFlowUrl}
                        />
                        <label className="label">Paste the callback URL</label>
                        <textarea
                          className="input"
                          style={{ minHeight: 60, resize: "vertical", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace)" }}
                          placeholder="http://localhost:1455/callback?code=...&state=..."
                          value={authCallbackUrl}
                          onChange={(e) => setAuthCallbackUrl(e.target.value)}
                        />
                        <button type="button" className="solid-btn" onClick={finishChatGPTAuth} disabled={authAssistantBusy || !authFlowToken || !authCallbackUrl.trim()}>
                          {authAssistantBusy ? "Exchanging..." : "Finish ChatGPT Connection"}
                        </button>
                      </>
                    )}
                    <label className="label" style={{ marginTop: 4 }}>Or paste a credential directly</label>
                    <input
                      className="input"
                      type="password"
                      placeholder={TOKEN_GUIDES.chatgpt_token.placeholder}
                      value={providerApiKey}
                      onChange={(e) => setProviderApiKey(e.target.value)}
                    />
                  </>
                )}
              </div>
              {authAssistantSuccess && (
                <div className="status ok" style={{ marginTop: 10 }}>{authAssistantSuccess}</div>
              )}
              {authAssistantError && (
                <div className="status err" style={{ marginTop: 10 }}>{authAssistantError}</div>
              )}
            </div>
          )}
          {provider === "claude_token" && (
            <div style={{ margin: "10px 0 4px", padding: "10px 12px", background: "var(--surface-alt, rgba(255,255,255,0.04))", borderRadius: 6, border: "1px solid var(--border, #30363d)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Connect Claude</div>
              <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                Easiest path if Claude is already open: copy the `sessionKey` cookie from your Claude browser and paste it below. You can paste either the raw key or a full cookie string.
              </p>
              <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                Prefer one-click copy? Download the <a href="/downloads/neuralclaw-session-helper.zip" style={{ color: "var(--accent, #58a6ff)" }}>NeuralClaw Session Helper</a>, load it as an unpacked Chrome extension, click <code>Copy Claude sessionKey</code>, then paste here.
              </p>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <label className="label">Paste from Claude browser</label>
                <textarea
                  className="input"
                  style={{ minHeight: 80, resize: "vertical", fontSize: "0.78rem", fontFamily: "var(--font-mono, monospace)" }}
                  placeholder="sessionKey=... or the raw sessionKey value"
                  value={authAssistantInput}
                  onChange={(e) => setAuthAssistantInput(e.target.value)}
                />
                <button type="button" className="solid-btn" onClick={extractClaudeCredential} disabled={authAssistantBusy || !(authAssistantInput || providerApiKey).trim()}>
                  {authAssistantBusy ? "Checking..." : "Use Claude Browser Session"}
                </button>
                <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
                  Browser steps: <code>Claude tab -&gt; F12 -&gt; Application -&gt; Cookies -&gt; https://claude.ai -&gt; sessionKey -&gt; Copy Value</code>.
                </p>
              </div>
              {authAssistantSuccess && (
                <div className="status ok" style={{ marginTop: 10 }}>{authAssistantSuccess}</div>
              )}
              {authAssistantError && (
                <div className="status err" style={{ marginTop: 10 }}>{authAssistantError}</div>
              )}
            </div>
          )}

          {!isTokenProvider && provider !== "local" && provider !== "g4f" && (
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

          <div style={{ marginTop: 16, borderTop: "1px solid var(--border, #30363d)", paddingTop: 12 }}>
            <button
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "0.82rem", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span style={{ fontSize: "0.7rem" }}>{showAdvanced ? "▼" : "▶"}</span>
              Advanced
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
                  <input
                    type="checkbox"
                    checked={featureFlags.evolution ?? false}
                    onChange={(e) => setFeatureFlags((f) => ({ ...f, evolution: e.target.checked }))}
                  />
                  Enable Evolution Cortex
                  <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 400 }}>(self-improvement, ~+50 MB RAM)</span>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
                  <input
                    type="checkbox"
                    checked={featureFlags.reflective_reasoning ?? true}
                    onChange={(e) => setFeatureFlags((f) => ({ ...f, reflective_reasoning: e.target.checked }))}
                  />
                  Reflective Reasoning
                  <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 400 }}>(multi-step planning, uses extra LLM calls)</span>
                </label>
              </div>
            )}
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
                  type="password"
                  placeholder="OpenAI API key (for natural voice — gpt-4o-realtime)"
                  value={voiceOpenAiKey}
                  onChange={(e) => setVoiceOpenAiKey(e.target.value)}
                />
                <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 4px" }}>
                  If left blank and your agent provider is OpenAI, the provider key is reused.
                </p>
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

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardPageInner />
    </Suspense>
  );
}
