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
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => router.handle(request, env, ctx).catch(error),
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

