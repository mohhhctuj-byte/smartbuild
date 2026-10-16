# Changelog Agent

**Agent ID:** `changelog_agent`  
**Team:** `documentation`

## Responsibility

Generates release notes from verified changes.

## Supervisor activation

Activate `changelog_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `documentation` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to generates release notes from verified changes. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write.  
**Permissions:** read-workspace, workspace-write.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`changelog_agent` is blocked with `BLOCKED_CHANGELOG_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate changelog_agent evidence against the assigned paths and confirm the result addresses: generates release notes from verified changes. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Changelog Agent uses workspace.read to generates release notes from verified changes for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
