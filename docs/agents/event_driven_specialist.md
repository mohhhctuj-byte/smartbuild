# Event-Driven Specialist

**Agent ID:** `event_driven_specialist`  
**Team:** `backend`

## Responsibility

Designs events, webhooks, queues, and realtime messaging.

## Supervisor activation

Activate `event_driven_specialist` only when the Supervisor identifies this responsibility in the request and assigns a bounded `backend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to designs events, webhooks, queues, and realtime messaging. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, database.inspect.  
**Permissions:** read-workspace, workspace-write, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`event_driven_specialist` is blocked with `BLOCKED_EVENT_DRIVEN_SPECIALIST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate event_driven_specialist evidence against the assigned paths and confirm the result addresses: designs events, webhooks, queues, and realtime messaging. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Event-Driven Specialist uses workspace.read to designs events, webhooks, queues, and realtime messaging for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
