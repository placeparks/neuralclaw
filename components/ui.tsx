"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { PropsWithChildren } from "react";

export function Pill({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex items-center rounded-full border border-borderc bg-sky-400/10 px-3 py-1 text-xs uppercase tracking-wide text-cyan">
      {children}
    </span>
  );
}

export function CTAButton({
  href,
  children,
  secondary,
}: PropsWithChildren<{ href: string; secondary?: boolean }>) {
  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
      <Link
        href={href}
        className={
          secondary
            ? "inline-flex rounded-full border border-borderc px-5 py-2 text-sm text-text hover:border-cyan"
            : "inline-flex rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-[#03101f] shadow-glow"
        }
      >
        {children}
      </Link>
    </motion.div>
  );
}

export function TerminalCard({
  label,
  lines,
}: {
  label: string;
  lines: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="shell-card rounded-2xl"
    >
      <div className="flex items-center justify-between border-b border-borderc/70 px-4 py-3">
        <div className="flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        </div>
        <span className="font-mono-tech text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      </div>
      <div className="space-y-2 p-4 font-mono-tech text-sm text-cyan/90">
        {lines.map((line, i) => (
          <motion.div
            key={line + i}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
          >
            {line}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
