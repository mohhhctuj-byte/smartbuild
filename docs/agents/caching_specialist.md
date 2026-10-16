# Caching Specialist

**Agent ID:** `caching_specialist`  
**Team:** `backend`

## Responsibility

Adds appropriate caching only when required.

## Supervisor activation

Activate `caching_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `backend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to adds appropriate caching only when required. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, database.inspect.  
**Permissions:** read-workspace, workspace-write, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`caching_specialist` is blocked with `BLOCKED_CACHING_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate caching_specialist evidence against the assigned paths and confirm the result addresses: adds appropriate caching only when required. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Caching Specialist uses workspace.read to adds appropriate caching only when required for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
