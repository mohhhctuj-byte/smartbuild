# Privacy Inspector

**Agent ID:** `privacy_inspector`  
**Team:** `governance`

## Responsibility

Checks privacy, retention, consent, and gdpr requirements.

## Supervisor activation

Activate `privacy_inspector` only when the Supervisor identifies this responsibility in the request and assigns a bounded `governance` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to checks privacy, retention, consent, and GDPR requirements. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, policy.check.  
**Permissions:** read-workspace, policy-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`privacy_inspector` is blocked with `BLOCKED_PRIVACY_INSPECTOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate privacy_inspector evidence against the assigned paths and confirm the result addresses: checks privacy, retention, consent, and GDPR requirements. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Privacy Inspector uses workspace.read to checks privacy, retention, consent, and GDPR requirements for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
