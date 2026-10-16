# Color Palette Scout

**Agent ID:** `color_palette_scout`  
**Team:** `frontend`

## Responsibility

Proposes accessible color palettes.

## Supervisor activation

Activate `color_palette_scout` only when the Supervisor identifies this responsibility in the request and assigns a bounded `frontend` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to proposes accessible color palettes. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write, browser.preview.  
**Permissions:** read-workspace, workspace-write, browser-preview.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`color_palette_scout` is blocked with `BLOCKED_COLOR_PALETTE_SCOUT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate color_palette_scout evidence against the assigned paths and confirm the result addresses: proposes accessible color palettes. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Color Palette Scout uses workspace.read to proposes accessible color palettes for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
