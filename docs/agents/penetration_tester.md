# Penetration Tester

**Agent ID:** `penetration_tester`  
**Team:** `security`

## Responsibility

Checks authorized common security issues.

## Supervisor activation

Activate `penetration_tester` only when the Supervisor identifies this responsibility in the request and assigns a bounded `security` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to checks authorized common security issues. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, security.scan.  
**Permissions:** read-workspace, security-scan.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`penetration_tester` is blocked with `BLOCKED_PENETRATION_TESTER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate penetration_tester evidence against the assigned paths and confirm the result addresses: checks authorized common security issues. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Penetration Tester uses workspace.read to checks authorized common security issues for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
