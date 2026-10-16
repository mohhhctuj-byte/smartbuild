# Browser Automation Agent

**Agent ID:** `browser_automation_agent`  
**Team:** `quality`

## Responsibility

Uses playwright to operate and test browsers.

## Supervisor activation

Activate `browser_automation_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `quality` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to uses Playwright to operate and test browsers. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check, browser.test.  
**Permissions:** read-workspace, terminal-check, browser-test.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`browser_automation_agent` is blocked with `BLOCKED_BROWSER_AUTOMATION_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate browser_automation_agent evidence against the assigned paths and confirm the result addresses: uses Playwright to operate and test browsers. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Browser Automation Agent uses workspace.read to uses Playwright to operate and test browsers for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
