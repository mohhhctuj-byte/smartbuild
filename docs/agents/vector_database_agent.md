# Vector Database Agent

**Agent ID:** `vector_database_agent`  
**Team:** `data`

## Responsibility

Integrates a vector database only when required.

## Supervisor activation

Activate `vector_database_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `data` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to integrates a vector database only when required. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, database.inspect.  
**Permissions:** read-workspace, database-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`vector_database_agent` is blocked with `BLOCKED_VECTOR_DATABASE_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate vector_database_agent evidence against the assigned paths and confirm the result addresses: integrates a vector database only when required. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Vector Database Agent uses workspace.read to integrates a vector database only when required for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
