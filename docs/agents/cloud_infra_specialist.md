# Cloud Infra Specialist

**Agent ID:** `cloud_infra_specialist`  
**Team:** `operations`

## Responsibility

Creates deployment architecture without deploying.

## Supervisor activation

Activate `cloud_infra_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to creates deployment architecture without deploying. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`cloud_infra_specialist` is blocked with `BLOCKED_CLOUD_INFRA_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate cloud_infra_specialist evidence against the assigned paths and confirm the result addresses: creates deployment architecture without deploying. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Cloud Infra Specialist uses workspace.read to creates deployment architecture without deploying for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
