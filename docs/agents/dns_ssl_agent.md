# DNS & SSL Agent

**Agent ID:** `dns_ssl_agent`  
**Team:** `operations`

## Responsibility

Prepares domain, dns, https, and certificate configuration.

## Supervisor activation

Activate `dns_ssl_agent` only when the Supervisor identifies this responsibility in the request and assigns a bounded `operations` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to prepares domain, DNS, HTTPS, and certificate configuration. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** intent_verifier.  
**Tools:** workspace.read, terminal.check.  
**Permissions:** read-workspace, terminal-check, explicit-approval.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`dns_ssl_agent` is blocked with `BLOCKED_DNS_SSL_AGENT_ADAPTER_OR_SCOPE_MISSING` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. Validate dns_ssl_agent evidence against the assigned paths and confirm the result addresses: prepares domain, DNS, HTTPS, and certificate configuration. The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

For a Veyra website request, DNS & SSL Agent uses workspace.read to prepares domain, DNS, HTTPS, and certificate configuration for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action.
