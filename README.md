# SmartBuild Cloud Runtime

SmartBuild is a web-only AI developer workspace. It uses **Manus LLM** as its default model provider; optional BYOK remains intentionally blocked. The browser application does not require Tauri, a Desktop application, an absolute local folder, or direct device filesystem access.

## Verified project-scoped contact runtime

For a generated contact-form build, SmartBuild writes a semantic browser form, client validation, a declarative route manifest, a checked migration, and an executable Chromium test. The server starts one constrained **FastAPI** process for that project workspace and creates the project database at the runtime-only path `.smartbuild-runtime/project.sqlite3`. That directory is excluded from browser file listings, previews, exports, checkpoints, and generated client code.

The preview process serves static project artifacts and proxies same-origin `/api/*` requests only to the FastAPI process owned by the same build. It rejects path traversal, dot-prefixed runtime files, and browser access to `/api/__test__/*`. The private inspection endpoint needs an ephemeral server-side token and is used only by the generated test runner to prove persistence.

## Contact build artifacts and evidence

| Artifact | Purpose |
|---|---|
| `index.html` and `styles.css` | Accessible form, visible client validation errors, and same-origin `POST /api/contact`. |
| `backend/smartbuild.routes.json` | Restricted declarative API contract; generated project code is never executed as arbitrary server Python. |
| `backend/migrations/001-contact-submissions.sql` | Checked migration for the `contact_submissions` SQLite table. |
| `playwright/contact-form.spec.js` | Chromium test that verifies invalid input, a valid browser submission through the preview proxy, and the persisted record via the private test channel. |
| `evidence/test-output.json` | Capability matrix and a PASS, FAIL, or BLOCKED result for every required acceptance criterion. |
| `evidence/build-summary.json` | Redacted build summary with public preview evidence, artifact inventory, criterion results, and no filesystem paths, database location, token, or loopback address. |

A build receives **Verified** and a Git-or-snapshot checkpoint only when every required criterion is `PASS`. Email delivery is not required unless the request explicitly asks to send or deliver email. If it is requested without a configured provider, the email criterion alone is `BLOCKED`; SmartBuild does not invent delivery.

## Runtime boundary

The FastAPI runner validates the exact supported contact-route contract and migration before it starts. It binds only to loopback, exposes no OpenAPI/docs endpoints, limits routes to the supported manifest, validates requests with Pydantic, and uses a separate SQLite file for each project workspace. This is intentionally a secure minimum backend capability rather than arbitrary uploaded backend-code execution.
