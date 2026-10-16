# Prompt Engineer

**Agent ID:** `prompt_engineer`  
**Team:** `ai`

## Responsibility

Improves prompts, tool descriptions, and evaluation cases.

## Supervisor activation

Activate `prompt_engineer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `ai` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to improves prompts, tool descriptions, and evaluation cases. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, prompt.inspect.  
**Permissions:** read-workspace, prompt-inspect.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`prompt_engineer` is blocked with `BLOCKED_PROMPT_ENGINEER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate prompt_engineer evidence against the assigned paths and confirm the result addresses: improves prompts, tool descriptions, and evaluation cases. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Prompt Engineer uses workspace.read to improves prompts, tool descriptions, and evaluation cases for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
