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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredUser()) router.replace("/dashboard");
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        setStoredUser(data.user);
        router.push("/dashboard");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Login failed");
        setLoading(false);
      });
  }

  return (
    <main className="auth-wrap">
      <div className="auth-bg-grid" />

      {/* floating orbs */}
      <div style={{
        position: "absolute", width: 340, height: 340, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,149,0,0.12) 0%, transparent 70%)",
        top: "10%", left: "5%", filter: "blur(40px)", pointerEvents: "none",
        animation: "drift 10s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)",
        bottom: "10%", right: "5%", filter: "blur(40px)", pointerEvents: "none",
        animation: "drift 12s ease-in-out infinite reverse",
      }} />

      <div className="auth-card" style={{ position: "relative", zIndex: 1 }}>
        <div className="auth-logo-row">
          <span className="auth-logo-icon">◈</span>
          NEURALCLAW
        </div>

        <h1 className="auth-title">Welcome back.</h1>
        <p className="auth-sub">Sign in to your agent control panel.</p>

        <form onSubmit={onSubmit}>
          {error && (
            <div className="auth-error">
              <span>⚠</span> {error}
            </div>
          )}

          <div className="auth-input-wrap">
            <label className="auth-input-label">Email</label>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="auth-input-wrap">
            <label className="auth-input-label">Password</label>
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p className="auth-divider">
          No account?{" "}
          <Link href="/register">Create one free</Link>
        </p>
      </div>
    </main>
  );
}
