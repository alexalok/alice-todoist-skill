<!-- e016f81a-0a9e-4b5f-b247-745abb38ab39 a64d9e6a-4cf2-4a27-bffe-a677e947f16a -->
# Yandex Alice + Todoist Integration Skill

## Overview
Create a Cloudflare Workers application with TypeScript that serves as the backend for a Yandex Alice skill, enabling users to add tasks to their Todoist inbox using voice commands with OAuth 2.0 authentication.

## Implementation Steps

### 1. Project Setup
- Initialize Cloudflare Workers project with TypeScript
- Configure `wrangler.toml` for deployment
- Set up TypeScript types for Alice webhook requests/responses
- Add Todoist OAuth credentials as environment variables

### 2. Core Webhook Handler
Create the main worker in `src/index.ts` that:
- Receives POST requests from Yandex Alice
- Parses Alice request format (JSON with `request.command` and `request.original_utterance`)
- Extracts task description from user command
- Returns proper Alice response format with `response.text` and `end_session`

### 3. OAuth 2.0 Flow Implementation
- Handle OAuth callback endpoint for Todoist authorization
- Exchange authorization code for access token
- Store user tokens in Cloudflare Workers KV storage (key: Alice user_id, value: access_token)
- Handle token refresh if needed

### 4. Todoist API Integration
- Create function to add task using Todoist REST API v2: `POST https://api.todoist.com/rest/v2/tasks`
- Send task with `content` field (description) - inbox is default
- Use `Authorization: Bearer <token>` header
- Handle API errors gracefully

### 5. Response Logic
- On success: "Задача {task_name} добавлена"
- On OAuth needed: Return account linking card
- On error: User-friendly error message

### 6. Yandex Dialogs Configuration
Instructions for setting up in Yandex.Dialogs console:
- Create new skill with webhook URL (Cloudflare Worker URL)
- Configure OAuth settings with Todoist app credentials
- Set authorization URL: `https://todoist.com/oauth/authorize`
- Set token URL: `https://todoist.com/oauth/access_token`
- Configure redirect URI from Yandex

### 7. Documentation
Create README with:
- Prerequisites (Todoist app registration, Cloudflare account)
- Setup instructions (environment variables, deployment)
- Yandex Dialogs configuration steps
- Testing instructions

## Key Files
- `src/index.ts` - Main worker handler
- `src/types/alice.ts` - TypeScript interfaces for Alice protocol
- `src/todoist.ts` - Todoist API client
- `src/oauth.ts` - OAuth flow handlers
- `wrangler.toml` - Cloudflare configuration
- `package.json` - Dependencies
- `README.md` - Setup documentation

## Technical Notes
- Alice webhook format: JSON with nested `request` object containing `command` and `original_utterance`
- Response must have `response` object with `text` and `end_session` fields
- Todoist API v2 uses Bearer token authentication
- Tasks without project_id go to Inbox by default
- Use Cloudflare KV for storing user OAuth tokens

### To-dos

- [ ] Initialize Cloudflare Workers project with TypeScript and configure wrangler.toml
- [ ] Create TypeScript interfaces for Alice webhook request/response protocol
- [ ] Implement OAuth 2.0 authorization flow with Todoist and token storage in KV
- [ ] Create Todoist API client for adding tasks
- [ ] Implement main Alice webhook handler with command parsing and response generation
- [ ] Create README with setup instructions and Yandex Dialogs configuration guide