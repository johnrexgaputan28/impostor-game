import asyncio
import time
from typing import Callable

from room_service import add_chat_message, get_game_state, update_game_state


class TimerService:
    """
    Manages per-room async timers for reveal, turns, and voting.
    Uses a simple in-memory dict of tasks; safe for single-process deployments.
    """

    _tasks: dict[str, asyncio.Task] = {}

    @classmethod
    def cancel_timers(cls, room_code: str):
        task = cls._tasks.pop(room_code, None)
        if task and not task.done():
            task.cancel()

    @classmethod
    async def _sleep_then(cls, room_code: str, delay: float, callback: Callable):
        try:
            await asyncio.sleep(delay)
            if room_code not in cls._tasks:
                return
            callback()
        except asyncio.CancelledError:
            pass
        finally:
            cls._tasks.pop(room_code, None)

    @classmethod
    def _start_timer(cls, room_code: str, delay: float, callback: Callable):
        cls.cancel_timers(room_code)
        loop = asyncio.get_running_loop()
        cls._tasks[room_code] = loop.create_task(cls._sleep_then(room_code, delay, callback))

    # ------------------------------------------------------------------
    # Reveal timer (role-reveal -> playing)
    # ------------------------------------------------------------------
    @classmethod
    def start_reveal_timer(cls, room_code: str, duration: int = 5):
        def on_expire():
            game = get_game_state(room_code)
            if game.get("status") == "role-reveal":
                update_game_state(room_code, {
                    "status": "playing",
                    "resultText": "The round is live. Players will take turns giving hints.",
                    "turnStartedAt": int(time.time() * 1000),
                    "currentTurnIndex": 0
                })
                cls.start_turn_timer(room_code)

        cls._start_timer(room_code, duration, on_expire)

    # ------------------------------------------------------------------
    # Turn timer (10 seconds per player)
    # ------------------------------------------------------------------
    @classmethod
    def start_turn_timer(cls, room_code: str, duration: int = 10):
        def on_expire():
            game = get_game_state(room_code)
            if game.get("status") != "playing":
                return

            turn_order = game.get("turnOrder", [])
            current_index = game.get("currentTurnIndex", 0)
            next_index = current_index + 1

            if next_index >= len(turn_order):
                # All players have spoken
                update_game_state(room_code, {
                    "currentTurnIndex": next_index,
                    "turnStartedAt": int(time.time() * 1000)
                })
                return

            # Advance to next player
            next_player_id = turn_order[next_index]
            players = game.get("roles", {})
            next_player_name = players.get(next_player_id, {}).get("username", f"Player {next_index + 1}")

            update_game_state(room_code, {
                "currentTurnIndex": next_index,
                "turnStartedAt": int(time.time() * 1000)
            })

            # Post system chat message
            add_chat_message(room_code, {
                "playerId": "system",
                "username": "System",
                "message": f"Time for {next_player_name} to give a hint word.",
                "createdAt": int(time.time() * 1000)
            })

            # Chain next timer
            cls.start_turn_timer(room_code, duration)

        # Post system message for the *first* player if currentTurnIndex == 0
        game = get_game_state(room_code)
        turn_order = game.get("turnOrder", [])
        current_index = game.get("currentTurnIndex", 0)
        if current_index == 0 and turn_order:
            first_pid = turn_order[0]
            players = game.get("roles", {})
            first_name = players.get(first_pid, {}).get("username", "Player 1")
            add_chat_message(room_code, {
                "playerId": "system",
                "username": "System",
                "message": f"Time for {first_name} to give a hint word.",
                "createdAt": int(time.time() * 1000)
            })

        cls._start_timer(room_code, duration, on_expire)

    # ------------------------------------------------------------------
    # Voting timer (30 seconds then auto-finalize)
    # ------------------------------------------------------------------
    @classmethod
    def start_voting_timer(cls, room_code: str, duration: int = 30):
        def on_expire():
            from vote_service import VoteService
            from room_service import get_players_list

            game = get_game_state(room_code)
            if game.get("status") != "voting":
                return

            votes = game.get("votes", {})
            impostor_id = game.get("impostorId", "")
            result = VoteService.resolve_voting(room_code, votes, impostor_id)

            update_game_state(room_code, {
                "status": "result",
                "winner": result.get("winner", "impostor"),
                "resultText": result.get("resultText", ""),
                "eliminatedId": result.get("eliminatedId"),
                "eliminatedName": result.get("eliminatedName"),
                "eliminatedRole": result.get("eliminatedRole"),
                "finishedAt": int(time.time() * 1000)
            })

            # Eliminate player if applicable
            eliminated_id = result.get("eliminatedId")
            if eliminated_id:
                from room_service import update_player
                update_player(room_code, eliminated_id, {"alive": False})

        cls._start_timer(room_code, duration, on_expire)

