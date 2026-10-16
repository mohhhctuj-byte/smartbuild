# Third-Party Integrator

**Agent ID:** `third_party_integrator`  
**Team:** `integrations`

## Responsibility

Connects external apis with retries and validation.

## Supervisor activation

Activate `third_party_integrator` only when the Supervisor identifies this responsibility in the request and assigns a bounded `integrations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to connects external APIs with retries and validation. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, network.request.  
**Permissions:** read-workspace, network-request.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`third_party_integrator` is blocked with `BLOCKED_THIRD_PARTY_INTEGRATOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate third_party_integrator evidence against the assigned paths and confirm the result addresses: connects external APIs with retries and validation. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Third-Party Integrator uses workspace.read to connects external APIs with retries and validation for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
