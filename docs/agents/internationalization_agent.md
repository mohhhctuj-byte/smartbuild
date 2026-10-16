# Internationalization Agent

**Agent ID:** `internationalization_agent`  
**Team:** `frontend`

## Responsibility

Adds translation architecture and locale support.

## Supervisor activation

Activate `internationalization_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `frontend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to adds translation architecture and locale support. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, browser.preview.  
**Permissions:** read-workspace, workspace-write, browser-preview.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`internationalization_agent` is blocked with `BLOCKED_INTERNATIONALIZATION_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate internationalization_agent evidence against the assigned paths and confirm the result addresses: adds translation architecture and locale support. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Internationalization Agent uses workspace.read to adds translation architecture and locale support for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
