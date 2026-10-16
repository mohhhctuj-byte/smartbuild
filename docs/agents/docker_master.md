# Docker Master

**Agent ID:** `docker_master`  
**Team:** `operations`

## Responsibility

Creates secure docker configuration when needed.

## Supervisor activation

Activate `docker_master` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to creates secure Docker configuration when needed. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`docker_master` is blocked with `BLOCKED_DOCKER_MASTER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate docker_master evidence against the assigned paths and confirm the result addresses: creates secure Docker configuration when needed. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Docker Master uses workspace.read to creates secure Docker configuration when needed for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
