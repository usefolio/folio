# DataChat Flow

The DataChat component provides a chat interface for running AI-assisted data analysis within the application.

## Components

- **DataChat (`src/components/chat/dataChat.tsx`)** – renders the chat UI and exposes a dropdown to choose the language model. The selected model is sent along with each message.
- **ChatContext (`src/context/ChatContext.tsx`)** – wraps the Vercel AI SDK's `useChat` hook and handles message streaming and persistence. It forwards the chosen model to the server.
- **`/chat` HTTP endpoint (`convex/http.ts`)** – receives chat requests, selects the requested model (defaulting to `gpt-5`), and streams responses from OpenAI via Convex agents.
- **`chat.getChatAvailability` (`convex/chat.ts`)** – reports whether `OPENAI_API_KEY` is configured so the UI can disable chat proactively.

## Flow

1. The user selects a model from the dropdown in the chat UI (default is `gpt-5`).
2. When a message is sent, `ChatContext` includes the model and a data context in a request to `/chat`.
3. The Convex HTTP action reads the model parameter and uses it when calling `openai.chat` to generate a streaming response.
4. Responses stream back to the client where `ChatContext` appends them to the conversation and persists them.

## Availability guard

- When `OPENAI_API_KEY` is missing, `DataChat` disables the input area and shows a warning alert instead of allowing message submission.
- The `/chat` endpoint also returns a clear error (`OPENAI_API_KEY is not set in the environment.`) as a backend safeguard.

This setup makes it easy to experiment with different models for data analysis while keeping the rest of the chat flow unchanged.

### UI notes

- The Auto Report button in the chat footer remains visible for layout stability but is intentionally disabled until the automated reporting flow ships. Hover styling communicates the inactive state so users understand the capability is not currently available.

## Message synchronization safeguards

- `ChatContext` now reconciles Convex history updates with the locally echoed messages. Incoming records are treated as the
  canonical source and are merged by id/content so that optimistic messages are replaced instead of duplicated when the
  listener fires.
- `DataChat` debounces the send action by holding a lightweight "sending" ref. This prevents the footer button and the
  mentions textarea from dispatching the same payload twice before the context transitions out of the loading state.
- `DataChat` only hydrates conversation history from Convex a single time per conversation. After the initial load, it
  ignores subsequent Convex updates so the locally streamed messages remain the source of truth, preventing duplicate
  echoes when the backend listener emits the just-saved record.
