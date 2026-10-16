"""Required public BaseAgent import for the canonical specialist runtime."""

from .base import SpecialistAgent

BaseAgent = SpecialistAgent

__all__ = ("BaseAgent", "SpecialistAgent")
