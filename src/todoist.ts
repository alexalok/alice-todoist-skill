import type { Env } from "./types/env";

const TODOIST_API_BASE = "https://api.todoist.com/rest/v2";

export class TodoistApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "TodoistApiError";
    this.status = status;
    this.details = details;
  }
}

export async function addTask(
  env: Env,
  accessToken: string,
  content: string,
): Promise<string> {
  const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Request-Id": crypto.randomUUID(),
      "User-Agent": "alice-todoist-skill/0.1.0",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch (error) {
      details = await response.text();
    }
    throw new TodoistApiError("Todoist API request failed", response.status, details);
  }

  const result = (await response.json()) as { id: string; content: string };
  return result.content;
}

export function isTodoistUnauthorized(error: unknown): boolean {
  return error instanceof TodoistApiError && error.status === 401;
}

