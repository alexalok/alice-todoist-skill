# Yandex Alice + Todoist Skill Backend

Cloudflare Workers backend, written in TypeScript, that powers a Yandex Alice skill allowing people to add tasks to their Todoist Inbox via voice commands.

## Features

- Handles Alice webhook POST requests and returns compliant responses with `response.text` and `directives.account_linking` (see the [Yandex Dialogs request/response reference](https://yandex.com/dev/dialogs/alice/doc/reference/request) for context).
- Relies on Yandex Dialogs to perform the full OAuth flow against Todoist (per [Yandex account linking docs](https://yandex.ru/dev/dialogs/alice/doc/ru/auth/how-it-works)).
- Forwards the Todoist access token provided by Yandex to `POST https://api.todoist.com/rest/v2/tasks`, with graceful error handling.

## Prerequisites

- Node.js 20+
- Cloudflare account with Workers enabled
- Todoist developer application (client id/secret)
- Yandex Dialogs skill configured in the developer console

## Local Development

```bash
npm install
npm run dev
```

Wrangler serves the worker at `http://127.0.0.1:8787`. The key endpoint is:

- `POST /webhook` – Alice webhook handler

## Deployment

- `npm run build` runs Wrangler’s dry-run bundler to make sure the worker compiles.
- For git-based automatic deployments in Cloudflare, connect the repository to Workers. No env vars or KV bindings are required by the worker.
- Manual CLI deploys use `npm run deploy`.

## Yandex Dialogs Setup

1. In the Yandex Dialogs console, configure the skill type “Dialog skill”.
2. Under **Webhook**, set the URL to your deployed Worker endpoint `https://<your-worker-domain>/webhook`.
3. In the **Account linking** section, enable OAuth linking and set:
   - Authorization URL: `https://todoist.com/oauth/authorize`
   - Token URL: `https://todoist.com/oauth/access_token`
   - Refresh token URL: leave empty (Todoist does not issue refresh tokens)
   - Client Identifier / Secret: your Todoist app credentials (Yandex uses them when exchanging codes for tokens)
   - Access Token Scope: `data:read_write`
4. Deploy the skill to testing and verify the flow. When linking succeeds, Yandex stores the Todoist token and sends it to the worker with each subsequent request via the `Authorization` header and `session.user.access_token` field.

## Todoist OAuth Flow

1. A user invokes the skill without a linked Todoist account → the worker responds with `directives.account_linking`.
2. Yandex handles the linking UX: it redirects the user to Todoist’s OAuth authorize page and, after approval, exchanges the authorization code for an access token using the Todoist token endpoint.
3. On subsequent requests, Yandex attaches the Todoist access token to the webhook call (`Authorization: Bearer ...` and `session.user.access_token`).
4. The worker forwards that token when calling the Todoist REST API. If Todoist responds with `401`, the worker asks Yandex to re-link by returning another `account_linking` directive.

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

- Treat the Todoist token from Yandex as sensitive: forward it only to Todoist over HTTPS and avoid logging it.
- Rotate your Todoist client secret periodically within the Yandex console so new tokens are minted with the updated credentials.
- Consider adding rate limiting or signature validation if Yandex introduces request signing.

## License

MIT

