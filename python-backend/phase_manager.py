"""
phase_manager.py
================
Manages the game phase lifecycle for "Who Is The Impostor".

The phase cycle follows a strict order:
    lobby -> role-reveal -> playing -> voting -> result -> (repeat)

This module documents and enforces valid transitions so the backend
and frontend stay in sync.
"""

from enum import Enum
from typing import Optional


class GamePhase(str, Enum):
    LOBBY = "waiting"
    ROLE_REVEAL = "role-reveal"
    PLAYING = "playing"
    VOTING = "voting"
    RESULT = "result"


# Valid transitions: current -> set of allowed next phases
VALID_TRANSITIONS = {
    GamePhase.LOBBY: {GamePhase.ROLE_REVEAL},
    GamePhase.ROLE_REVEAL: {GamePhase.PLAYING},
    GamePhase.PLAYING: {GamePhase.VOTING},
    GamePhase.VOTING: {GamePhase.RESULT},
    GamePhase.RESULT: {GamePhase.ROLE_REVEAL, GamePhase.LOBBY},
}


class PhaseManager:
    """
    Tracks and validates phase transitions for a single game room.
    """

    def __init__(self, initial_phase: GamePhase = GamePhase.LOBBY):
        self._current = initial_phase

    @property
    def current(self) -> GamePhase:
        return self._current

    def can_transition_to(self, next_phase: GamePhase) -> bool:
        return next_phase in VALID_TRANSITIONS.get(self._current, set())

    def transition(self, next_phase: GamePhase) -> bool:
        if not self.can_transition_to(next_phase):
            return False
        self._current = next_phase
        return True

    def is_terminal(self) -> bool:
        """Return True if the current phase ends the round."""
        return self._current == GamePhase.RESULT

    @staticmethod
    def get_phase_order() -> list[GamePhase]:
        return [
            GamePhase.LOBBY,
            GamePhase.ROLE_REVEAL,
            GamePhase.PLAYING,
            GamePhase.VOTING,
            GamePhase.RESULT,
        ]

    @staticmethod
    def get_label(phase: GamePhase) -> str:
        labels = {
            GamePhase.LOBBY: "Waiting",
            GamePhase.ROLE_REVEAL: "Role Reveal",
            GamePhase.PLAYING: "Playing",
            GamePhase.VOTING: "Voting",
            GamePhase.RESULT: "Result",
        }
        return labels.get(phase, "Unknown")
