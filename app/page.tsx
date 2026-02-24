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
        <p className="eyebrow">One-click agent deployment</p>
        <h1>Launch, control and mesh your AI agents from one dashboard.</h1>
        <p className="hero-copy">
          Build your own always-online NeuralClaw bots on Railway. Configure channels, track health, and scale from single agent to multi-agent mesh.
        </p>
        <div className="cta-row">
          <Link href="/register" className="solid-btn">Start Free Setup</Link>
          <Link href="/login" className="ghost-btn">I already have account</Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Dedicated instances</h3>
          <p>Each deployment gets its own Railway service and isolated config.</p>
        </article>
        <article className="feature-card">
          <h3>Channel-ready agents</h3>
          <p>Telegram, Discord, Slack, WhatsApp and Signal setup from one place.</p>
        </article>
        <article className="feature-card">
          <h3>Mesh mode</h3>
          <p>Connect agents so they can delegate tasks and collaborate.</p>
        </article>
      </section>
    </main>
  );
}
