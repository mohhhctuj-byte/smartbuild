# DOM Inspector & Scraper

**Agent ID:** `dom_inspector_scraper`  
**Team:** `quality`

## Responsibility

Inspects authorized html and dom structures.

## Supervisor activation

Activate `dom_inspector_scraper` only when the Supervisor identifies this responsibility in the request and assigns a bounded `quality` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to inspects authorized HTML and DOM structures. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check, browser.test.  
**Permissions:** read-workspace, terminal-check, browser-test, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`dom_inspector_scraper` is blocked with `BLOCKED_DOM_INSPECTOR_SCRAPER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate dom_inspector_scraper evidence against the assigned paths and confirm the result addresses: inspects authorized HTML and DOM structures. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, DOM Inspector & Scraper uses workspace.read to inspects authorized HTML and DOM structures for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
