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

const GREETING_MESSAGE = "Назовите задачу, и я добавлю её в ваш список дел в Todoist.";

describe("Alice webhook", () => {
  it("responds with greeting when no command is provided", async () => {
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
        command: "",
        original_utterance: "",
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
    const body = (await response.json()) as {
      response?: {
        text: string;
        end_session: boolean;
      };
      start_account_linking?: unknown;
    };

    expect(body.response).toMatchObject({
      text: GREETING_MESSAGE,
      end_session: false,
    });
    expect(body.start_account_linking).toBeUndefined();
  });

  it("responds with greeting for help commands", async () => {
    const helpCommands = ["Помощь", "Что ты умеешь?"];

    for (const command of helpCommands) {
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
          command,
          original_utterance: command,
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
      const body = (await response.json()) as {
        response?: {
          text: string;
          end_session: boolean;
        };
        start_account_linking?: unknown;
      };

      expect(body.response).toMatchObject({
        text: GREETING_MESSAGE,
        end_session: false,
      });
      expect(body.start_account_linking).toBeUndefined();
    }
  });

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

