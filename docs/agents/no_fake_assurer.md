# No-Fake Assurer

**Agent ID:** `no_fake_assurer`  
**Team:** `governance`

## Responsibility

Rejects visual-only or fabricated features.

## Supervisor activation

Activate `no_fake_assurer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `governance` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to rejects visual-only or fabricated features. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, policy.check.  
**Permissions:** read-workspace, policy-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`no_fake_assurer` is blocked with `BLOCKED_NO_FAKE_ASSURER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate no_fake_assurer evidence against the assigned paths and confirm the result addresses: rejects visual-only or fabricated features. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, No-Fake Assurer uses workspace.read to rejects visual-only or fabricated features for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
