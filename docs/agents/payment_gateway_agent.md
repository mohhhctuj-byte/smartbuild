# Payment Gateway Agent

**Agent ID:** `payment_gateway_agent`  
**Team:** `integrations`

## Responsibility

Integrates approved payment providers securely.

## Supervisor activation

Activate `payment_gateway_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `integrations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to integrates approved payment providers securely. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, network.request.  
**Permissions:** read-workspace, network-request, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`payment_gateway_agent` is blocked with `BLOCKED_PAYMENT_GATEWAY_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate payment_gateway_agent evidence against the assigned paths and confirm the result addresses: integrates approved payment providers securely. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Payment Gateway Agent uses workspace.read to integrates approved payment providers securely for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
