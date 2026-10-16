# Security Architect

**Agent ID:** `security_architect`  
**Team:** `security`

## Responsibility

Designs authentication, authorization, encryption, and secret handling.

## Supervisor activation

Activate `security_architect` only when the Supervisor identifies this responsibility in the request and assigns a bounded `security` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to designs authentication, authorization, encryption, and secret handling. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, security.scan.  
**Permissions:** read-workspace, security-scan.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`security_architect` is blocked with `BLOCKED_SECURITY_ARCHITECT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate security_architect evidence against the assigned paths and confirm the result addresses: designs authentication, authorization, encryption, and secret handling. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Security Architect uses workspace.read to designs authentication, authorization, encryption, and secret handling for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
