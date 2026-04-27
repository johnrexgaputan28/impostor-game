import { gameRef, get, onValue, playersRef, roomRef, set, update, votesRef } from "./firebase.js";
import { apiCall, getStatusLabel, pickRandomWordSet, shuffle } from "./utils.js";

const ROLE_REVEAL_DURATION_MS = 5000;

/* ==================================================================
   API-backed game actions (Python is the system)
   ================================================================== */

async function startGame(roomCode, hostId) {
  try {
    const result = await apiCall(`/room/${roomCode}/start`, {
      method: "POST",
      body: JSON.stringify({ hostId })
    });
    return { ok: true, message: "Round started.", data: result };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

async function advanceFromRoleReveal(roomCode) {
  try {
    await apiCall(`/room/${roomCode}/advance-reveal`, { method: "POST" });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

async function advanceTurn(roomCode) {
  try {
    await apiCall(`/room/${roomCode}/advance-turn`, { method: "POST" });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

async function openVoting(roomCode) {
  try {
    await apiCall(`/room/${roomCode}/end-round`, { method: "POST" });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

async function castVote(roomCode, voterId, targetId) {
  try {
    await apiCall(`/room/${roomCode}/vote`, {
      method: "POST",
      body: JSON.stringify({ voterId, targetId })
    });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

async function finalizeVoting(roomCode) {
  try {
    await apiCall(`/room/${roomCode}/finalize-voting`, { method: "POST" });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

async function nextRound(roomCode, playerId) {
  try {
    const result = await apiCall(`/room/${roomCode}/next-round`, {
      method: "POST",
      body: JSON.stringify({ playerId })
    });
    return { ok: true, data: result };
  } catch (error) {
    console.error(error);
    return { ok: false, message: error.message };
  }
}

/* ==================================================================
   Local helpers & subscriptions (read-only from Firebase)
   ================================================================== */

function tallyVotes(votes) {
  return Object.values(votes || {}).reduce((totals, targetId) => {
    totals[targetId] = (totals[targetId] || 0) + 1;
    return totals;
  }, {});
}

async function maybeFinalizeRound(roomCode, players, game) {
  // The backend handles finalization via timers, but we keep a lightweight
  // client-side guard in case the socket misses it or we want faster UX.
  if (game.status !== "voting") {
    return;
  }

  const voteEntries = Object.entries(game.votes || {});
  if (voteEntries.length >= players.length) {
    await finalizeVoting(roomCode);
  }
}

function subscribeToGame(roomCode, callback) {
  onValue(gameRef(roomCode), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : { status: "waiting", round: 0 });
  });
}

function subscribeToRoomStatus(roomCode, callback) {
  onValue(roomRef(roomCode), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

function buildSummary(game, currentPlayerId) {
  const statusLabel = getStatusLabel(game.status);
  const currentRole = game.roles?.[currentPlayerId];

  let roleText = "Waiting for the host to start the round.";
  let wordText = "Your word will appear once the round starts.";

  if (currentRole) {
    if (game.status === "role-reveal") {
      roleText = currentRole.role === "impostor"
        ? "You are the impostor. Blend in carefully."
        : "You are a civilian. Use the shared word to find the impostor.";
      wordText = `Your word: ${currentRole.word}`;
    } else if (game.status === "playing") {
      roleText = currentRole.role === "impostor"
        ? "You are the impostor. Blend in carefully."
        : "You are a civilian. Use the shared word to find the impostor.";
      wordText = `Your word: ${currentRole.word}`;
    } else {
      roleText = currentRole.role === "impostor" ? "You were the impostor." : "You were a civilian.";
      wordText = `Your word was: ${currentRole.word}`;
    }
  }

  return { statusLabel, roleText, wordText, currentRole };
}

export {
  advanceFromRoleReveal,
  advanceTurn,
  buildSummary,
  castVote,
  finalizeVoting,
  maybeFinalizeRound,
  nextRound,
  openVoting,
  startGame,
  subscribeToGame,
  subscribeToRoomStatus,
  tallyVotes
};

