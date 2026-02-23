"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { deployNeuralClaw, getDeploymentStatus, logoutUser, me } from "@/lib/api";
import { Pill } from "@/components/ui";
import { useRouter } from "next/navigation";

const steps = ["Choose Plan", "AI Provider", "Channels", "Deploy"];

export default function OnboardPage() {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState("monthly");
  const [provider, setProvider] = useState("openai");
  const [channels, setChannels] = useState<string[]>(["telegram"]);
  const [providerApiKey, setProviderApiKey] = useState("");
  const [channelSecrets, setChannelSecrets] = useState({
    telegramBotToken: "",
    discordBotToken: "",
    slackBotToken: "",
    slackAppToken: "",
    whatsappSession: "",
    signalPhone: "",
  });
  const [status, setStatus] = useState("Checking session...");
  const [deployUrl, setDeployUrl] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const canGoNext = useMemo(() => {
    if (step === 1 && provider !== "local" && !providerApiKey.trim()) return false;
    if (step === 2) {
      if (channels.includes("telegram") && !channelSecrets.telegramBotToken.trim()) return false;
      if (channels.includes("discord") && !channelSecrets.discordBotToken.trim()) return false;
      if (channels.includes("slack")) {
        if (!channelSecrets.slackBotToken.trim()) return false;
        if (!channelSecrets.slackAppToken.trim()) return false;
      }
      if (channels.includes("whatsapp") && !channelSecrets.whatsappSession.trim()) return false;
      if (channels.includes("signal") && !channelSecrets.signalPhone.trim()) return false;
    }
    return true;
  }, [step, provider, providerApiKey, channels, channelSecrets]);

  useEffect(() => {
    (async () => {
      try {
        const auth = await me();
        setUserEmail(String(auth.email || ""));
        setStatus("Session ready.");
      } catch {
        setStatus("Please login first.");
        router.push("/login");
      }
    })();
  }, [router]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const s = await getDeploymentStatus();
        if (s?.status) {
          setStatus(`${s.status}: ${s.detail}`);
          if (s.deployUrl) setDeployUrl(String(s.deployUrl));
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const toggleChannel = (value: string) => {
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const deploy = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus("Preparing Railway deployment...");
    try {
      const result = await deployNeuralClaw({
        plan,
        provider,
        channels,
        providerApiKey,
        channelSecrets,
      });
      setStatus(`${result.status}: ${result.detail}`);
      const url = String(result.deployUrl || "");
      setDeployUrl(url);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deployment failed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await logoutUser();
    router.push("/login");
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill>onboarding</Pill>
          <span className="text-xs text-muted">{userEmail}</span>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard" className="text-sm text-muted hover:text-text">Dashboard</Link>
          <button onClick={logout} className="text-sm text-muted hover:text-text">Logout</button>
          <Link href="/" className="text-sm text-muted hover:text-text">Back</Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.3fr_0.8fr]">
        <form onSubmit={deploy} className="shell-card rounded-2xl p-6">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="text-3xl font-semibold"
          >
            One-click Railway deployment
          </motion.h1>
          <p className="mt-2 text-sm text-muted">Configure your private instance in four steps.</p>

          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            {steps.map((name, idx) => (
              <motion.div
                key={name}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                className={`rounded-lg border px-3 py-2 text-center text-xs font-mono-tech uppercase tracking-[0.12em] ${idx <= step ? "border-cyan bg-cyan/10 text-cyan" : "border-borderc text-muted"}`}
              >
                {idx + 1}. {name}
              </motion.div>
            ))}
          </div>

          {step === 0 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-lg font-medium">Choose plan</h2>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-borderc p-3">
                <input type="radio" checked={plan === "monthly"} onChange={() => setPlan("monthly")} />
                <span>Monthly - Stripe disabled in testing mode</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-borderc p-3">
                <input type="radio" checked={plan === "yearly"} onChange={() => setPlan("yearly")} />
                <span>Yearly - Stripe disabled in testing mode</span>
              </label>
            </section>
          )}

          {step === 1 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-lg font-medium">AI provider</h2>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2">
                <option value="local">Local (Ollama)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              {provider !== "local" ? (
                <input
                  type="password"
                  placeholder="Provider API key (used in deploy env setup later)"
                  value={providerApiKey}
                  onChange={(e) => setProviderApiKey(e.target.value)}
                  className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                />
              ) : null}
            </section>
          )}

          {step === 2 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-lg font-medium">Channels</h2>
              <div className="grid grid-cols-2 gap-2">
                {["telegram", "discord", "slack", "whatsapp", "signal"].map((ch) => (
                  <label key={ch} className="flex cursor-pointer items-center gap-2 rounded-lg border border-borderc p-3 text-sm">
                    <input checked={channels.includes(ch)} onChange={() => toggleChannel(ch)} type="checkbox" />
                    {ch}
                  </label>
                ))}
              </div>
              {channels.includes("telegram") ? (
                <input
                  type="password"
                  placeholder="Telegram Bot Token"
                  value={channelSecrets.telegramBotToken}
                  onChange={(e) => setChannelSecrets((s) => ({ ...s, telegramBotToken: e.target.value }))}
                  className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                />
              ) : null}
              {channels.includes("discord") ? (
                <input
                  type="password"
                  placeholder="Discord Bot Token"
                  value={channelSecrets.discordBotToken}
                  onChange={(e) => setChannelSecrets((s) => ({ ...s, discordBotToken: e.target.value }))}
                  className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                />
              ) : null}
              {channels.includes("slack") ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    type="password"
                    placeholder="Slack Bot Token (xoxb-...)"
                    value={channelSecrets.slackBotToken}
                    onChange={(e) => setChannelSecrets((s) => ({ ...s, slackBotToken: e.target.value }))}
                    className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                  />
                  <input
                    type="password"
                    placeholder="Slack App Token (xapp-...)"
                    value={channelSecrets.slackAppToken}
                    onChange={(e) => setChannelSecrets((s) => ({ ...s, slackAppToken: e.target.value }))}
                    className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                  />
                </div>
              ) : null}
              {channels.includes("whatsapp") ? (
                <input
                  type="text"
                  placeholder="WhatsApp Session ID"
                  value={channelSecrets.whatsappSession}
                  onChange={(e) => setChannelSecrets((s) => ({ ...s, whatsappSession: e.target.value }))}
                  className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                />
              ) : null}
              {channels.includes("signal") ? (
                <input
                  type="text"
                  placeholder="Signal Phone (+1234567890)"
                  value={channelSecrets.signalPhone}
                  onChange={(e) => setChannelSecrets((s) => ({ ...s, signalPhone: e.target.value }))}
                  className="w-full rounded-lg border border-borderc bg-[#061024] px-3 py-2"
                />
              ) : null}
            </section>
          )}

          {step === 3 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-lg font-medium">Deploy</h2>
              <p className="text-sm text-muted">Click deploy to open Railway one-click flow.</p>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={busy}
                type="submit"
                className="rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-[#03101f] disabled:opacity-60"
              >
                {busy ? "Preparing..." : "Deploy on Railway"}
              </motion.button>
              {deployUrl ? (
                <a href={deployUrl} className="block text-sm text-cyan" target="_blank" rel="noreferrer">
                  Open Railway deploy link
                </a>
              ) : null}
              <Link href="/dashboard" className="block text-sm text-cyan">View deployment dashboard</Link>
            </section>
          )}

          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="rounded-full border border-borderc px-4 py-2 text-sm">Back</button>
            {step < 3 ? (
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => setStep((s) => Math.min(3, s + 1))}
                className="rounded-full bg-cyan px-4 py-2 text-sm font-semibold text-[#03101f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            ) : null}
          </div>

          {status ? <p className="mt-4 text-sm text-cyan">{status}</p> : null}
        </form>

        <aside className="shell-card rounded-2xl p-6">
          <h2 className="font-mono-tech text-xs uppercase tracking-[0.16em] text-cyan">summary</h2>
          <div className="mt-4 space-y-2 text-sm text-muted">
            <p>Plan: <span className="text-text">{plan}</span></p>
            <p>Provider: <span className="text-text">{provider}</span></p>
            <p>Channels: <span className="text-text">{channels.length ? channels.join(", ") : "none"}</span></p>
          </div>
          <div className="section-divider my-4" />
          <p className="font-mono-tech text-xs text-cyan">railway mode</p>
          <p className="mt-2 rounded-md bg-[#061024] p-3 font-mono-tech text-xs text-cyan">owner mode service clone</p>
        </aside>
      </div>
    </main>
  );
}
