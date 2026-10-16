# Unit Test Specialist

**Agent ID:** `unit_test_specialist`  
**Team:** `quality`

## Responsibility

Writes meaningful unit tests.

## Supervisor activation

Activate `unit_test_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `quality` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to writes meaningful unit tests. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check, browser.test.  
**Permissions:** read-workspace, terminal-check, browser-test.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`unit_test_specialist` is blocked with `BLOCKED_UNIT_TEST_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate unit_test_specialist evidence against the assigned paths and confirm the result addresses: writes meaningful unit tests. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Unit Test Specialist uses workspace.read to writes meaningful unit tests for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
