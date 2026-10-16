# Cost & Token Optimizer

**Agent ID:** `cost_token_optimizer`  
**Team:** `governance`

## Responsibility

Reduces model, api, compute, and storage costs.

## Supervisor activation

Activate `cost_token_optimizer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `governance` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to reduces model, API, compute, and storage costs. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, policy.check.  
**Permissions:** read-workspace, policy-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`cost_token_optimizer` is blocked with `BLOCKED_COST_TOKEN_OPTIMIZER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate cost_token_optimizer evidence against the assigned paths and confirm the result addresses: reduces model, API, compute, and storage costs. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Cost & Token Optimizer uses workspace.read to reduces model, API, compute, and storage costs for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
