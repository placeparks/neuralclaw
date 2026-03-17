import Link from "next/link";
import {
  COMPANION_FEATURES,
  COMPANION_SETUP_STEPS,
  COMPANION_VERSION,
  COMPANION_WINDOWS_DOWNLOAD,
} from "@/lib/companion";

export default function CompanionPage() {
  return (
    <main className="site">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <header className="topbar">
        <div className="logo">NEURALCLAW // COMPANION</div>
        <div className="top-actions">
          <Link href="/dashboard" className="ghost-btn">
            Dashboard
          </Link>
          <Link href="/register" className="solid-btn">
            Deploy Agent
          </Link>
        </div>
      </header>

      <section className="hero-block">
        <p className="eyebrow">Local Device Control</p>
        <h1>Give your hosted agent a real machine to operate.</h1>
        <p className="hero-copy">
          NeuralClaw Companion is the desktop app that lets Discord and Telegram
          agents open a visible browser, launch apps, inspect the local machine,
          and execute real device-bound tasks without asking the user to run a
          terminal command.
        </p>
        <div className="cta-row">
          <a className="solid-btn" href={COMPANION_WINDOWS_DOWNLOAD} download>
            Download Windows EXE
          </a>
          <Link href="/dashboard" className="ghost-btn">
            Open Dashboard
          </Link>
        </div>
      </section>

      <section className="grid companion-grid">
        <article className="card">
          <h2>What the Companion adds</h2>
          <div className="companion-list">
            {COMPANION_FEATURES.map((item) => (
              <div className="companion-list-item" key={item}>
                <span className="companion-bullet">◆</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card companion-download-card">
          <p className="panel-label">Build</p>
          <h2 style={{ marginTop: 0 }}>Windows Installer</h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>
            Version {COMPANION_VERSION}. This first release is an unsigned
            Windows desktop installer. Mac and Linux packages can be added
            later from the same companion project.
          </p>
          <div className="cta-row" style={{ marginTop: 16 }}>
            <a className="solid-btn full" href={COMPANION_WINDOWS_DOWNLOAD} download>
              Download NeuralClaw Companion
            </a>
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            Current status: download flow is live; device pairing and presence
            routing are the next backend step.
          </p>
        </article>
      </section>

      <section className="card companion-steps-card">
        <h2>How it fits your stack</h2>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          The hosted Railway agent remains the always-on brain. The companion
          runs on the user&apos;s computer and receives local-only tasks such as
          opening Chrome, launching software, or inspecting the local desktop.
          That keeps the user experience simple while preserving a clean
          separation between cloud automation and machine control.
        </p>
        <div className="companion-steps">
          {COMPANION_SETUP_STEPS.map((step, index) => (
            <div className="companion-step" key={step}>
              <span className="companion-step-num">{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
