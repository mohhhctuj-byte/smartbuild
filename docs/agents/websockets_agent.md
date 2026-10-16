# WebSockets Agent

**Agent ID:** `websockets_agent`  
**Team:** `backend`

## Responsibility

Implements realtime updates and reconnection.

## Supervisor activation

Activate `websockets_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `backend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to implements realtime updates and reconnection. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, database.inspect.  
**Permissions:** read-workspace, workspace-write, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`websockets_agent` is blocked with `BLOCKED_WEBSOCKETS_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate websockets_agent evidence against the assigned paths and confirm the result addresses: implements realtime updates and reconnection. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, WebSockets Agent uses workspace.read to implements realtime updates and reconnection for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
