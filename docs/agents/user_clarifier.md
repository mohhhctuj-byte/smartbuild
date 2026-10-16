# User Clarifier Agent

**Agent ID:** `user_clarifier`  
**Team:** `planning`

## Responsibility

Asks targeted questions when a request is ambiguous.

## Supervisor activation

Activate `user_clarifier` only when the Supervisor identifies this responsibility in the request and assigns a bounded `planning` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to asks targeted questions when a request is ambiguous. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** workspace.read.  
**Permissions:** read-workspace.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`user_clarifier` is blocked with `BLOCKED_USER_CLARIFIER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate user_clarifier evidence against the assigned paths and confirm the result addresses: asks targeted questions when a request is ambiguous. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, User Clarifier Agent uses workspace.read to asks targeted questions when a request is ambiguous for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
