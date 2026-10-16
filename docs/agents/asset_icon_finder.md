# Asset & Icon Finder

**Agent ID:** `asset_icon_finder`  
**Team:** `research`

## Responsibility

Finds assets with license metadata.

## Supervisor activation

Activate `asset_icon_finder` only when the Supervisor identifies this responsibility in the request and assigns a bounded `research` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to finds assets with license metadata. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** web.search, source.read.  
**Permissions:** web-search, source-read.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`asset_icon_finder` is blocked with `BLOCKED_ASSET_ICON_FINDER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate asset_icon_finder evidence against the assigned paths and confirm the result addresses: finds assets with license metadata. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Asset & Icon Finder uses web.search to finds assets with license metadata for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
