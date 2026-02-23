"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CTAButton, Pill } from "@/components/ui";

const faqs = [
  { q: "Is billing live right now?", a: "No. Stripe is intentionally disabled while testing deployment/auth flows." },
  { q: "Can users still deploy?", a: "Yes. Users can register, login, and go through Railway one-click deployment." },
  { q: "Do I need Supabase?", a: "Not for this test setup. Auth runs with server-side cookie sessions and local user store." },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 flex items-center justify-between"
      >
        <Pill>pricing</Pill>
        <Link href="/" className="text-sm text-muted hover:text-text">Back</Link>
      </motion.div>

      <h1 className="text-4xl font-semibold">Operator-grade plans</h1>
      <p className="mt-3 max-w-2xl text-muted">Pricing UI is active; Stripe checkout is commented out for testing stage.</p>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="shell-card rounded-2xl p-6">
          <p className="font-mono-tech text-xs uppercase tracking-[0.16em] text-cyan">Monthly</p>
          <h2 className="mt-2 text-3xl font-semibold">$29</h2>
          <p className="text-muted">per month</p>
          <ul className="mt-4 space-y-2 text-sm text-text">
            <li>Private instance deployment</li>
            <li>Provider + channel onboarding</li>
            <li>Railway one-click handoff</li>
          </ul>
          <div className="mt-5"><CTAButton href="/onboard">Choose Monthly</CTAButton></div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="shell-card rounded-2xl border-cyan p-6 shadow-glow">
          <Pill>Best Value</Pill>
          <h2 className="mt-2 text-3xl font-semibold">$290</h2>
          <p className="text-muted">per year</p>
          <ul className="mt-4 space-y-2 text-sm text-text">
            <li>Everything in Monthly</li>
            <li>Priority deployment path</li>
            <li>Yearly operator savings</li>
          </ul>
          <div className="mt-5"><CTAButton href="/onboard">Choose Yearly</CTAButton></div>
        </motion.div>
      </section>

      <section className="mt-10 space-y-4">
        <h3 className="text-2xl font-semibold">FAQ</h3>
        {faqs.map((f, idx) => (
          <motion.div
            key={f.q}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.08, duration: 0.45 }}
            className="shell-card rounded-xl p-4"
          >
            <p className="font-medium">{f.q}</p>
            <p className="mt-1 text-sm text-muted">{f.a}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
