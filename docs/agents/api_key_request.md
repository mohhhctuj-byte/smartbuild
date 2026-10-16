# API Key Request Agent

**Agent ID:** `api_key_request`  
**Team:** `governance`

## Responsibility

Detects required apis and requests missing configuration.

## Supervisor activation

Activate `api_key_request` only when the Supervisor identifies this responsibility in the request and assigns a bounded `governance` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to detects required APIs and requests missing configuration. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, policy.check.  
**Permissions:** read-workspace, policy-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`api_key_request` is blocked with `BLOCKED_API_KEY_REQUEST_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate api_key_request evidence against the assigned paths and confirm the result addresses: detects required APIs and requests missing configuration. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, API Key Request Agent uses workspace.read to detects required APIs and requests missing configuration for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
