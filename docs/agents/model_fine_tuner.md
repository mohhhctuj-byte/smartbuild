# Model Fine-Tuner

**Agent ID:** `model_fine_tuner`  
**Team:** `ai`

## Responsibility

Prepares fine-tuning data without starting costly training.

## Supervisor activation

Activate `model_fine_tuner` only when the Supervisor identifies this responsibility in the request and assigns a bounded `ai` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to prepares fine-tuning data without starting costly training. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, prompt.inspect.  
**Permissions:** read-workspace, prompt-inspect, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`model_fine_tuner` is blocked with `BLOCKED_MODEL_FINE_TUNER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate model_fine_tuner evidence against the assigned paths and confirm the result addresses: prepares fine-tuning data without starting costly training. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Model Fine-Tuner uses workspace.read to prepares fine-tuning data without starting costly training for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
