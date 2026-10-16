# Infrastructure as Code Agent

**Agent ID:** `infrastructure_as_code_agent`  
**Team:** `operations`

## Responsibility

Generates infrastructure code for review.

## Supervisor activation

Activate `infrastructure_as_code_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to generates infrastructure code for review. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`infrastructure_as_code_agent` is blocked with `BLOCKED_INFRASTRUCTURE_AS_CODE_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate infrastructure_as_code_agent evidence against the assigned paths and confirm the result addresses: generates infrastructure code for review. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, Infrastructure as Code Agent uses workspace.read to generates infrastructure code for review for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
