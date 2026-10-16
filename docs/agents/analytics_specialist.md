# Analytics Specialist

**Agent ID:** `analytics_specialist`  
**Team:** `governance`

## Responsibility

Integrates privacy-aware analytics.

## Supervisor activation

Activate `analytics_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `governance` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to integrates privacy-aware analytics. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, policy.check.  
**Permissions:** read-workspace, policy-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`analytics_specialist` is blocked with `BLOCKED_ANALYTICS_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate analytics_specialist evidence against the assigned paths and confirm the result addresses: integrates privacy-aware analytics. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Analytics Specialist uses workspace.read to integrates privacy-aware analytics for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
