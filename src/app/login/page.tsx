"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }
      const next = new URL(window.location.href).searchParams.get("next");
      window.location.assign(next?.startsWith("/") ? next : "/");
    } catch {
      setError("The login request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-kicker">PROGRAMMING CLUB / ADMIN</p>
        <h1 id="login-title">Private workspace</h1>
        <p className="auth-intro">Enter the admin password to edit the club website content.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy || !password}>
            {busy ? "Checking…" : "Enter admin panel"}
          </button>
        </form>
        <p className="auth-note">Access is limited to people who have the shared password.</p>
      </section>
    </main>
  );
}
