from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from firebase_service import get_root_data
from game_engine import GameEngine
from models import StartGameRequest, VoteRequest, PlayerActionRequest
from phase_manager import GamePhase
from room_service import (
    get_room,
    get_players,
    get_players_list,
    get_game_state,
    update_game_state,
    set_game_state,
    add_chat_message,
    update_player,
)
from timer_sevice import TimerService
from vote_service import VoteService

app = FastAPI()

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = GameEngine()


@app.get("/")
def root():
    return {"message": "Python backend is running"}


@app.get("/firebase-test")
def firebase_test():
    data = get_root_data()
    return {"firebase_data": data}


@app.get("/room/{room_code}")
def room_data(room_code: str):
    room = get_room(room_code)
    return {
        "room_code": room_code,
        "room_data": room,
    }


@app.get("/room/{room_code}/players")
def room_players(room_code: str):
    players = get_players(room_code)
    return {
        "room_code": room_code,
        "players": players,
    }


@app.get("/room/{room_code}/game-state")
def game_state(room_code: str):
    state = get_game_state(room_code)
    return {"room_code": room_code, "game": state}


# ------------------------------------------------------------------
# Phase-driving endpoints
# ------------------------------------------------------------------

@app.post("/room/{room_code}/start")
def start_game(room_code: str, req: StartGameRequest):
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    players = get_players_list(room_code)
    if not players:
        raise HTTPException(status_code=400, detail="No players in room.")

    # Optional host check
    host_id = room.get("hostId")
    if host_id and req.hostId != host_id:
        raise HTTPException(status_code=403, detail="Only the host can start the game.")

    try:
        payload = engine.start_new_round(players)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    set_game_state(room_code, payload)
    TimerService.start_reveal_timer(room_code, duration=5)
    return {"ok": True, "game": payload}


@app.post("/room/{room_code}/advance-reveal")
def advance_reveal(room_code: str):
    game = get_game_state(room_code)
    if game.get("status") != GamePhase.ROLE_REVEAL.value:
        raise HTTPException(status_code=400, detail="Not in role-reveal phase.")

    TimerService.cancel_timers(room_code)
    update_game_state(room_code, {
        "status": GamePhase.PLAYING.value,
        "resultText": "The round is live. Players will take turns giving hints.",
        "turnStartedAt": int(__import__("time").time() * 1000),
        "currentTurnIndex": 0,
    })
    TimerService.start_turn_timer(room_code, duration=10)
    return {"ok": True}


@app.post("/room/{room_code}/advance-turn")
def advance_turn(room_code: str):
    game = get_game_state(room_code)
    if game.get("status") != GamePhase.PLAYING.value:
        raise HTTPException(status_code=400, detail="Not in playing phase.")

    turn_order = game.get("turnOrder", [])
    current_index = game.get("currentTurnIndex", 0)
    next_index = current_index + 1

    if next_index >= len(turn_order):
        update_game_state(room_code, {
            "currentTurnIndex": next_index,
            "turnStartedAt": int(__import__("time").time() * 1000),
        })
        return {"ok": True, "allSpoken": True}

    next_player_id = turn_order[next_index]
    roles = game.get("roles", {})
    next_player_name = roles.get(next_player_id, {}).get("username", f"Player {next_index + 1}")

    update_game_state(room_code, {
        "currentTurnIndex": next_index,
        "turnStartedAt": int(__import__("time").time() * 1000),
    })

    add_chat_message(room_code, {
        "playerId": "system",
        "username": "System",
        "message": f"Time for {next_player_name} to give a hint word.",
        "createdAt": int(__import__("time").time() * 1000),
    })

    TimerService.start_turn_timer(room_code, duration=10)
    return {"ok": True, "nextIndex": next_index, "nextPlayer": next_player_name}


@app.post("/room/{room_code}/end-round")
def end_round(room_code: str):
    game = get_game_state(room_code)
    if game.get("status") != GamePhase.PLAYING.value:
        raise HTTPException(status_code=400, detail="Not in playing phase.")

    TimerService.cancel_timers(room_code)
    update_game_state(room_code, {
        "status": GamePhase.VOTING.value,
        "resultText": "Everyone can now vote for the suspected impostor.",
        "votingEndsAt": int(__import__("time").time() * 1000) + 30000,
    })
    TimerService.start_voting_timer(room_code, duration=30)
    return {"ok": True}


@app.post("/room/{room_code}/vote")
def vote(room_code: str, req: VoteRequest):
    game = get_game_state(room_code)
    if game.get("status") != GamePhase.VOTING.value:
        raise HTTPException(status_code=400, detail="Voting is not open.")

    VoteService.record_vote(room_code, req.voterId, req.targetId)

    # Auto-finalize if all active players have voted
    updated_game = get_game_state(room_code)
    votes = updated_game.get("votes", {})
    players = get_players_list(room_code)
    active_players = [p for p in players if p.get("alive", True) and p["id"] != req.voterId]
    # Simple check: number of votes >= number of active players (including self-vote optional)
    # We use a looser check: votes count >= len(players) to be safe for solo testing
    if len(votes) >= len(players):
        return finalize_voting(room_code)

    return {"ok": True, "votes": votes}


@app.post("/room/{room_code}/finalize-voting")
def finalize_voting(room_code: str):
    game = get_game_state(room_code)
    if game.get("status") != GamePhase.VOTING.value:
        raise HTTPException(status_code=400, detail="Not in voting phase.")

    TimerService.cancel_timers(room_code)
    votes = game.get("votes", {})
    impostor_id = game.get("impostorId", "")
    result = VoteService.resolve_voting(room_code, votes, impostor_id)

    update_game_state(room_code, {
        "status": GamePhase.RESULT.value,
        "winner": result.get("winner", "impostor"),
        "resultText": result.get("resultText", ""),
        "eliminatedId": result.get("eliminatedId"),
        "eliminatedName": result.get("eliminatedName"),
        "eliminatedRole": result.get("eliminatedRole"),
        "finishedAt": int(__import__("time").time() * 1000),
    })

    eliminated_id = result.get("eliminatedId")
    if eliminated_id:
        update_player(room_code, eliminated_id, {"alive": False})

    return {"ok": True, "result": result}


@app.post("/room/{room_code}/next-round")
def next_round(room_code: str, req: PlayerActionRequest):
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    host_id = room.get("hostId")
    if host_id and req.playerId != host_id:
        raise HTTPException(status_code=403, detail="Only the host can start the next round.")

    players = get_players_list(room_code)
    game = get_game_state(room_code)
    impostor_id = game.get("impostorId", "")

    winner = engine.check_win_condition(players, impostor_id)
    if winner:
        # Reset to lobby with winner declared
        set_game_state(room_code, {
            "status": GamePhase.LOBBY.value,
            "round": 0,
            "winner": winner,
            "resultText": f"{winner.upper()} wins the game!",
            "roles": None,
            "votes": None,
            "impostorId": "",
            "impostorName": "",
            "word": "",
            "impostorWord": "",
        })
        return {"ok": True, "gameOver": True, "winner": winner}

    # Otherwise start a new round
    try:
        payload = engine.start_new_round(players)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    set_game_state(room_code, payload)
    TimerService.start_reveal_timer(room_code, duration=5)
    return {"ok": True, "game": payload}

