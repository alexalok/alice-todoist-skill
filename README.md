# Yandex Alice + Todoist Skill Backend

Cloudflare Workers backend, written in TypeScript, that powers a Yandex Alice skill allowing people to add tasks to their Todoist Inbox via voice commands.

## Features

- Handles Alice webhook POST requests and returns compliant responses with `response.text`, `buttons`, and `directives.account_linking` (see the [Yandex Dialogs request/response reference](https://yandex.com/dev/dialogs/alice/doc/reference/request) for context).
- Guides users through Todoist OAuth based on the [Todoist OAuth 2.0 documentation](https://developer.todoist.com/guides/#oauth).
- Stores Todoist access tokens in Cloudflare KV, keyed by Alice `user_id`.
- Adds tasks through `POST https://api.todoist.com/rest/v2/tasks` with graceful error handling.

## Prerequisites

- Node.js 20+
- Cloudflare account with Workers and KV enabled
- Todoist developer application (client id/secret)
- Yandex Dialogs skill configured in the developer console

## Environment Variables and KV

- For local development copy `.dev.vars.example` to `.dev.vars` and fill in:
  - `TODOIST_CLIENT_ID`
  - `TODOIST_CLIENT_SECRET`
  - `TODOIST_REDIRECT_URI`
  Wrangler automatically loads `.dev.vars` when you run `npm run dev`.
- In Cloudflare’s dashboard create the secrets instead of storing them in `wrangler.toml`:
  - Workers → your Worker → **Settings → Variables → Add variable** → type “Secret text”.
  - Add the three Todoist values there so they stay out of the repository.
- Still in the dashboard, create a KV Namespace (Workers → KV) and bind it to the Worker as `TOKENS` under **Resources → Add binding → KV Namespace**.

The Worker saves three kinds of keys in KV:

- `link:<state>` – temporary state between Alice and the authorization endpoint (TTL 10 minutes)
- `todoist:<state>` – temporary state between Todoist and the callback (TTL 10 minutes)
- `token:<alice-user-id>` – persistent Todoist access token for the skill user

## Local Development

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit the file with your real values
npm run dev
```

The `local` Wrangler environment uses an in-memory KV namespace (configured via `preview_id`) so you can test account linking without touching production data. Wrangler serves the worker at `http://127.0.0.1:8787`. The important routes are:

- `POST /webhook` – Alice webhook
- `GET /oauth/authorize` – first step in the Todoist OAuth flow
- `GET /oauth/callback` – Todoist redirect URI that stores the token
- `GET /health` – simple readiness probe

## Deployment

- `npm run build` runs Wrangler’s dry-run bundler (`--env ci`) to make sure the worker compiles without needing real credentials.
- For git-based automatic deployments in Cloudflare, connect the repository to Workers and configure environment variables and the `TOKENS` KV binding from the dashboard (Settings → Variables/Resources). No additional files are required in the repo.
- If you ever need to run a manual CLI deployment, copy `wrangler.production.example.toml` to `wrangler.production.toml`, fill in the real KV namespace IDs, and run `wrangler deploy --config wrangler.production.toml`. Keep that file out of source control (already ignored).

## Yandex Dialogs Setup

1. In the Yandex Dialogs console, configure the skill type “Dialog skill”.
2. Under **Webhook**, set the URL to your deployed Worker endpoint `https://<your-worker-domain>/webhook`.
3. In the **Account linking** section, enable OAuth linking and set:
   - Authorization URL: `https://<your-worker-domain>/oauth/authorize`
   - Token URL: leave empty (the Worker stores Todoist tokens)
   - Client ID: any static value (kept by Yandex)
   - Scopes: `data:read_write`
4. Deploy the skill to testing and verify the flow.

When Alice sends a request without a stored Todoist token, the worker returns an account linking directive and a convenience button pointing at `/oauth/authorize?state=<generated-state>`. The state is mapped to the user ID in KV so the callback can store the token correctly.

## Todoist OAuth Flow

1. Alice user triggers the skill → worker detects missing token → responds with account linking directive.
2. Alice opens the directive → Yandex visits `/oauth/authorize?state=<state>`.
3. Worker looks up `<state>` → redirects to Todoist authorize page with its own state.
4. Todoist redirects to `/oauth/callback?code=<code>&state=<worker-state>`.
5. Worker exchanges the code for an access token and stores it as `token:<user-id>`.
6. User repeats the voice command → worker finds the stored token and creates a Todoist task.

## Testing Tips

- Use the Yandex Dialogs testing console to send sample `request` payloads to the webhook (see the official schema for `request.command`, `original_utterance`, etc.).
- In development, you can simulate the webhook with:

```bash
curl -X POST http://127.0.0.1:8787/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "session": {"session_id": "test", "message_id": 1, "user_id": "user-1"},
    "request": {"command": "добавь купить молоко", "original_utterance": "добавь купить молоко", "type": "SimpleUtterance"}
  }'
```

The first call returns a linking directive; after completing OAuth the response confirms the task creation.

## Security Considerations

- Restrict access to the KV namespace, because Todoist tokens are stored as plain strings.
- Rotate Todoist client secrets periodically, update them in the Cloudflare dashboard, and refresh your local `.dev.vars` copy.
- Consider adding rate limiting or signature validation if Yandex introduces request signing.

## License

MIT

