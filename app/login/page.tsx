"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getStoredUser, setStoredUser } from "@/lib/session-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (getStoredUser()) router.replace("/app");
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const existing = getStoredUser();
    if (!existing) {
      setError("No account found. Please register first.");
      return;
    }
    if (existing.email !== email.trim() || existing.password !== password) {
      setError("Invalid credentials.");
      return;
    }
    setStoredUser(existing);
    router.push("/app");
  }

  return (
    <main className="auth-wrap">
      <div className="bg-orb orb-a" />
      <div className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to NeuralClaw</h1>
        <form onSubmit={onSubmit} className="form-stack">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="status err">{error}</div>}
          <button className="solid-btn full" type="submit">Sign in</button>
        </form>
        <p className="muted">No account? <Link href="/register">Register</Link></p>
      </div>
    </main>
  );
}
