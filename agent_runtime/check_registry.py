from agents.registry import AGENT_CLASSES
assert len(AGENT_CLASSES) == 70
assert len({agent.agent_id for agent in (cls() for cls in AGENT_CLASSES.values())}) == 70
print("registry-ok", len(AGENT_CLASSES))
