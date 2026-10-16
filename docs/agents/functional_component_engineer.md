# Functional Component Engineer

**Agent ID:** `functional_component_engineer`  
**Team:** `frontend`

## Responsibility

Ensures controls have real events and backend behavior.

## Supervisor activation

Activate `functional_component_engineer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `frontend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to ensures controls have real events and backend behavior. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, browser.preview.  
**Permissions:** read-workspace, workspace-write, browser-preview.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`functional_component_engineer` is blocked with `BLOCKED_FUNCTIONAL_COMPONENT_ENGINEER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate functional_component_engineer evidence against the assigned paths and confirm the result addresses: ensures controls have real events and backend behavior. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Functional Component Engineer uses workspace.read to ensures controls have real events and backend behavior for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
