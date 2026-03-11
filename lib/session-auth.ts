import { createHash, createHmac, randomBytes } from "crypto";

type ChatGPTFlowState = {
  provider: "chatgpt";
  state: string;
  redirectUri: string;
  codeVerifier: string;
  issuedAt: number;
};

export type OAuthCredentialPayload = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: "oauth" | "session_key" | "cookie";
  provider: "chatgpt" | "claude";
};

const FLOW_TTL_MS = 15 * 60 * 1000;
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_SCOPE = "openid profile email offline_access";
const OPENAI_REDIRECT_URI = "http://localhost:1455/callback";

function requireSecret(): string {
  const secret = process.env.DEPLOYMENT_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing DEPLOYMENT_TOKEN_SECRET");
  }
  return secret;
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (input.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signFlowPayload(payload: string): string {
  return base64urlEncode(createHmac("sha256", requireSecret()).update(payload).digest());
}

function buildCodeChallenge(verifier: string): string {
  return base64urlEncode(createHash("sha256").update(verifier).digest());
}

export function createChatGPTFlow(): { authUrl: string; flowToken: string; redirectUri: string } {
  const state = base64urlEncode(randomBytes(24));
  const codeVerifier = base64urlEncode(randomBytes(48));
  const redirectUri = OPENAI_REDIRECT_URI;

  const payloadObj: ChatGPTFlowState = {
    provider: "chatgpt",
    state,
    redirectUri,
    codeVerifier,
    issuedAt: Date.now(),
  };

  const payload = base64urlEncode(JSON.stringify(payloadObj));
  const signature = signFlowPayload(payload);
  const flowToken = `${payload}.${signature}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: OPENAI_SCOPE,
    code_challenge: buildCodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
  });

  return {
    authUrl: `${OPENAI_AUTH_URL}?${params.toString()}`,
    flowToken,
    redirectUri,
  };
}

function readChatGPTFlow(flowToken: string): ChatGPTFlowState {
  const [payload, signature] = flowToken.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid flow token.");
  }
  if (signFlowPayload(payload) !== signature) {
    throw new Error("Invalid flow signature.");
  }

  const parsed = JSON.parse(base64urlDecode(payload)) as ChatGPTFlowState;
  if (parsed.provider !== "chatgpt") {
    throw new Error("Unsupported auth provider.");
  }
  if (Date.now() - parsed.issuedAt > FLOW_TTL_MS) {
    throw new Error("Auth link expired. Start again.");
  }
  return parsed;
}

export async function exchangeChatGPTCallback(flowToken: string, callbackUrlOrCode: string): Promise<OAuthCredentialPayload> {
  const flow = readChatGPTFlow(flowToken);
  const raw = callbackUrlOrCode.trim();
  if (!raw) {
    throw new Error("Callback URL is required.");
  }

  let code = raw;
  let state = flow.state;

  if (raw.includes("://")) {
    const parsed = new URL(raw);
    code = parsed.searchParams.get("code") ?? "";
    state = parsed.searchParams.get("state") ?? "";
    const error = parsed.searchParams.get("error");
    if (error) {
      throw new Error(`OpenAI auth failed: ${error}`);
    }
  }

  if (!code) {
    throw new Error("Authorization code missing from callback URL.");
  }
  if (state !== flow.state) {
    throw new Error("State mismatch. Start the auth flow again.");
  }

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: OPENAI_CLIENT_ID,
      code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI token exchange failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("OpenAI token exchange succeeded but no access token was returned.");
  }

  return {
    provider: "chatgpt",
    token_type: "oauth",
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expires_at: Date.now() / 1000 + (data.expires_in ?? 3600),
  };
}

export function serializeCredential(credential: OAuthCredentialPayload): string {
  return JSON.stringify(credential);
}

export function extractClaudeSessionCredential(rawInput: string): string {
  const input = rawInput.trim();
  if (!input) {
    throw new Error("Claude session input is required.");
  }

  const directMatch = input.match(/(?:^|[;\s])sessionKey=([^;\s]+)/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const jsonCookieMatch = input.match(/"name"\s*:\s*"sessionKey"[\s\S]*?"value"\s*:\s*"([^"]+)"/i);
  if (jsonCookieMatch?.[1]) {
    return jsonCookieMatch[1];
  }

  const tabularMatch = input.match(/sessionKey[\s:=\t]+([^\s;]+)/i);
  if (tabularMatch?.[1]) {
    return tabularMatch[1];
  }

  if (!/[=\s]/.test(input) && input.length > 20) {
    return input;
  }

  throw new Error("Could not extract a Claude sessionKey. Paste the raw sessionKey or a cookie string containing sessionKey=...");
}
