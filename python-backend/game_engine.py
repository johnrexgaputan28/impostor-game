"""
game_engine.py
==============
Core game logic for "Who Is The Impostor".

Handles role assignment, win-condition checking, and round cycling.
Designed to align with the frontend phase system so the backend can
drive transitions via API calls.
"""

import random
from typing import Optional

from phase_manager import GamePhase, PhaseManager


WORD_SETS = [
    {"common": "Volcano", "impostor": "Mountain"},
    {"common": "Library", "impostor": "Museum"},
    {"common": "Piano", "impostor": "Guitar"},
    {"common": "Airport", "impostor": "Train Station"},
    {"common": "Jungle", "impostor": "Forest"},
    {"common": "Astronaut", "impostor": "Pilot"},
    {"common": "Chocolate", "impostor": "Coffee"},
    {"common": "Detective", "impostor": "Reporter"},
    {"common": "Lantern", "impostor": "Flashlight"},
    {"common": "Ocean", "impostor": "River"},
]


class GameEngine:
    """
    Manages a single game session: assigning roles, tracking votes,
    determining winners, and cycling rounds.
    """

    # SOLO TEST MODE: changed from 3 to 1 for single-player testing
    MIN_PLAYERS = 1

    def __init__(self):
        self.phase_manager = PhaseManager()

    @staticmethod
    def pick_word_set() -> dict[str, str]:
        return random.choice(WORD_SETS)

    @staticmethod
    def assign_roles(players: list[dict]) -> dict[str, dict]:
        """
        Assign one impostor and the rest as civilians.
        Returns a dict keyed by player ID.
        """
        if len(players) < GameEngine.MIN_PLAYERS:
            raise ValueError(f"At least {GameEngine.MIN_PLAYERS} players required.")

        shuffled = players[:]
        random.shuffle(shuffled)
        impostor = shuffled[0]
        word_set = GameEngine.pick_word_set()

        roles = {}
        for player in players:
            is_impostor = player["id"] == impostor["id"]
            roles[player["id"]] = {
                "role": "impostor" if is_impostor else "civilian",
                "word": word_set["impostor"] if is_impostor else word_set["common"],
                "username": player.get("username", "Unknown"),
            }

        return {
            "roles": roles,
            "impostorId": impostor["id"],
            "impostorName": impostor.get("username", "Unknown"),
            "word": word_set["common"],
            "impostorWord": word_set["impostor"],
        }

    @staticmethod
    def build_turn_order(players: list[dict]) -> list[str]:
        """Shuffle and return player IDs for turn-based chat."""
        shuffled = players[:]
        random.shuffle(shuffled)
        return [p["id"] for p in shuffled]

    @staticmethod
    def tally_votes(votes: dict[str, str]) -> dict[str, int]:
        """
        Count votes. votes: {voterId: targetId}
        """
        totals: dict[str, int] = {}
        for target_id in votes.values():
            totals[target_id] = totals.get(target_id, 0) + 1
        return totals

    @staticmethod
    def resolve_voting(players: list[dict], votes: dict[str, str], impostor_id: str) -> dict:
        """
        Determine the result of a voting phase.
        Returns elimination info and winner.
        """
        # SOLO TEST MODE: auto-resolve for single player
        if len(players) <= 1:
            return {
                "eliminatedId": None,
                "eliminatedName": None,
                "eliminatedRole": None,
                "winner": "impostor",
                "resultText": "Solo round — impostor wins by default.",
            }

        if not votes:
            return {
                "eliminatedId": None,
                "eliminatedName": None,
                "eliminatedRole": None,
                "winner": "impostor",
                "resultText": "No votes were cast. The impostor wins by default.",
            }

        totals = GameEngine.tally_votes(votes)
        sorted_totals = sorted(totals.items(), key=lambda x: x[1], reverse=True)
        top_target, top_count = sorted_totals[0]
        tie_exists = len(sorted_totals) > 1 and sorted_totals[1][1] == top_count

        eliminated = next((p for p in players if p["id"] == top_target), None)
        eliminated_name = eliminated.get("username", "Unknown") if eliminated else "Unknown"

        if tie_exists:
            return {
                "eliminatedId": None,
                "eliminatedName": None,
                "eliminatedRole": None,
                "winner": "impostor",
                "resultText": "The vote ended in a tie, so the impostor slips away.",
            }

        if top_target == impostor_id:
            return {
                "eliminatedId": top_target,
                "eliminatedName": eliminated_name,
                "eliminatedRole": "impostor",
                "winner": "crew",
                "resultText": f"{eliminated_name} was the impostor. The crew wins.",
            }

        return {
            "eliminatedId": top_target,
            "eliminatedName": eliminated_name,
            "eliminatedRole": "civilian",
            "winner": "impostor",
            "resultText": f"{eliminated_name} was not the impostor. The impostor wins.",
        }

    def start_new_round(self, players: list[dict]) -> dict:
        """
        Begin a new round: move from lobby/result to role-reveal,
        assign roles, and return the initial game state payload.
        """
        if len(players) < self.MIN_PLAYERS:
            raise ValueError(f"At least {self.MIN_PLAYERS} players required.")

        self.phase_manager.transition(GamePhase.ROLE_REVEAL)
        assignment = self.assign_roles(players)
        turn_order = self.build_turn_order(players)

        return {
            "status": GamePhase.ROLE_REVEAL.value,
            "round": random.randint(100000, 999999),
            **assignment,
            "turnOrder": turn_order,
            "currentTurnIndex": 0,
            "votes": None,
            "winner": "",
            "resultText": "",
            "startedAt": int(__import__("time").time() * 1000),
            "revealEndsAt": int(__import__("time").time() * 1000) + 5000,
            # Turn system metadata
            "turnDurationMs": 10000,
            "turnSystemActive": True,
        }

    def check_win_condition(self, players: list[dict], impostor_id: str) -> Optional[str]:
        """
        Check if the game has a winner based on remaining players.
        Returns 'crew', 'impostor', or None if the game should continue.
        """
        alive_players = [p for p in players if p.get("alive", True)]
        impostor_alive = any(p["id"] == impostor_id and p.get("alive", True) for p in alive_players)

        if not impostor_alive:
            return "crew"

        # Impostor wins if crew cannot outvote them (equal or fewer non-impostors)
        crew_count = sum(1 for p in alive_players if p["id"] != impostor_id)
        if crew_count <= 1:
            return "impostor"

        return None

