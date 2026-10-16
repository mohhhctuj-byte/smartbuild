# Email & Notification Specialist

**Agent ID:** `email_notification_specialist`  
**Team:** `integrations`

## Responsibility

Integrates configured notification providers.

## Supervisor activation

Activate `email_notification_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `integrations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to integrates configured notification providers. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, network.request.  
**Permissions:** read-workspace, network-request.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`email_notification_specialist` is blocked with `BLOCKED_EMAIL_NOTIFICATION_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate email_notification_specialist evidence against the assigned paths and confirm the result addresses: integrates configured notification providers. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Email & Notification Specialist uses workspace.read to integrates configured notification providers for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
