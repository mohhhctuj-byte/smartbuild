# Live Feedback Collector

**Agent ID:** `live_feedback_collector`  
**Team:** `planning`

## Responsibility

Requests feedback after major milestones.

## Supervisor activation

Activate `live_feedback_collector` only when the Supervisor identifies this responsibility in the request and assigns a bounded `planning` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to requests feedback after major milestones. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** none beyond Supervisor assignment.  
**Tools:** workspace.read.  
**Permissions:** read-workspace.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`live_feedback_collector` is blocked with `BLOCKED_LIVE_FEEDBACK_COLLECTOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate live_feedback_collector evidence against the assigned paths and confirm the result addresses: requests feedback after major milestones. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Live Feedback Collector uses workspace.read to requests feedback after major milestones for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
