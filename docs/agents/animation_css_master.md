# Animation & CSS Master

**Agent ID:** `animation_css_master`  
**Team:** `frontend`

## Responsibility

Implements polished css and motion systems.

## Supervisor activation

Activate `animation_css_master` only when the Supervisor identifies this responsibility in the request and assigns a bounded `frontend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to implements polished CSS and motion systems. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, browser.preview.  
**Permissions:** read-workspace, workspace-write, browser-preview.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`animation_css_master` is blocked with `BLOCKED_ANIMATION_CSS_MASTER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate animation_css_master evidence against the assigned paths and confirm the result addresses: implements polished CSS and motion systems. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Animation & CSS Master uses workspace.read to implements polished CSS and motion systems for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
