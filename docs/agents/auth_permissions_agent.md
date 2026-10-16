# Auth & Permissions Agent

**Agent ID:** `auth_permissions_agent`  
**Team:** `security`

## Responsibility

Implements real authentication and authorization.

## Supervisor activation

Activate `auth_permissions_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `security` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to implements real authentication and authorization. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, security.scan.  
**Permissions:** read-workspace, security-scan.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`auth_permissions_agent` is blocked with `BLOCKED_AUTH_PERMISSIONS_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate auth_permissions_agent evidence against the assigned paths and confirm the result addresses: implements real authentication and authorization. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Auth & Permissions Agent uses workspace.read to implements real authentication and authorization for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
