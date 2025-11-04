import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

const env: Env = {};

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
      start_account_linking?: Record<string, never>;
      response?: unknown;
    };

    expect(body.start_account_linking).toEqual({});
    expect(body.response).toBeUndefined();
  });
});

