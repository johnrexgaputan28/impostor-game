from firebase_admin import db


def get_room(room_code: str):
    ref = db.reference(f"rooms/{room_code}")
    return ref.get()


def get_players(room_code: str):
    ref = db.reference(f"rooms/{room_code}/players")
    data = ref.get()
    return data or {}


def get_players_list(room_code: str) -> list[dict]:
    """Return players as a list of dicts with alive defaults."""
    players_map = get_players(room_code)
    players = []
    for pid, pdata in players_map.items():
        if pdata is None:
            continue
        pdata.setdefault("id", pid)
        pdata.setdefault("alive", True)
        players.append(pdata)
    return players


def get_game_state(room_code: str) -> dict:
    ref = db.reference(f"rooms/{room_code}/game")
    data = ref.get()
    return data or {}


def update_game_state(room_code: str, updates: dict):
    ref = db.reference(f"rooms/{room_code}/game")
    ref.update(updates)


def set_game_state(room_code: str, data: dict):
    ref = db.reference(f"rooms/{room_code}/game")
    ref.set(data)


def add_chat_message(room_code: str, message_obj: dict):
    ref = db.reference(f"rooms/{room_code}/chat")
    new_ref = ref.push()
    new_ref.set(message_obj)


def update_player(room_code: str, player_id: str, updates: dict):
    ref = db.reference(f"rooms/{room_code}/players/{player_id}")
    ref.update(updates)

