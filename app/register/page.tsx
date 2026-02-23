"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setStatus("Enter email and password.");
      return;
    }

    try {
      setLoading(true);
      await registerUser(email, password);
      setStatus("Account created. Redirecting...");
      router.push("/onboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-2 md:px-8">
      <motion.div
        className="hidden md:block"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
      >
        <div className="shell-card rounded-2xl p-5 font-mono-tech text-sm text-cyan">
          <p>$ neuralclub auth --register</p>
          <p className="mt-2">[ok] operator profile created</p>
          <p>[ok] deployment queue available</p>
          <p className="mt-4 animate-pulse text-xs text-muted">signal: account-ready</p>
        </div>
      </motion.div>

      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="shell-card rounded-2xl p-6"
      >
        <h1 className="text-3xl font-semibold">Register</h1>
        <p className="mt-2 text-sm text-muted">Create your NeuralClub operator account.</p>

        <div className="mt-5 space-y-3">
          <input
            className="w-full rounded-lg border border-borderc bg-[#061024] px-4 py-3 text-sm outline-none focus:border-cyan"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-lg border border-borderc bg-[#061024] px-4 py-3 text-sm outline-none focus:border-cyan"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          disabled={loading}
          className="mt-5 w-full rounded-full bg-cyan px-5 py-3 text-sm font-semibold text-[#03101f] disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Account"}
        </motion.button>
        <p className="mt-4 text-sm text-muted">
          Already have an account? <Link href="/login" className="text-cyan">Login</Link>
        </p>
        {status ? <p className="mt-3 text-sm text-cyan">{status}</p> : null}
      </motion.form>
    </main>
  );
}
