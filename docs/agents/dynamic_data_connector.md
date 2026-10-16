# Dynamic Data Connector

**Agent ID:** `dynamic_data_connector`  
**Team:** `backend`

## Responsibility

Replaces mock data with real database or api connections.

## Supervisor activation

Activate `dynamic_data_connector` only when the Supervisor identifies this responsibility in the request and assigns a bounded `backend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to replaces mock data with real database or API connections. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, database.inspect.  
**Permissions:** read-workspace, workspace-write, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`dynamic_data_connector` is blocked with `BLOCKED_DYNAMIC_DATA_CONNECTOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate dynamic_data_connector evidence against the assigned paths and confirm the result addresses: replaces mock data with real database or API connections. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Dynamic Data Connector uses workspace.read to replaces mock data with real database or API connections for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
