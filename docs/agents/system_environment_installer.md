# System Environment Installer

**Agent ID:** `system_environment_installer`  
**Team:** `operations`

## Responsibility

Checks dependencies and installs only with approval.

## Supervisor activation

Activate `system_environment_installer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to checks dependencies and installs only with approval. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`system_environment_installer` is blocked with `BLOCKED_SYSTEM_ENVIRONMENT_INSTALLER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate system_environment_installer evidence against the assigned paths and confirm the result addresses: checks dependencies and installs only with approval. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, System Environment Installer uses workspace.read to checks dependencies and installs only with approval for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
