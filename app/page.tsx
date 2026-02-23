"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CTAButton, Pill, TerminalCard } from "@/components/ui";

const features = [
  "Private instance provisioning",
  "Encrypted key onboarding",
  "Live channel gateway",
  "Operator-grade telemetry",
  "Secure policy defaults",
  "Railway one-click pipeline",
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="mb-12 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Pill>neural lynx</Pill>
          <span className="text-sm text-muted">NeuralClub</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted hover:text-text">Login</Link>
          <CTAButton href="/onboard">Start Deployment</CTAButton>
        </nav>
      </motion.header>

      <section className="grid gap-8 md:grid-cols-2 md:items-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <Pill>online</Pill>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
            Deploy NeuralClaw in one click.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted md:text-lg">
            Route users through your NeuralClub onboarding UI and into Railway deployment instantly.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CTAButton href="/onboard">Launch Private Instance</CTAButton>
            <CTAButton href="/pricing" secondary>View Pricing</CTAButton>
          </div>
        </motion.div>

        <TerminalCard
          label="neural-init.log"
          lines={[
            "$ neuralclub onboard",
            "[ok] auth session validated",
            "[ok] provider selected: openai",
            "[ok] channels selected",
            "[ok] railway deployment handoff ready",
          ]}
        />
      </section>

      <div className="section-divider my-12" />

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((feature, idx) => (
          <motion.div
            key={feature}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.08, duration: 0.5 }}
            className="shell-card rounded-xl p-4"
          >
            <div className="font-mono-tech text-xs uppercase tracking-[0.18em] text-cyan">feature {idx + 1}</div>
            <p className="mt-2 text-sm text-text">{feature}</p>
          </motion.div>
        ))}
      </section>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mt-12 rounded-2xl border border-borderc bg-sky-400/5 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono-tech text-xs uppercase tracking-[0.16em] text-cyan">deployment trust</p>
            <h2 className="mt-1 text-2xl font-semibold">Railway-ready flow through your own UI</h2>
          </div>
          <CTAButton href="/onboard">Deploy Now</CTAButton>
        </div>
      </motion.section>
    </main>
  );
}
