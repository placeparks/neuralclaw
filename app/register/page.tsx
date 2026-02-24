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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || password.length < 6) {
      setError("Enter valid name, email and password (min 6 chars).");
      return;
    }
    setStoredUser({ name: name.trim(), email: email.trim(), password });
    router.push("/onboard");
  }

  return (
    <main className="auth-wrap">
      <div className="bg-orb orb-b" />
      <div className="auth-card">
        <p className="eyebrow">Create your workspace</p>
        <h1>Register your account</h1>
        <form onSubmit={onSubmit} className="form-stack">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="status err">{error}</div>}
          <button className="solid-btn full" type="submit">Create account</button>
        </form>
        <p className="muted">Already have account? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
