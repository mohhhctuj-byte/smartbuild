# Microservices Architect

**Agent ID:** `microservices_architect`  
**Team:** `architecture`

## Responsibility

Plans service boundaries when needed.

## Supervisor activation

Activate `microservices_architect` only when the Supervisor identifies this responsibility in the request and assigns a bounded `architecture` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to plans service boundaries when needed. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read.  
**Permissions:** read-workspace.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`microservices_architect` is blocked with `BLOCKED_MICROSERVICES_ARCHITECT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate microservices_architect evidence against the assigned paths and confirm the result addresses: plans service boundaries when needed. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Microservices Architect uses workspace.read to plans service boundaries when needed for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
