import { Router, error } from "itty-router";
import type { AliceRequest, AliceResponse } from "./types/alice";
import type { Env } from "./types/env";
import { addTask, isTodoistUnauthorized } from "./todoist";
import {
  buildTodoistAuthorizeUrl,
  consumeLinkState,
  consumeTodoistState,
  deleteToken,
  exchangeCodeForToken,
  generateState,
  getToken,
  rememberTodoistState,
  storeLinkState,
  storeToken,
} from "./oauth";

const router = Router();

router.get("/health", () => new Response("ok", { status: 200 }));

router.get("/oauth/authorize", async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    return new Response("Missing state", { status: 400 });
  }

  const userId = await consumeLinkState(env, stateParam);
  if (!userId) {
    return new Response("Unknown or expired link state", { status: 400 });
  }

  const todoistState = generateState();
  await rememberTodoistState(env, todoistState, { userId });

  const authorizeUrl = buildTodoistAuthorizeUrl(env, todoistState);
  return Response.redirect(authorizeUrl, 302);
});

router.get("/oauth/callback", async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  const todoistState = await consumeTodoistState(env, state);
  if (!todoistState) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  try {
    const accessToken = await exchangeCodeForToken(env, code);
    await storeToken(env, todoistState.userId, accessToken);
  } catch (exchangeError) {
    console.error("OAuth exchange error", exchangeError);
    return new Response("Failed to complete Todoist authorization", { status: 500 });
  }

  return new Response(
    `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>Todoist подключен</title></head><body><h1>Готово!</h1><p>Учетная запись Todoist связана с навыком. Вернитесь в Алису и повторите команду.</p></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
});

router.post("/webhook", async (request: Request, env: Env) => {
  let payload: AliceRequest;
  try {
    payload = (await request.json()) as AliceRequest;
  } catch (parseError) {
    console.error("Failed to parse Alice request", parseError);
    return new Response("Invalid JSON", { status: 400 });
  }

  const userId = payload.session.user?.user_id ?? payload.session.user_id;
  if (!userId) {
    return jsonResponse(buildAliceResponse(payload, {
      text: "Не удалось определить пользователя. Попробуйте позже.",
      end_session: true,
    }));
  }

  const commandText = (payload.request.original_utterance || payload.request.command || "").trim();
  if (!commandText) {
    return jsonResponse(buildAliceResponse(payload, {
      text: "Что добавить в Todoist?",
      end_session: false,
    }));
  }

  const token = payload.session.user?.access_token || (await getToken(env, userId));
  if (!token) {
    const linkState = generateState();
    await storeLinkState(env, linkState, userId);

    const authorizeUrl = new URL(request.url);
    authorizeUrl.pathname = "/oauth/authorize";
    authorizeUrl.search = `state=${linkState}`;

    return jsonResponse(
      buildAliceResponse(payload, {
        text: "Чтобы добавить задачи, сперва подключите Todoist.",
        end_session: false,
        buttons: [
          {
            title: "Подключить Todoist",
            url: authorizeUrl.toString(),
            hide: true,
          },
        ],
        directives: {
          account_linking: {},
        },
      }),
    );
  }

  try {
    const taskName = await addTask(env, token, commandText);
    return jsonResponse(
      buildAliceResponse(payload, {
        text: `Задача «${taskName}» добавлена в Todoist.`,
        end_session: true,
      }),
    );
  } catch (apiError) {
    console.error("Failed to add Todoist task", apiError);

    if (isTodoistUnauthorized(apiError)) {
      await deleteToken(env, userId);
      const relinkState = generateState();
      await storeLinkState(env, relinkState, userId);

      const authorizeUrl = new URL(request.url);
      authorizeUrl.pathname = "/oauth/authorize";
      authorizeUrl.search = `state=${relinkState}`;

      return jsonResponse(
        buildAliceResponse(payload, {
          text: "Авторизация Todoist истекла. Подключите аккаунт заново.",
          end_session: false,
          buttons: [
            {
              title: "Подключить снова",
              url: authorizeUrl.toString(),
              hide: true,
            },
          ],
          directives: {
            account_linking: {},
          },
        }),
      );
    }

    return jsonResponse(
      buildAliceResponse(payload, {
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

function buildAliceResponse(
  request: AliceRequest,
  response: AliceResponse["response"],
): AliceResponse {
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

function jsonResponse(payload: AliceResponse): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

