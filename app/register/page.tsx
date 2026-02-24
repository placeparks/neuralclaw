"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStoredUser } from "@/lib/session-client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || password.length < 6) {
      setError("Enter a valid name, email, and password (min 6 chars).");
      return;
    }
    setError("");
    setLoading(true);
    fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        setStoredUser(data.user);
        router.push("/onboard");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Registration failed");
        setLoading(false);
      });
  }

  return (
    <main className="auth-wrap">
      <div className="auth-bg-grid" />

      {/* floating orbs */}
      <div style={{
        position: "absolute", width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)",
        top: "5%", right: "8%", filter: "blur(50px)", pointerEvents: "none",
        animation: "drift 11s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,149,0,0.1) 0%, transparent 70%)",
        bottom: "8%", left: "5%", filter: "blur(40px)", pointerEvents: "none",
        animation: "drift 9s ease-in-out infinite reverse",
      }} />

      <div className="auth-card" style={{ position: "relative", zIndex: 1 }}>
        <div className="auth-logo-row">
          <span className="auth-logo-icon">◈</span>
          NEURALCLAW
        </div>

        <h1 className="auth-title">Create your workspace.</h1>
        <p className="auth-sub">Deploy your first agent in under 60 seconds.</p>

        <form onSubmit={onSubmit}>
          {error && (
            <div className="auth-error">
              <span>⚠</span> {error}
            </div>
          )}

          <div className="auth-input-wrap">
            <label className="auth-input-label">Name</label>
            <input
              className="auth-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
            />
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <p className="auth-divider">
          Already have an account?{" "}
          <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
