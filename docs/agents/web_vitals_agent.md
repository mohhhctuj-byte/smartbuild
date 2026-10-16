# Web Vitals Agent

**Agent ID:** `web_vitals_agent`  
**Team:** `quality`

## Responsibility

Improves loading speed and core web vitals.

## Supervisor activation

Activate `web_vitals_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `quality` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to improves loading speed and Core Web Vitals. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check, browser.test.  
**Permissions:** read-workspace, terminal-check, browser-test.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`web_vitals_agent` is blocked with `BLOCKED_WEB_VITALS_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate web_vitals_agent evidence against the assigned paths and confirm the result addresses: improves loading speed and Core Web Vitals. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Web Vitals Agent uses workspace.read to improves loading speed and Core Web Vitals for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
