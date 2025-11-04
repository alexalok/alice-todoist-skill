import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

class InMemoryKV implements KVNamespace {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async put(key: string, value: string, _options?: KVNamespacePutOptions): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

function createEnv(): Env {
  return {
    TODOIST_CLIENT_ID: "client-id",
    TODOIST_CLIENT_SECRET: "client-secret",
    TODOIST_REDIRECT_URI: "https://example.com/oauth/callback",
    TOKENS: new InMemoryKV(),
  };
}

const executionContext: ExecutionContext = {
  waitUntil: () => {
    // noop for tests
  },
  passThroughOnException: () => {
    // noop for tests
  },
};

describe("Alice webhook", () => {
  it("requests account linking when Todoist token is missing", async () => {
    const env = createEnv();

    const requestPayload = {
      version: "1.0",
      meta: {
        locale: "ru-RU",
        timezone: "UTC",
      },
      session: {
        session_id: "test-session",
        message_id: 1,
        user_id: "user-1",
      },
      request: {
        command: "добавь купить молоко",
        original_utterance: "добавь купить молоко",
        type: "SimpleUtterance",
      },
    };

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as {
      response: {
        text: string;
        directives?: {
          account_linking?: Record<string, never>;
        };
        buttons?: Array<{ title: string; url?: string }>;
      };
    };

    expect(body.response.text).toContain("подключите Todoist");
    expect(body.response.directives?.account_linking).toEqual({});
    expect(body.response.buttons?.[0]?.url).toMatch(/\/oauth\/authorize\?state=/);

    const linkStateKey = env.TOKENS.keys().find((key) => key.startsWith("link:"));
    expect(linkStateKey).toBeDefined();
    const storedUserId = await env.TOKENS.get(linkStateKey!);
    expect(storedUserId).toBe("user-1");
  });
});

