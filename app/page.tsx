"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CORTICES = [
  {
    icon: "👁",
    name: "PERCEPTION",
    color: "#FF9500",
    tag: "INTAKE · CLASSIFY · SCREEN",
    desc: "Zero-trust threat screening before any LLM call. 25+ injection patterns blocked in milliseconds.",
  },
  {
    icon: "🧠",
    name: "MEMORY",
    color: "#00E5FF",
    tag: "EPISODIC · SEMANTIC · PROCEDURAL",
    desc: "SQLite+FTS5 episodic store, entity knowledge graph, and trigger-pattern procedure templates.",
  },
  {
    icon: "⚡",
    name: "REASONING",
    color: "#FF9500",
    tag: "FAST · DELIBERATE · REFLECTIVE",
    desc: "Three tiers: instant pattern match, deliberate LLM loop, multi-step decompose-critique-revise.",
  },
  {
    icon: "🛡",
    name: "ACTION",
    color: "#00E5FF",
    tag: "SANDBOX · POLICY · AUDIT",
    desc: "Sandboxed subprocess execution, capability-based permissions, full audit trail with secret redaction.",
  },
  {
    icon: "🔬",
    name: "EVOLUTION",
    color: "#8B5CF6",
    tag: "CALIBRATE · DISTILL · SYNTHESIZE",
    desc: "Learns your style, distills experiences into lasting knowledge, synthesizes new skills from failures.",
  },
];

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [agentCount, setAgentCount] = useState(0);

  /* ── Neural network canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const N = 90;
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.4 + 0.4,
      pulse: Math.random() * Math.PI * 2,
      ps: 0.012 + Math.random() * 0.018,
      cyan: Math.random() > 0.78,
    }));

    let mx = -999, my = -999;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener("mousemove", onMove);

    let raf: number;
    function frame() {
      ctx.clearRect(0, 0, W, H);

      nodes.forEach((n) => {
        const dx = mx - n.x, dy = my - n.y;
        const d = Math.hypot(dx, dy);
        if (d < 180) { n.vx += dx * 0.00012; n.vy += dy * 0.00012; }
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 0.85) { n.vx *= 0.85 / sp; n.vy *= 0.85 / sp; }
        n.x = ((n.x + n.vx) + W) % W;
        n.y = ((n.y + n.vy) + H) % H;
        n.pulse += n.ps;
      });

      // Connections
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d < 135) {
            const a = (1 - d / 135) * 0.22;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255,149,0,${a})`;
            ctx.lineWidth = (1 - d / 135) * 0.75;
            ctx.stroke();
          }
        }
      }

      // Nodes
      nodes.forEach((n) => {
        const p = (Math.sin(n.pulse) + 1) / 2;
        const c = n.cyan ? "0,229,255" : "255,149,0";
        // glow
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 7);
        g.addColorStop(0, `rgba(${c},${0.25 + p * 0.35})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 7, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.fillStyle = `rgba(${c},${0.65 + p * 0.35})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(frame);
    }
    frame();

    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* ── Counter animation ── */
  useEffect(() => {
    const target = 3142;
    const dur = 2200;
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAgentCount(Math.floor(ease * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    const id = setTimeout(() => requestAnimationFrame(tick), 400);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="land">
      <canvas ref={canvasRef} className="land-canvas" />

      {/* ── Navigation ── */}
      <nav className="land-nav">
        <div className="land-logo">
          <span className="land-logo-mark">◈</span>
          NEURALCLAW
        </div>
        <div className="land-nav-links">
          <Link href="/login" className="land-ghost-btn">Sign in</Link>
          <Link href="/register" className="land-solid-btn">Deploy Agent →</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="land-hero">
        <div className="land-live-badge">
          <span className="land-pulse-dot" />
          {agentCount.toLocaleString()} AGENTS ACTIVE GLOBALLY
        </div>

        <h1 className="land-headline">
          <span className="land-glitch" data-text="DEPLOY AI">DEPLOY AI</span>
          <br />
          <span className="land-headline-accent">AGENTS THAT</span>
          <br />
          <span className="land-glitch" data-text="NEVER SLEEP">NEVER SLEEP</span>
        </h1>

        <p className="land-subhead">
          Self-evolving agents with 5 cognitive cortices, zero-trust security,
          multi-channel presence, and swarm intelligence — live in 60 seconds.
        </p>

        <div className="land-cta-row">
          <Link href="/register" className="land-primary-btn">
            Deploy Your Agent <span>→</span>
          </Link>
          <a href="#architecture" className="land-secondary-btn">
            Explore Architecture
          </a>
        </div>

        <div className="land-scroll-hint">
          <div className="land-scroll-line" />
          <span>SCROLL</span>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="land-ticker-wrap">
        <div className="land-ticker">
          {Array(3).fill(null).map((_, i) => (
            <span key={i} className="land-ticker-inner">
              ZERO-TRUST SECURITY &nbsp;•&nbsp;
              5 COGNITIVE CORTICES &nbsp;•&nbsp;
              6 CHANNEL ADAPTERS &nbsp;•&nbsp;
              AGENT MESH NETWORKING &nbsp;•&nbsp;
              SELF-EVOLVING AI &nbsp;•&nbsp;
              RAILWAY CLOUD DEPLOY &nbsp;•&nbsp;
              REAL-TIME AUDIT LOG &nbsp;•&nbsp;
              SKILL MARKETPLACE &nbsp;•&nbsp;
              SWARM CONSENSUS &nbsp;•&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── Architecture ── */}
      <section id="architecture" className="land-section">
        <p className="land-eyebrow">The Cognitive Stack</p>
        <h2 className="land-section-title">Five Cortices.<br />One Neural Bus.</h2>
        <p className="land-section-sub">
          Every message flows through a security-first pipeline before the LLM ever sees it.
          Each cortex publishes and subscribes to events on the shared async bus.
        </p>

        <div className="land-cortex-flow">
          {["PERCEPTION", "MEMORY", "REASONING", "ACTION", "EVOLUTION"].map((c, i) => (
            <div key={c} className="land-cortex-flow-node">
              <div className="land-flow-node-box">{c}</div>
              {i < 4 && <div className="land-flow-arrow">⟶</div>}
            </div>
          ))}
        </div>

        <div className="land-cortex-grid">
          {CORTICES.map((c) => (
            <div
              key={c.name}
              className="land-cortex-card"
              style={{ "--card-color": c.color } as React.CSSProperties}
            >
              <span className="land-card-icon">{c.icon}</span>
              <p className="land-card-tag">{c.tag}</p>
              <h3 className="land-card-title">{c.name}</h3>
              <p className="land-card-desc">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mesh ── */}
      <section className="land-section land-mesh-section">
        <div className="land-mesh-content">
          <p className="land-eyebrow">Swarm Intelligence</p>
          <h2 className="land-section-title">Agents that delegate, coordinate, and collaborate.</h2>
          <p className="land-section-sub">
            One agent can ask another to research, summarize, or execute — then synthesize
            a final answer. Connect any agents with typed permissions: delegate, read_only, or blocked.
          </p>
          <Link href="/register" className="land-primary-btn" style={{ display: "inline-flex", marginTop: 24 }}>
            Build Your Mesh →
          </Link>
        </div>

        <div className="land-mesh-viz">
          <div className="land-mesh-lines">
            <svg viewBox="0 0 280 280" className="land-mesh-svg">
              <line x1="140" y1="140" x2="140" y2="28" stroke="rgba(255,149,0,0.35)" strokeWidth="1" strokeDasharray="5 4">
                <animate attributeName="stroke-dashoffset" values="0;-18" dur="1s" repeatCount="indefinite" />
              </line>
              <line x1="140" y1="140" x2="252" y2="140" stroke="rgba(0,229,255,0.35)" strokeWidth="1" strokeDasharray="5 4">
                <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.3s" repeatCount="indefinite" />
              </line>
              <line x1="140" y1="140" x2="140" y2="252" stroke="rgba(255,149,0,0.35)" strokeWidth="1" strokeDasharray="5 4">
                <animate attributeName="stroke-dashoffset" values="0;-18" dur="0.9s" repeatCount="indefinite" />
              </line>
              <line x1="140" y1="140" x2="28" y2="140" stroke="rgba(0,229,255,0.35)" strokeWidth="1" strokeDasharray="5 4">
                <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.1s" repeatCount="indefinite" />
              </line>
            </svg>
          </div>
          <div className="land-mesh-node land-mesh-hub">HUB</div>
          <div className="land-mesh-node land-mesh-peer" style={{ "--delay": "0s" } as React.CSSProperties}>SEARCH</div>
          <div className="land-mesh-node land-mesh-peer" style={{ "--delay": "0.6s" } as React.CSSProperties}>ANALYST</div>
          <div className="land-mesh-node land-mesh-peer" style={{ "--delay": "1.2s" } as React.CSSProperties}>CODER</div>
          <div className="land-mesh-node land-mesh-peer" style={{ "--delay": "1.8s" } as React.CSSProperties}>WRITER</div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="land-section">
        <p className="land-eyebrow">What You Get</p>
        <h2 className="land-section-title" style={{ marginBottom: 40 }}>Everything built in.</h2>
        <div className="land-feature-row">
          {[
            { label: "6 Channels", desc: "Telegram, Discord, Slack, WhatsApp, Signal, Web Chat" },
            { label: "4 Providers", desc: "OpenAI, Anthropic, OpenRouter, Local Ollama — with circuit breaker fallback" },
            { label: "Railway Deploy", desc: "One-click cloud provisioning, env injection, live status tracking" },
            { label: "Zero-Trust", desc: "Pre-LLM screening, policy engine, audit logs, OS keychain for keys" },
          ].map((f) => (
            <div key={f.label} className="land-feat-tile">
              <h4>{f.label}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="land-cta-section">
        <div className="land-cta-glow" />
        <p className="land-eyebrow">Ready?</p>
        <h2 className="land-cta-title">Your AI agent empire<br />starts here.</h2>
        <p className="land-cta-sub">Configure, deploy, and forget. Your agents work while you sleep.</p>
        <div className="land-cta-row" style={{ justifyContent: "center", marginTop: 40 }}>
          <Link href="/register" className="land-primary-btn land-primary-btn-xl">
            Start Building Free →
          </Link>
          <Link href="/login" className="land-secondary-btn">
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="land-footer">
        <span>© 2026 NeuralClaw · MIT License</span>
        <span className="land-footer-tag">v0.4.0</span>
      </footer>
    </div>
  );
}
