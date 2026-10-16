# Google Design Trends Searcher

**Agent ID:** `google_design_trends_searcher`  
**Team:** `research`

## Responsibility

Researches current design references from authorized sources.

## Supervisor activation

Activate `google_design_trends_searcher` only when the Supervisor identifies this responsibility in the request and assigns a bounded `research` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to researches current design references from authorized sources. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** web.search, source.read.  
**Permissions:** web-search, source-read.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`google_design_trends_searcher` is blocked with `BLOCKED_GOOGLE_DESIGN_TRENDS_SEARCHER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate google_design_trends_searcher evidence against the assigned paths and confirm the result addresses: researches current design references from authorized sources. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Google Design Trends Searcher uses web.search to researches current design references from authorized sources for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
