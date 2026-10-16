# Auto-Google Operator

**Agent ID:** `auto_google_operator`  
**Team:** `research`

## Responsibility

Performs authorized searches and extracts documentation.

## Supervisor activation

Activate `auto_google_operator` only when the Supervisor identifies this responsibility in the request and assigns a bounded `research` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to performs authorized searches and extracts documentation. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** web.search, source.read.  
**Permissions:** web-search, source-read.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`auto_google_operator` is blocked with `BLOCKED_AUTO_GOOGLE_OPERATOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate auto_google_operator evidence against the assigned paths and confirm the result addresses: performs authorized searches and extracts documentation. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Auto-Google Operator uses web.search to performs authorized searches and extracts documentation for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
