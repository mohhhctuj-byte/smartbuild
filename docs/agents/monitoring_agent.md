# Monitoring Agent

**Agent ID:** `monitoring_agent`  
**Team:** `operations`

## Responsibility

Integrates configured health monitoring.

## Supervisor activation

Activate `monitoring_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to integrates configured health monitoring. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`monitoring_agent` is blocked with `BLOCKED_MONITORING_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate monitoring_agent evidence against the assigned paths and confirm the result addresses: integrates configured health monitoring. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Monitoring Agent uses workspace.read to integrates configured health monitoring for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
