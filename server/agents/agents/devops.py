"""Operations canonical agent category."""
from ..registry import get_agent

DockerMaster = type(get_agent("agent_053"))
CicdPipelineAgent = type(get_agent("agent_054"))
KubernetesAgent = type(get_agent("agent_057"))
