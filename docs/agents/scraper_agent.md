# Scraper Agent

**Agent ID:** `scraper_agent`  
**Team:** `research`

## Responsibility

Collects only authorized data with limits.

## Supervisor activation

Activate `scraper_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `research` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to collects only authorized data with limits. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** web.search, source.read.  
**Permissions:** web-search, source-read, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`scraper_agent` is blocked with `BLOCKED_SCRAPER_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate scraper_agent evidence against the assigned paths and confirm the result addresses: collects only authorized data with limits. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Scraper Agent uses web.search to collects only authorized data with limits for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
