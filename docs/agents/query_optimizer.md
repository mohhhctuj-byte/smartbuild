# Query Optimizer

**Agent ID:** `query_optimizer`  
**Team:** `backend`

## Responsibility

Improves database queries and orm usage.

## Supervisor activation

Activate `query_optimizer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `backend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to improves database queries and ORM usage. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, database.inspect.  
**Permissions:** read-workspace, workspace-write, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`query_optimizer` is blocked with `BLOCKED_QUERY_OPTIMIZER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate query_optimizer evidence against the assigned paths and confirm the result addresses: improves database queries and ORM usage. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Query Optimizer uses workspace.read to improves database queries and ORM usage for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
