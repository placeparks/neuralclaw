import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="site">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <header className="topbar">
        <div className="logo">NEURALCLAW CLOUD</div>
        <div className="top-actions">
          <Link href="/login" className="ghost-btn">Sign in</Link>
          <Link href="/register" className="solid-btn">Create account</Link>
        </div>
      </header>

      <section className="hero-block">
        <p className="eyebrow">NeuralClaw Cloud Platform</p>
        <h1>Build always-online AI agents with channels, memory, security, and mesh collaboration.</h1>
        <p className="hero-copy">
          NeuralClaw turns local AI bots into production-ready cloud agents. Launch dedicated Railway instances, connect Telegram/Discord/Slack/WhatsApp/Signal, and manage everything from one control panel.
        </p>
        <div className="cta-row">
          <Link href="/register" className="solid-btn">Start Free Setup</Link>
          <Link href="/login" className="ghost-btn">I already have account</Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>What this project is</h3>
          <p>A cloud control layer for NeuralClaw. Users configure an agent in UI, and the platform provisions a dedicated runtime service automatically.</p>
        </article>
        <article className="feature-card">
          <h3>What we offer</h3>
          <p>One-click deployments, multi-channel bot setup, model/provider selection, status monitoring, and centralized agent operations.</p>
        </article>
        <article className="feature-card">
          <h3>Why it matters</h3>
          <p>No need to keep bots running on a laptop. Agents stay live in cloud and can later coordinate through mesh mode.</p>
        </article>
      </section>

      <section className="marketing-stack">
        <article className="market-card">
          <h2>Facilities you get</h2>
          <ul>
            <li>Dedicated service per agent deployment</li>
            <li>Provider support: OpenAI, Anthropic, OpenRouter, Local</li>
            <li>Channel connectors: Telegram, Discord, Slack, WhatsApp, Signal</li>
            <li>Secure token handling and provisioning pipeline</li>
            <li>Live status tracking for deployment and health</li>
          </ul>
        </article>

        <article className="market-card">
          <h2>How it works</h2>
          <ol>
            <li>Create account and configure agent details</li>
            <li>Choose plan, channels, model, and credentials</li>
            <li>Platform provisions a dedicated Railway instance</li>
            <li>You monitor and manage all agents from dashboard</li>
          </ol>
        </article>

        <article className="market-card highlight">
          <h2>Next-level mode: Agent Mesh</h2>
          <p>
            Mesh allows multiple agents to communicate and delegate tasks. Example: one Telegram bot can ask another specialist bot to research or analyze, then return a final answer.
          </p>
          <Link href="/register" className="solid-btn">Create Your First Agent</Link>
        </article>
      </section>
    </main>
  );
}
