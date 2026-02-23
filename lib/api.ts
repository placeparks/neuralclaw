export type DeployPayload = {
  plan: string;
  provider: string;
  channels: string[];
  providerApiKey?: string;
};

async function parse(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || "Request failed");
  }
  return json as Record<string, unknown>;
}

export async function registerUser(email: string, password: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parse(res);
}

export async function loginUser(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parse(res);
}

export async function me() {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  return parse(res);
}

export async function logoutUser() {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  return parse(res);
}

export async function deployNeuralClaw(payload: DeployPayload) {
  const res = await fetch("/api/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse(res);
}

export async function getDeploymentStatus() {
  const res = await fetch("/api/deploy/status", {
    method: "GET",
    cache: "no-store",
  });
  return parse(res);
}

export async function getDashboard() {
  const res = await fetch("/api/dashboard", { cache: "no-store" });
  return parse(res);
}
