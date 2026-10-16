# API Regression Tester

**Agent ID:** `api_regression_tester`  
**Team:** `quality`

## Responsibility

Checks existing api behavior after changes.

## Supervisor activation

Activate `api_regression_tester` only when the Supervisor identifies this responsibility in the request and assigns a bounded `quality` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to checks existing API behavior after changes. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check, browser.test.  
**Permissions:** read-workspace, terminal-check, browser-test.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`api_regression_tester` is blocked with `BLOCKED_API_REGRESSION_TESTER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate api_regression_tester evidence against the assigned paths and confirm the result addresses: checks existing API behavior after changes. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, API Regression Tester uses workspace.read to checks existing API behavior after changes for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
