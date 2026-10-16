# Veyra Architecture Report

## Executive summary

Veyra is currently a **Manus WebDev full-stack application** rather than a desktop application. It already contains a React/Vite/Tailwind interface, an Express server, a Drizzle/MySQL data layer, a persistent personal-session cookie, Manus built-in LLM streaming, Manus-compatible object storage, project and conversation persistence, generated-file handling, web research, and image-reference uploads.

The safest upgrade path is incremental: preserve the existing web application and its proven services, introduce a local-first project boundary behind explicit folder binding, then add a supervisor/task-graph layer and a verified vertical slice. A Tauri shell should be treated as a separate adapter around the existing frontend rather than as a rewrite. Direct device-file access must remain blocked until the user binds a local folder through Manus Desktop.

## Current system map

| Layer | Current implementation | Evidence in repository | Current status |
|---|---|---|---|
| Interface | React 19, Vite, Tailwind 4, Wouter, reusable UI components | `client/src/pages/Home.tsx`, `client/src/components/AIChatBox.tsx`, `client/src/components/ui/` | **Verified in Preview** |
| API server | Express 4 with custom routes and tRPC template infrastructure | `server/_core/index.ts`, `server/routers.ts` | **Wired** |
| Workspace data | Drizzle schema and MySQL-compatible persistence for users, projects, conversations, messages, files, uploads, and sources | `drizzle/schema.ts`, `server/db.ts`, `server/workspace.ts` | **Configured and tested** |
| Personal session | Persistent cookie context with no third-party OAuth in the active workspace flow | `server/_core/context.ts`, `server/_core/cookies.ts` | **Verified in Preview** |
| LLM | Manus built-in LLM stream with SSE token forwarding and reasoning configuration | `server/llmStream.ts`, `/api/ai/stream` in `server/_core/index.ts` | **Verified with tests and Preview** |
| Storage | Manus storage helper for reference images and generated assets | `server/storage.ts`, `server/referenceUploads.ts` | **Wired and tested** |
| Research | Search route with normalized source records and conversation association | `server/webResearch.ts`, `/api/research/search` | **Verified in Preview** |
| Generated code | Markdown code-block extraction, stored generated files, file list, editor, and save route | `server/workspace.ts`, `client/src/pages/Home.tsx` | **Verified in Preview** |
| Tests | Vitest coverage for auth cookie behavior, workspace parsing, LLM stream behavior, and reference upload scope | `server/*.test.ts` | **Passing in the last validation run** |
| Desktop shell | Reserved boundary and documentation only; no device-file bridge | `desktop/README.md` | **Blocked until folder binding** |
| Agent orchestration | Not yet implemented as a task graph or state machine | No supervisor module exists yet | **Designed, not wired** |

## Existing runtime flow

The current request flow is deliberately simple. The browser creates or selects a project and conversation through `/api/workspace/*` routes. A chat request is sent to `/api/ai/stream`, where the server authenticates the personal session, persists the user message, calls the Manus built-in LLM with reasoning enabled, forwards content tokens as Server-Sent Events, persists the completed assistant message, extracts fenced code blocks, and stores generated files. The client incrementally appends tokens to the active assistant message and refreshes the generated-file list after completion.

Reference images are sent as raw image bytes to `/api/attachments/image`. The server validates the MIME type and size, uploads bytes through the Manus storage helper, then stores the resulting key, URL, project scope, and conversation scope in the database. Research requests are sent to `/api/research/search`, normalized into source records, and displayed in the research panel.

## Important architectural constraints

| Constraint | Consequence for the upgrade |
|---|---|
| Manus WebDev is a managed Node environment | A Python Supervisor Agent cannot be introduced as a runtime dependency without a separate runtime boundary. Start with a TypeScript supervisor service or a separately managed local process after folder binding. |
| No local folder is bound | The application may display a desktop boundary and blocked state, but it must not read arbitrary device paths or claim local execution. |
| Autoscale runtime is request-scoped | Long-lived local workers, Docker containers, and unrestricted project processes do not belong in the current deployed WebDev path. They require an explicit local desktop or persistent runtime decision. |
| Existing LLM and storage services are already working | Do not replace them while adding orchestration. Wrap them with task states, event logging, and capability checks. |
| The user requested BYOK and local models | Credentials must remain server-side or in an OS-protected desktop store. The frontend should receive only provider status and explicit Blocked states. |
| The user requested real Preview and tests | Every task state must have a real transition and an evidence record: test result, preview check, or blocked reason. |

## Minimum dependency recommendation

No new dependency should be installed for the first audit or for the first vertical slice. The existing stack already provides React, TypeScript, Vite, Tailwind, Express, Drizzle, Vitest, and the Manus LLM/storage integrations.

