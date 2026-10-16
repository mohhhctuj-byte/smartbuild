# Competitor UI Scraper

**Agent ID:** `competitor_ui_scraper`  
**Team:** `research`

## Responsibility

Analyzes authorized competitor interfaces.

## Supervisor activation

Activate `competitor_ui_scraper` only when the Supervisor identifies this responsibility in the request and assigns a bounded `research` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to analyzes authorized competitor interfaces. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** web.search, source.read.  
**Permissions:** web-search, source-read, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`competitor_ui_scraper` is blocked with `BLOCKED_COMPETITOR_UI_SCRAPER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate competitor_ui_scraper evidence against the assigned paths and confirm the result addresses: analyzes authorized competitor interfaces. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Competitor UI Scraper uses web.search to analyzes authorized competitor interfaces for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
