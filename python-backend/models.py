from typing import Optional

from pydantic import BaseModel


class Player(BaseModel):
    id: str
    username: str
    isHost: bool = False
    authUid: Optional[str] = None
    alive: bool = True


class GameState(BaseModel):
    phase: str = "lobby"
    round: int = 0
    winner: Optional[str] = None


class Room(BaseModel):
    roomCode: str
    hostId: str


class StartGameRequest(BaseModel):
    hostId: str


class VoteRequest(BaseModel):
    voterId: str
    targetId: str


class PlayerActionRequest(BaseModel):
    playerId: str