| Dependency | When to add | Why | Decision |
|---|---|---|---|
| Tauri | After local-folder binding and the web vertical slice | Desktop shell, secure native commands, file dialogs, and local process boundary | **Defer; required for installed app** |
| Monaco Editor | When the current generated-file editor needs language services, diagnostics, and multi-file editing | Production code editing experience | **Defer; current editor remains useful for the first slice** |
| Zustand | When local panel/task state becomes too broad for component state | Predictable UI/project state across Chat, Plan, Preview, Tests, Logs, and Changes | **Defer until orchestration UI begins** |
| SSE | Already present | Live LLM tokens and suitable for task progress events | **Reuse before adding WebSocket** |
| Python/FastAPI | Only in a separate local or persistent runtime | Supervisor and specialist agents when Python-only tooling is genuinely needed | **Do not add to WebDev now** |
| Playwright | When the desktop/local vertical slice has a real browser boundary | Browser end-to-end verification | **Add at e2e phase, not during audit** |
| SQLite | Only for local desktop metadata/checkpoint indexing | Local project index separate from Manus cloud database | **Defer until Tauri/local folder is bound** |

## Proposed state machine

Every requested action should move through explicit states rather than a generic loading flag:

`Designed → Wired → Configured → Running → Tested → Verified`

A missing provider, secret, callback, database, or bound folder transitions to `Blocked` with a user-visible reason and a concrete next action. A failed test transitions to `Failed`, retains the event and logs, and prevents a `Verified` label. The supervisor may select only the tools permitted by the current state; for example, a code-generation specialist cannot write to a local folder while the folder state is `Unbound`.

## Proposed vertical slice

The smallest reliable local-first slice is:

1. **Chat:** accept a user request and persist it in the existing conversation model.
2. **Plan:** generate a structured task graph with tasks, dependencies, selected specialists, and expected evidence.
3. **Generate:** run only the selected specialist or the existing LLM code-generation path, recording file changes and reasons.
4. **Preview:** run the real generated project through the existing preview boundary where possible; do not substitute a screenshot.
5. **Test:** execute available type checks and unit tests, retaining stdout, stderr, and exit status.
6. **Checkpoint:** persist an immutable project event and create a Manus checkpoint only after verification.

This slice can be implemented without a Python dependency, without a Tauri dependency, and without changing the existing LLM/storage contracts. The first supervisor can be a small TypeScript module with a strict Zod task-graph schema and a rule-based capability selector. Specialist agents can be added only after the graph and evidence model are stable.

## Migration sequence and risks

| Step | Change | Main risk | Mitigation |
|---|---|---|---|
| 1 | Add append-only project events and task status types | Status drift between UI and server | Define one shared schema and server-side transition guard |
| 2 | Add a supervisor task-graph endpoint | Model may return invalid or unsafe tool calls | Validate structured output and allow-list tool capabilities |
| 3 | Add generated-file change records with agent/reason metadata | Existing file writes may lose provenance | Wrap current save path and preserve old API behavior |
| 4 | Add real preview/test evidence records | A green UI state may be mistaken for a verified result | Require command exit status or browser evidence before Verified |
| 5 | Add BYOK/provider status | Secret leakage or ambiguous provider fallback | Keep secrets out of client payloads and show Blocked state explicitly |
| 6 | Add Tauri shell after folder binding | Native bridge can widen the filesystem attack surface | Use explicit folder grants, path normalization, and allow-listed commands |
| 7 | Add Python specialists if needed | Two runtimes increase packaging and deployment complexity | Keep the supervisor TypeScript-first until a Python-only need is demonstrated |

## Current completion assessment

The current Veyra Preview is a reliable cloud-backed creative workspace foundation, not yet a local-first desktop development environment. The core conversation, generated-file, research, storage, and personal-session features are wired and tested. The desktop wrapper, local folder bridge, task graph, append-only agent events, BYOK management, specialist-agent routing, and real local project execution remain unimplemented or blocked pending explicit folder binding.

> Important: Veyra is an original system inspired by publicly documented patterns for agent orchestration, project memory, sandbox execution, and verification. It does not reproduce the internal implementation of Manus, Manus Max, ChatGPT, or any unavailable model.

## Recommended next implementation phase

Implement the TypeScript-first vertical slice inside the existing Veyra server: shared task graph types, append-only project events, a supervisor capability selector, a plan endpoint, and evidence-aware status transitions. Keep the existing `/api/ai/stream` endpoint as the generation engine. After this slice is verified in the real Preview, bind a local folder through Manus Desktop before adding Tauri commands, SQLite metadata, or direct file operations.
