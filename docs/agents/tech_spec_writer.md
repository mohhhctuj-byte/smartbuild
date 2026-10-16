# Tech Spec Writer

**Agent ID:** `tech_spec_writer`  
**Team:** `documentation`

## Responsibility

Generates technical api documentation.

## Supervisor activation

Activate `tech_spec_writer` only when the Supervisor identifies this responsibility in the request and assigns a bounded `documentation` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to generates technical API documentation. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, workspace.write.  
**Permissions:** read-workspace, workspace-write.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`tech_spec_writer` is blocked with `BLOCKED_TECH_SPEC_WRITER_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate tech_spec_writer evidence against the assigned paths and confirm the result addresses: generates technical API documentation. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Tech Spec Writer uses workspace.read to generates technical API documentation for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
