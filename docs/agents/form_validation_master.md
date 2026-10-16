# Form & Validation Master

**Agent ID:** `form_validation_master`  
**Team:** `frontend`

## Responsibility

Creates validation, error handling, and feedback.

## Supervisor activation

Activate `form_validation_master` only when the Supervisor identifies this responsibility in the request and assigns a bounded `frontend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to creates validation, error handling, and feedback. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, browser.preview.  
**Permissions:** read-workspace, workspace-write, browser-preview.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`form_validation_master` is blocked with `BLOCKED_FORM_VALIDATION_MASTER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate form_validation_master evidence against the assigned paths and confirm the result addresses: creates validation, error handling, and feedback. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Form & Validation Master uses workspace.read to creates validation, error handling, and feedback for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
