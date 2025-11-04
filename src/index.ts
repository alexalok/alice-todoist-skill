import { Router, error } from "itty-router";
import type {
  AliceRequest,
  AliceResponse,
  AliceSpeechResponse,
  AliceStartAccountLinkingResponse,
} from "./types/alice";
import type { Env } from "./types/env";
import { addTask, isTodoistUnauthorized } from "./todoist";

const router = Router();

router.get("/health", () => new Response("ok", { status: 200 }));

router.post("/webhook", async (request: Request, _env: Env) => {
  let payload: AliceRequest;
  try {
    payload = (await request.json()) as AliceRequest;
  } catch (parseError) {
    console.error("Failed to parse Alice request", parseError);
    return new Response("Invalid JSON", { status: 400 });
  }

  const userId = payload.session.user?.user_id ?? payload.session.user_id;
  if (!userId) {
    return jsonResponse(buildSpeechResponse(payload, {
      text: "Не удалось определить пользователя. Попробуйте позже.",
      end_session: true,
    }));
  }

  const commandText = (payload.request.original_utterance || payload.request.command || "").trim();
  if (!commandText) {
    return jsonResponse(buildSpeechResponse(payload, {
      text: "Что добавить в Todoist?",
      end_session: false,
    }));
  }

  const token = extractAccessToken(request, payload);
  if (!token) {
    return jsonResponse(buildStartAccountLinkingResponse(payload));
  }

  try {
    const taskName = await addTask(token, commandText);
    return jsonResponse(
      buildSpeechResponse(payload, {
        text: `Задача «${taskName}» добавлена в Todoist.`,
        end_session: true,
      }),
    );
  } catch (apiError) {
    console.error("Failed to add Todoist task", apiError);

    if (isTodoistUnauthorized(apiError)) {
      return jsonResponse(buildStartAccountLinkingResponse(payload));
    }

    return jsonResponse(
      buildSpeechResponse(payload, {
        text: "Произошла ошибка при добавлении задачи. Попробуйте ещё раз позже.",
        end_session: false,
      }),
    );
  }
});

router.all("*", () => new Response("Not Found", { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    if (request.bodyUsed) {
      console.warn(`[${requestId}] Request body already used before logging.`);
    } else {
      const requestClone = request.clone();
      ctx.waitUntil(logIncomingRequest(requestId, requestClone));
    }

    try {
      const response = await router.handle(request, env, ctx);
      const durationMs = Date.now() - startTime;
      ctx.waitUntil(logOutgoingResponse(requestId, response.clone(), durationMs));
      return response;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      console.error(`[${requestId}] Handler threw before producing a response`, serializeError(err));
      const response = error(err as Error);
      ctx.waitUntil(logOutgoingResponse(requestId, response.clone(), durationMs, err));
      return response;
    }
  },
};

function buildSpeechResponse(
  request: AliceRequest,
  response: AliceSpeechResponse["response"],
): AliceSpeechResponse {
  return {
    version: request.version,
    session: {
      session_id: request.session.session_id,
      message_id: request.session.message_id,
      user_id: request.session.user_id,
    },
    response,
  };
}

function buildStartAccountLinkingResponse(
  request: AliceRequest,
): AliceStartAccountLinkingResponse {
  return {
    version: request.version,
    session: {
      session_id: request.session.session_id,
      message_id: request.session.message_id,
      user_id: request.session.user_id,
    },
    start_account_linking: {},
  };
}

function jsonResponse(payload: AliceResponse): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function extractAccessToken(request: Request, payload: AliceRequest): string | null {
  const headerValue = request.headers.get("Authorization");
  if (headerValue) {
    const match = headerValue.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      return match[1];
    }
  }

  return payload.session.user?.access_token ?? null;
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function logIncomingRequest(requestId: string, request: Request): Promise<void> {
  try {
    const headers = sanitizeHeaders(request.headers);
    const body = await extractBodySnapshot(request.headers, () => request.text());
    console.log(`[${requestId}] Incoming request`, {
      method: request.method,
      url: request.url,
      headers,
      body,
    });
  } catch (logError) {
    console.warn(`[${requestId}] Failed to log request`, serializeError(logError));
  }
}

async function logOutgoingResponse(
  requestId: string,
  response: Response,
  durationMs: number,
  originalError?: unknown,
): Promise<void> {
  try {
    const headers = sanitizeHeaders(response.headers);
    const body = await extractBodySnapshot(response.headers, () => response.text());
    const logPayload: Record<string, unknown> = {
      status: response.status,
      durationMs,
      headers,
      body,
    };

    if (originalError) {
      logPayload.error = serializeError(originalError);
    }

    console.log(`[${requestId}] Outgoing response`, logPayload);
  } catch (logError) {
    console.warn(`[${requestId}] Failed to log response`, serializeError(logError));
  }
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      sanitized[key] = maskSensitiveValue(value);
    } else {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

async function extractBodySnapshot(headers: Headers, read: () => Promise<string>): Promise<unknown> {
  const contentType = headers.get("content-type") ?? "";
  if (!contentType) {
    return undefined;
  }

  try {
    const raw = await read();
    if (!raw) {
      return undefined;
    }

    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(raw);
        return sanitizePayload(parsed);
      } catch {
        return truncate(raw);
      }
    }

    if (contentType.startsWith("text/")) {
      return truncate(raw);
    }

    return `[${contentType} body omitted]`;
  } catch (readError) {
    return { error: `Failed to read body: ${String(readError)}` };
  }
}

function sanitizePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item));
  }

  if (payload && typeof payload === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (SENSITIVE_BODY_KEYS.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizePayload(value);
      }
    }
    return result;
  }

  return payload;
}

function maskSensitiveValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const bearerMatch = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (bearerMatch) {
    return `${bearerMatch[1]} ${maskToken(bearerMatch[2])}`;
  }

  return maskToken(trimmed);
}

function maskToken(token: string): string {
  if (token.length <= 4) {
    return "****";
  }
  return `${token.slice(0, 2)}...${token.slice(-2)}`;
}

function truncate(value: string, maxLength = 1024): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  if (typeof err === "object" && err !== null) {
    return { ...err } as Record<string, unknown>;
  }

  return { message: String(err) };
}

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "proxy-authorization",
]);

const SENSITIVE_BODY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "authorization",
  "password",
  "secret",
]);

