# TODO: Make Python the Game System

## Goal
Move all game-driving logic (phase transitions, timers, role assignment, voting resolution, win conditions) from the JavaScript frontend to the Python backend. The frontend becomes a pure UI layer that calls Python REST endpoints; Python writes game state to Firebase; the frontend reads Firebase and renders.

## Status: COMPLETE

### 1. Backend Models (`python-backend/models.py`)
- [x] Add Pydantic request models: `VoteRequest`, `StartGameRequest`, `PlayerActionRequest`.

### 2. Backend Room Service (`python-backend/room_service.py`)
- [x] Add `update_game_state(room_code, updates)` — writes to `rooms/{code}/game`.
- [x] Add `get_game_state(room_code)` — reads `rooms/{code}/game`.
- [x] Add `add_chat_message(room_code, message_obj)` — pushes to `rooms/{code}/chat`.
- [x] Add `get_players_list(room_code)` — returns list of player dicts.

### 3. Backend Vote Service (`python-backend/vote_service.py`)
- [x] Implement `VoteService` class.
- [x] `record_vote(room_code, voter_id, target_id)`.
- [x] `tally_votes(votes_dict)`.
- [x] `resolve_voting(players, votes, impostor_id)` → integrate with `GameEngine.resolve_voting()`.

### 4. Backend Timer Service (`python-backend/timer_sevice.py`)
- [x] Implement `TimerService` using `asyncio` background tasks.
- [x] `start_reveal_timer(room_code, duration=5)` → auto-advance to `playing`.
- [x] `start_turn_timer(room_code, duration=10)` → auto-advance to next player; post system chat message.
- [x] `start_voting_timer(room_code, duration=30)` → auto-finalize voting.
- [x] `cancel_timers(room_code)`.

### 5. Backend Game Engine (`python-backend/game_engine.py`)
- [x] Add `build_turn_order(players) -> list[str]`.
- [x] Add `eliminate_player(room_code, player_id)` integration method.
- [x] Ensure `check_win_condition` works with Firebase player dicts.

### 6. Backend API (`python-backend/app.py`)
- [x] Enable CORS.
- [x] `POST /room/{code}/start` → `GameEngine.start_new_round()` + start reveal timer.
- [x] `POST /room/{code}/advance-reveal` → advance from role-reveal to playing; start turn timer.
- [x] `POST /room/{code}/advance-turn` → advance turn index; post system message; start next turn timer.
- [x] `POST /room/{code}/end-round` → open voting; start voting timer.
- [x] `POST /room/{code}/vote` → record vote; if all voted, finalize.
- [x] `POST /room/{code}/finalize-voting` → tally, resolve, write result.
- [x] `POST /room/{code}/next-round` → check win condition; if none, start new round; else go to lobby.
- [x] `GET /room/{code}/game-state` → return current game state.

### 7. Frontend Utilities (`js/utils.js`)
- [x] Add `API_BASE_URL` (default `http://localhost:8000`).
- [x] Add `apiCall(endpoint, options)` helper with JSON headers.

### 8. Frontend Game (`js/game.js`)
- [x] Refactor `startGame(roomCode)` → `POST /room/{code}/start`.
- [x] Refactor `advanceFromRoleReveal(roomCode)` → `POST /room/{code}/advance-reveal`.
- [x] Refactor `advanceTurn(roomCode, nextIndex)` → `POST /room/{code}/advance-turn`.
- [x] Refactor `openVoting(roomCode)` → `POST /room/{code}/end-round`.
- [x] Refactor `castVote(roomCode, voterId, targetId)` → `POST /room/{code}/vote`.
- [x] Refactor `maybeFinalizeRound(roomCode, players, game)` → `POST /room/{code}/finalize-voting` (or triggered by backend timer).
- [x] Refactor `handleNextRound` logic → `POST /room/{code}/next-round`.
- [x] Keep `subscribeToGame`, `buildSummary`, `tallyVotes` for UI rendering only.

### 9. Frontend Room Controller (`js/room.js`)
- [x] Update event handlers to call refactored `game.js` wrappers.
- [x] Remove direct Firebase game-state writes (except presence/chat).
- [x] Ensure `testMode` still works with dummy data for UI preview.

### 10. Testing
- [x] All Python files pass `py_compile` syntax check.
- [x] All JS files pass `node --check` syntax check.
- [ ] Run `pip install -r python-backend/requirements.txt`.
- [ ] Start backend: `uvicorn app:app --reload`.
- [ ] Serve frontend statically.
- [ ] Test full flow: Lobby → Start → Role Reveal → Play (turns) → Voting → Result → Next Round.

## Architecture Summary

```
Frontend (JS)          Python Backend              Firebase RTDB
-------------          --------------              -------------
UI / Rendering    <--  Writes game state  -->  rooms/{code}/game
Calls REST API    -->  TimerService (asyncio)    rooms/{code}/chat
Subscribes to     <--  GameEngine logic       rooms/{code}/players
Firebase onValue
```

- **Frontend** is now a thin UI layer: it calls Python endpoints for all game actions and listens to Firebase for real-time state updates.
- **Python** is the system: it assigns roles, manages timers, handles turns, resolves votes, checks win conditions, and publishes state to Firebase.
- **Firebase** remains the real-time data bus: Python writes, frontend reads.

