const ROOM_CODE_LENGTH = 6;
const SESSION_KEY = "impostorRoomSession";

const WORD_SETS = [
  { common: "Volcano", impostor: "Mountain" },
  { common: "Library", impostor: "Museum" },
  { common: "Piano", impostor: "Guitar" },
  { common: "Airport", impostor: "Train Station" },
  { common: "Jungle", impostor: "Forest" },
  { common: "Astronaut", impostor: "Pilot" },
  { common: "Chocolate", impostor: "Coffee" },
  { common: "Detective", impostor: "Reporter" },
  { common: "Lantern", impostor: "Flashlight" },
  { common: "Ocean", impostor: "River" }
];

const API_BASE_URL = localStorage.getItem("apiBaseUrl") || "http://localhost:8000";

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaults = {
    headers: { "Content-Type": "application/json" }
  };
  const response = await fetch(url, { ...defaults, ...options });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

function createPlayerId() {
  const storedId = localStorage.getItem("impostorPlayerId");
  if (storedId) {
    return storedId;
  }

  const newId = crypto.randomUUID();
  localStorage.setItem("impostorPlayerId", newId);
  return newId;
}

function normalizeUsername(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 20);
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    room: normalizeRoomCode(params.get("room") || ""),
    username: normalizeUsername(params.get("username") || "")
  };
}

function saveRoomSession(roomCode, username) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    room: normalizeRoomCode(roomCode),
    username: normalizeUsername(username)
  }));
}

function getSavedRoomSession() {
  try {
    const rawValue = sessionStorage.getItem(SESSION_KEY);
    if (!rawValue) {
      return { room: "", username: "" };
    }

    const session = JSON.parse(rawValue);
    return {
      room: normalizeRoomCode(session.room || ""),
      username: normalizeUsername(session.username || "")
    };
  } catch {
    return { room: "", username: "" };
  }
}

function redirectToRoom(roomCode, username) {
  saveRoomSession(roomCode, username);
  const params = new URLSearchParams({ room: roomCode, username });
  window.location.href = `./room.html?${params.toString()}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "just now";
  }

  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, '&#39;');
}

function pickRandomWordSet() {
  return WORD_SETS[Math.floor(Math.random() * WORD_SETS.length)];
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function getStatusLabel(status) {
  const map = {
    waiting: "Waiting",
    "role-reveal": "Role Reveal",
    playing: "Playing",
    voting: "Voting",
    result: "Result"
  };

  return map[status] || "Waiting";
}

export {
  apiCall,
  createPlayerId,
  escapeHtml,
  formatTimestamp,
  generateRoomCode,
  getSavedRoomSession,
  getQueryParams,
  getStatusLabel,
  normalizeRoomCode,
  normalizeUsername,
  pickRandomWordSet,
  redirectToRoom,
  saveRoomSession,
  shuffle
};

