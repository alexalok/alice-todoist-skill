import type { Env } from "./types/env";

interface TodoistStatePayload {
  userId: string;
}

const STATE_TTL_SECONDS = 600;
const LINK_STATE_PREFIX = "link";
const TODOIST_STATE_PREFIX = "todoist";

export function buildTodoistAuthorizeUrl(
  env: Env,
  todoistState: string,
): string {
  const params = new URLSearchParams({
    client_id: env.TODOIST_CLIENT_ID,
    scope: "data:read_write",
    state: todoistState,
    redirect_uri: env.TODOIST_REDIRECT_URI,
  });

  return `https://todoist.com/oauth/authorize?${params.toString()}`;
}

export function generateState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function storeLinkState(env: Env, state: string, userId: string): Promise<void> {
  await env.TOKENS.put(`${LINK_STATE_PREFIX}:${state}`, userId, {
    expirationTtl: STATE_TTL_SECONDS,
  });
}

export async function consumeLinkState(env: Env, state: string): Promise<string | null> {
  const userId = await env.TOKENS.get(`${LINK_STATE_PREFIX}:${state}`);
  if (!userId) {
    return null;
  }
  await env.TOKENS.delete(`${LINK_STATE_PREFIX}:${state}`);
  return userId;
}

export async function rememberTodoistState(env: Env, key: string, payload: TodoistStatePayload): Promise<void> {
  await env.TOKENS.put(`${TODOIST_STATE_PREFIX}:${key}`, JSON.stringify(payload), {
    expirationTtl: STATE_TTL_SECONDS,
  });
}

export async function consumeTodoistState(env: Env, key: string): Promise<TodoistStatePayload | null> {
  const stored = await env.TOKENS.get(`${TODOIST_STATE_PREFIX}:${key}`);
  if (!stored) {
    return null;
  }
  await env.TOKENS.delete(`${TODOIST_STATE_PREFIX}:${key}`);
  try {
    return JSON.parse(stored) as TodoistStatePayload;
  } catch (error) {
    console.error("Failed to parse stored Todoist state", error);
    return null;
  }
}

export async function exchangeCodeForToken(
  env: Env,
  code: string,
): Promise<string> {
  const response = await fetch("https://todoist.com/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.TODOIST_CLIENT_ID,
      client_secret: env.TODOIST_CLIENT_SECRET,
      code,
      redirect_uri: env.TODOIST_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OAuth token exchange failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as { access_token: string };
  if (!data.access_token) {
    throw new Error("OAuth token exchange response missing access_token");
  }
  return data.access_token;
}

export async function storeToken(env: Env, userId: string, token: string): Promise<void> {
  await env.TOKENS.put(`token:${userId}`, token);
}

export async function getToken(env: Env, userId: string): Promise<string | null> {
  return env.TOKENS.get(`token:${userId}`);
}

export async function deleteToken(env: Env, userId: string): Promise<void> {
  await env.TOKENS.delete(`token:${userId}`);
}

