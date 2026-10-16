# GUI & Mouse Navigator

**Agent ID:** `gui_mouse_navigator`  
**Team:** `desktop`

## Responsibility

Uses only an explicit safe desktop automation layer.

## Supervisor activation

Activate `gui_mouse_navigator` only when the Supervisor identifies this responsibility in the request and assigns a bounded `desktop` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to uses only an explicit safe desktop automation layer. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** desktop.bound-folder.  
**Permissions:** desktop-bound-folder, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`gui_mouse_navigator` is blocked with `BLOCKED_GUI_MOUSE_NAVIGATOR_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate gui_mouse_navigator evidence against the assigned paths and confirm the result addresses: uses only an explicit safe desktop automation layer. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, GUI & Mouse Navigator uses desktop.bound-folder to uses only an explicit safe desktop automation layer for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
