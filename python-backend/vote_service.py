from game_engine import GameEngine
from room_service import get_players_list, update_game_state


class VoteService:
    """Handles vote recording, tallying, and resolution via GameEngine."""

    @staticmethod
    def record_vote(room_code: str, voter_id: str, target_id: str):
        """Record a single vote under rooms/{code}/game/votes."""
        update_game_state(room_code, {f"votes/{voter_id}": target_id})

    @staticmethod
    def tally_votes(votes: dict[str, str]) -> dict[str, int]:
        """Count votes. votes: {voterId: targetId}"""
        return GameEngine.tally_votes(votes)

    @staticmethod
    def resolve_voting(room_code: str, votes: dict[str, str], impostor_id: str) -> dict:
        """Determine the result of a voting phase and return elimination info."""
        players = get_players_list(room_code)
        return GameEngine.resolve_voting(players, votes, impostor_id)

