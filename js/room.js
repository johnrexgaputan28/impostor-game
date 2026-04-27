import {
  get,
  gameRef,
  onDisconnect,
  onValue,
  playerRef,
  playersRef,
  remove,
  roomRef,
  serverTimestamp,
  update
} from "./firebase.js";
import { sendChatMessage, subscribeToChat } from "./chat.js";
import {
  advanceFromRoleReveal,
  buildSummary,
  castVote,
  finalizeVoting,
  maybeFinalizeRound,
  nextRound,
  openVoting,
  startGame,
  subscribeToGame,
  subscribeToRoomStatus
} from "./game.js";
import { createPlayerId, escapeHtml, getQueryParams, getSavedRoomSession, getStatusLabel, saveRoomSession } from "./utils.js";

const queryParams = getQueryParams();
const savedSession = getSavedRoomSession();
const roomCode = queryParams.room || savedSession.room;
const username = queryParams.username || savedSession.username;
const currentPlayerId = createPlayerId();

if (!roomCode || !username) {
  window.location.href = "./index.html";
  throw new Error("Missing room code or username.");
}

/* ==================================================================
   DOM references
   ================================================================== */
const elements = {
  // Top bar (persistent)
  roomCodeDisplay: document.querySelector("#room-code-display"),
  currentUserDisplay: document.querySelector("#current-user-display"),
  statusBadge: document.querySelector("#status-badge"),
  copyRoomCode: document.querySelector("#copy-room-code"),

  // Phase sections
  phaseLobby: document.querySelector("#phase-lobby"),
  phaseRoleReveal: document.querySelector("#phase-role-reveal"),
  phasePlay: document.querySelector("#phase-play"),
  phaseVoting: document.querySelector("#phase-voting"),
  phaseResult: document.querySelector("#phase-result"),

  // Lobby phase
  lobbyPlayerCount: document.querySelector("#lobby-player-count"),
  lobbyPlayersList: document.querySelector("#lobby-players-list"),
  lobbyProgress: document.querySelector("#lobby-progress"),
  lobbyStartButton: document.querySelector("#lobby-start-button"),

  // Role reveal phase
  revealRoleBadge: document.querySelector("#reveal-role-badge"),
  revealRoleText: document.querySelector("#reveal-role-text"),
  revealWord: document.querySelector("#reveal-word"),
  revealHint: document.querySelector("#reveal-hint"),
  revealTimer: document.querySelector("#reveal-timer"),

  // Play phase
  playPlayerCount: document.querySelector("#play-player-count"),
  playPlayersList: document.querySelector("#play-players-list"),
  playTimer: document.querySelector("#play-timer"),
  playEndRoundButton: document.querySelector("#play-end-round-button"),
  playChatMessages: document.querySelector("#play-chat-messages"),
  playChatForm: document.querySelector("#play-chat-form"),
  playChatInput: document.querySelector("#play-chat-input"),
  playChatSubmit: document.querySelector("#play-chat-submit"),

  // Turn-based chat system
  turnBanner: document.querySelector("#turn-banner"),
  turnPlayerName: document.querySelector("#turn-player-name"),
  turnCountdown: document.querySelector("#turn-countdown"),
  turnInstruction: document.querySelector("#turn-instruction"),

  // Voting phase
  votingTimer: document.querySelector("#voting-timer"),
  votingCards: document.querySelector("#voting-cards"),
  votingTallyContent: document.querySelector("#voting-tally-content"),

  // Result phase
  resultEliminatedName: document.querySelector("#result-eliminated-name"),
  resultEliminatedRole: document.querySelector("#result-eliminated-role"),
  resultWinnerText: document.querySelector("#result-winner-text"),
  resultSubtext: document.querySelector("#result-subtext"),
  resultNextRoundButton: document.querySelector("#result-next-round-button"),
  resultLeaveButton: document.querySelector("#result-leave-button"),

  // Test-only next phase button
  testNextPhase: document.querySelector("#test-next-phase")
};

/* ==================================================================
   State
   ================================================================== */
const state = {
  room: null,
  players: [],
  game: { status: "waiting", round: 0 },
  currentPlayer: null,
  activePhase: "lobby",
  revealTimerId: null,
  playTimerId: null,
  votingTimerId: null,
  turnTimerId: null,
  testMode: false
};

const PHASE_ORDER = ["lobby", "role-reveal", "playing", "voting", "result"];

const PHASE_SECTIONS = {
  lobby: elements.phaseLobby,
  "role-reveal": elements.phaseRoleReveal,
  playing: elements.phasePlay,
  voting: elements.phaseVoting,
  result: elements.phaseResult,
  waiting: elements.phaseLobby
};

/* ==================================================================
   Presence & host promotion
   ================================================================== */
async function ensurePlayerPresence() {
  let roomSnapshot = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    roomSnapshot = await get(roomRef(roomCode));
    if (roomSnapshot.exists()) {
      break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  if (!roomSnapshot.exists()) {
    window.location.href = "./index.html";
    return;
  }

  const roomData = roomSnapshot.val();
  const existingPlayer = roomData.players?.[currentPlayerId];
  const isHost = roomData.hostId === currentPlayerId || (!roomData.hostId && !existingPlayer);

  await update(playerRef(roomCode, currentPlayerId), {
    id: currentPlayerId,
    username,
    isHost,
    joinedAt: existingPlayer?.joinedAt || Date.now(),
    lastActive: serverTimestamp()
  });

  if (!roomData.hostId) {
    await update(roomRef(roomCode), { hostId: currentPlayerId });
  }

  saveRoomSession(roomCode, username);

  onDisconnect(playerRef(roomCode, currentPlayerId)).remove();
  window.addEventListener("beforeunload", () => {
    remove(playerRef(roomCode, currentPlayerId));
  });
}

async function maybePromoteHost(players) {
  if (!state.room) return;
  const hostStillExists = players.some((p) => p.id === state.room.hostId);
  if (hostStillExists || !players.length) return;

  const nextHost = [...players].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
  await update(roomRef(roomCode), { hostId: nextHost.id });
  await Promise.all(players.map((p) => update(playerRef(roomCode, p.id), { isHost: p.id === nextHost.id })));
}

/* ==================================================================
   Phase router
   ================================================================== */
function switchPhase(phaseName) {
  const target = PHASE_SECTIONS[phaseName] || elements.phaseLobby;

  // Hide all phases
  Object.values(PHASE_SECTIONS).forEach((section) => {
    if (section) section.classList.add("hidden");
  });

  // Show target
  target.classList.remove("hidden");
  state.activePhase = phaseName;

  // Update status badge
  const label = getStatusLabel(phaseName);
  elements.statusBadge.textContent = label;
  elements.statusBadge.className = `status ${phaseName || "waiting"}`;

  // Route to dedicated renderer
  switch (phaseName) {
    case "lobby":
    case "waiting":
      renderLobbyPhase();
      break;
    case "role-reveal":
      renderRoleRevealPhase();
      break;
    case "playing":
      renderPlayPhase();
      break;
    case "voting":
      renderVotingPhase();
      break;
    case "result":
      renderResultPhase();
      break;
    default:
      renderLobbyPhase();
  }
}

/* ==================================================================
   Shared player renderers
   ================================================================== */
function renderLobbyPlayers() {
  elements.lobbyPlayerCount.textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;

  if (!state.players.length) {
    elements.lobbyPlayersList.innerHTML = '<li class="empty-state">No players connected yet.</li>';
    return;
  }

  elements.lobbyPlayersList.innerHTML = state.players.map((player) => `
    <li class="lobby-player-card">
      <div class="lobby-player-avatar">${escapeHtml((player.username || "?").slice(0, 1).toUpperCase())}</div>
      <div class="lobby-player-name">${escapeHtml(player.username)}</div>
      ${player.isHost ? '<span class="lobby-player-badge">HOST</span>' : ""}
      ${player.id === currentPlayerId ? '<span class="lobby-player-badge" style="background:rgba(56,169,255,0.16);color:var(--accent-deep);">YOU</span>' : ""}
    </li>
  `).join("");
}

function renderPlayPlayers() {
  elements.playPlayerCount.textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;

  if (!state.players.length) {
    elements.playPlayersList.innerHTML = '<li class="empty-state">No players connected.</li>';
    return;
  }

  elements.playPlayersList.innerHTML = state.players.map((player) => `
    <li class="player-card">
      <div class="player-meta">
        <strong>${escapeHtml(player.username)}</strong>
        <span>${player.isHost ? "Host" : "Player"}</span>
      </div>
      <div class="button-row">
        ${player.isHost ? '<span class="host-badge">HOST</span>' : ""}
        ${player.id === currentPlayerId ? '<span class="you-badge">YOU</span>' : ""}
      </div>
    </li>
  `).join("");
}

/* ==================================================================
   Phase 1 — Lobby
   ================================================================== */
function renderLobbyPhase() {
  renderLobbyPlayers();

  const isHost = state.currentPlayer?.isHost;
  const enoughPlayers = state.players.length >= 3;

  elements.lobbyStartButton.classList.toggle("hidden", !isHost || !enoughPlayers);

  if (enoughPlayers) {
    elements.lobbyProgress.textContent = isHost ? "Ready to start!" : "Waiting for host to start the game.";
  } else {
    elements.lobbyProgress.textContent = "Need at least 3 players to start.";
  }
}

/* ==================================================================
   Phase 2 — Role Reveal
   ================================================================== */
function renderRoleRevealPhase() {
  const summary = buildSummary(state.game, currentPlayerId);
  const currentRole = summary.currentRole;

  if (currentRole) {
    const isImpostor = currentRole.role === "impostor";
    elements.revealRoleBadge.textContent = isImpostor ? "Impostor" : "Crew";
    elements.revealRoleBadge.classList.toggle("impostor", isImpostor);
    elements.revealRoleText.textContent = isImpostor ? "You are the impostor. Blend in carefully." : "You are a civilian.";
    elements.revealWord.innerHTML = `Your word: <strong>${escapeHtml(currentRole.word)}</strong>`;
    elements.revealHint.textContent = isImpostor
      ? "Pretend you know the shared word. Don't get caught."
      : "Listen carefully to the other players and find the impostor.";
  } else {
    elements.revealRoleBadge.textContent = "—";
    elements.revealRoleBadge.classList.remove("impostor");
    elements.revealRoleText.textContent = "Waiting for role assignment...";
    elements.revealWord.innerHTML = "Your word: <strong>—</strong>";
    elements.revealHint.textContent = "";
  }

  // Countdown timer
  if (state.revealTimerId) {
    clearInterval(state.revealTimerId);
    state.revealTimerId = null;
  }

  const endTime = state.game.revealEndsAt || (Date.now() + 5000);
  const updateTimer = () => {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    elements.revealTimer.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.revealTimerId);
      state.revealTimerId = null;
    }
  };
  updateTimer();
  state.revealTimerId = window.setInterval(updateTimer, 1000);

  // Host auto-advances when timer expires (via backend timer, but host can trigger early)
  if (state.currentPlayer?.isHost) {
    const delay = Math.max(0, endTime - Date.now());
    window.setTimeout(() => {
      if (state.game.status === "role-reveal" && !state.testMode) {
        advanceFromRoleReveal(roomCode);
      }
    }, delay);
  }
}

/* ==================================================================
   Phase 3 — Play (Turn-Based Chat)
   ================================================================== */
function renderPlayPhase() {
  renderPlayPlayers();

  const isHost = state.currentPlayer?.isHost;
  elements.playEndRoundButton.classList.toggle("hidden", !isHost);

  // Play timer (counts up from round start)
  if (state.playTimerId) {
    clearInterval(state.playTimerId);
    state.playTimerId = null;
  }

  const startedAt = state.game.startedAt || Date.now();
  const updatePlayTimer = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const seconds = (elapsed % 60).toString().padStart(2, "0");
    elements.playTimer.textContent = `${minutes}:${seconds}`;
  };
  updatePlayTimer();
  state.playTimerId = window.setInterval(updatePlayTimer, 1000);

  // Turn-based chat system
  renderTurnSystem();
}

/* ==================================================================
   Turn-Based Chat System
   ================================================================== */
function renderTurnSystem() {
  const game = state.game;
  const turnOrder = game.turnOrder || [];
  const currentIndex = game.currentTurnIndex ?? 0;
  const turnDuration = game.turnDurationMs || 10000;
  const turnStartedAt = game.turnStartedAt || Date.now();

  // Clear existing turn timer
  if (state.turnTimerId) {
    clearInterval(state.turnTimerId);
    state.turnTimerId = null;
  }

  // All players have spoken — show completion state
  if (currentIndex >= turnOrder.length || !turnOrder.length) {
    elements.turnBanner.className = "turn-banner all-spoken";
    elements.turnPlayerName.textContent = "All players have spoken!";
    elements.turnCountdown.textContent = "—";
    elements.turnCountdown.classList.remove("urgent");
    elements.turnInstruction.textContent = "The host can now end the round and open voting.";
    elements.playChatInput.disabled = true;
    elements.playChatSubmit.disabled = true;
    return;
  }

  const currentPlayerIdInTurn = turnOrder[currentIndex];
  const currentPlayerObj = state.players.find((p) => p.id === currentPlayerIdInTurn);
  const currentPlayerName = currentPlayerObj?.username || `Player ${currentIndex + 1}`;
  const isMyTurn = currentPlayerIdInTurn === currentPlayerId;
  const turnNumber = currentIndex + 1;

  // Update banner appearance
  if (isMyTurn) {
    elements.turnBanner.className = "turn-banner my-turn";
    elements.turnInstruction.textContent = "It's your turn! Give your hint or defend yourself before time runs out.";
    elements.playChatInput.disabled = false;
    elements.playChatSubmit.disabled = false;
    elements.playChatInput.placeholder = "Type your hint or defence...";
    elements.playChatInput.focus();
  } else {
    elements.turnBanner.className = "turn-banner waiting";
    elements.turnInstruction.textContent = `Waiting for ${escapeHtml(currentPlayerName)} to speak...`;
    elements.playChatInput.disabled = true;
    elements.playChatSubmit.disabled = true;
    elements.playChatInput.placeholder = "Not your turn yet...";
  }

  elements.turnPlayerName.textContent = `${turnNumber}. ${escapeHtml(currentPlayerName)}`;
  elements.turnPlayerName.classList.toggle("you-highlight", isMyTurn);

  // Countdown timer
  const updateTurnCountdown = () => {
    const remainingMs = (turnStartedAt + turnDuration) - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    elements.turnCountdown.textContent = remainingSec;

    if (remainingSec <= 3) {
      elements.turnCountdown.classList.add("urgent");
    } else {
      elements.turnCountdown.classList.remove("urgent");
    }

    // Timer expiry is handled by backend TimerService; frontend just shows countdown
    if (remainingMs <= 0) {
      clearInterval(state.turnTimerId);
      state.turnTimerId = null;
    }
  };

  updateTurnCountdown();
  state.turnTimerId = window.setInterval(updateTurnCountdown, 250);
}

/* ==================================================================
   Chat helpers
   ================================================================== */
function appendSystemMessage(message) {
  const systemHTML = `
    <article class="chat-message system">
      <div class="chat-bubble">
        <p class="message-body">${escapeHtml(message)}</p>
      </div>
    </article>
  `;
  elements.playChatMessages.insertAdjacentHTML("beforeend", systemHTML);
  elements.playChatMessages.scrollTop = elements.playChatMessages.scrollHeight;
}

/* ==================================================================
   Phase 4 — Voting
   ================================================================== */
function renderVotingPhase() {
  const currentVote = state.game.votes?.[currentPlayerId];
  const otherPlayers = state.players.filter((p) => p.id !== currentPlayerId);

  if (!otherPlayers.length) {
    elements.votingCards.innerHTML = '<div class="empty-state">No other players available to vote for.</div>';
  } else {
    elements.votingCards.innerHTML = otherPlayers.map((player) => `
      <div class="voting-card ${currentVote === player.id ? "selected" : ""}" data-player-id="${player.id}">
        <div class="voting-card-avatar">${escapeHtml((player.username || "?").slice(0, 1).toUpperCase())}</div>
        <div class="voting-card-name">${escapeHtml(player.username)}</div>
      </div>
    `).join("");
  }

  // Voting countdown
  if (state.votingTimerId) {
    clearInterval(state.votingTimerId);
    state.votingTimerId = null;
  }

  const votingEndsAt = state.game.votingEndsAt || (Date.now() + 30000);
  const updateVotingTimer = () => {
    const remaining = Math.max(0, Math.ceil((votingEndsAt - Date.now()) / 1000));
    elements.votingTimer.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.votingTimerId);
      state.votingTimerId = null;
    }
  };
  updateVotingTimer();
  state.votingTimerId = window.setInterval(updateVotingTimer, 1000);

  // Live tally
  const totals = Object.values(state.game.votes || {}).reduce((totals, targetId) => {
    totals[targetId] = (totals[targetId] || 0) + 1;
    return totals;
  }, {});
  const tallyEntries = Object.entries(totals);
  if (!tallyEntries.length) {
    elements.votingTallyContent.innerHTML = '<div class="empty-state">No votes yet.</div>';
  } else {
    elements.votingTallyContent.innerHTML = tallyEntries.map(([targetId, count]) => {
      const player = state.players.find((p) => p.id === targetId);
      return `<div class="tally-item"><span>${escapeHtml(player?.username || "Unknown")}</span><strong>${count} vote${count === 1 ? "" : "s"}</strong></div>`;
    }).join("");
  }
}

/* ==================================================================
   Phase 5 — Result
   ================================================================== */
function renderResultPhase() {
  const game = state.game;

  elements.resultEliminatedName.textContent = game.eliminatedName || "No one";

  if (game.eliminatedRole === "impostor") {
    elements.resultEliminatedRole.textContent = "They were the impostor!";
  } else if (game.eliminatedId) {
    elements.resultEliminatedRole.textContent = "They were not the impostor.";
  } else {
    elements.resultEliminatedRole.textContent = "The vote ended in a tie.";
  }

  if (game.winner === "crew") {
    elements.resultWinnerText.textContent = "Crew Wins!";
    elements.resultWinnerText.classList.remove("impostor-win");
    elements.resultSubtext.textContent = game.resultText || "The impostor was caught.";
  } else {
    elements.resultWinnerText.textContent = "Impostor Wins!";
    elements.resultWinnerText.classList.add("impostor-win");
    elements.resultSubtext.textContent = game.resultText || "The impostor fooled the crew.";
  }

  const isHost = state.currentPlayer?.isHost;
  elements.resultNextRoundButton.classList.toggle("hidden", !isHost);
}

/* ==================================================================
   Event handlers
   ================================================================== */
async function handleStartGame() {
  const result = await startGame(roomCode, currentPlayerId);
  if (!result.ok) {
    elements.lobbyProgress.textContent = result.message;
  }
}

async function handleEndRound() {
  await openVoting(roomCode);
}

async function handleVoteSelection(event) {
  const card = event.target.closest("[data-player-id]");
  if (!card) return;

  await castVote(roomCode, currentPlayerId, card.dataset.playerId);
}

async function handleNextRound() {
  await nextRound(roomCode, currentPlayerId);
}

function handleLeaveRoom() {
  remove(playerRef(roomCode, currentPlayerId));
  window.location.href = "./index.html";
}

/* ==================================================================
   TEST ONLY — Phase cycling
   ================================================================== */
function handleTestNextPhase() {
  state.testMode = true;
  const currentIndex = PHASE_ORDER.indexOf(state.activePhase);
  const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
  const nextPhase = PHASE_ORDER[nextIndex];

  // Populate dummy game data so each phase renderer has something to show
  if (!state.game.roles) {
    state.game.roles = {
      [currentPlayerId]: { role: "impostor", word: "Mountain", username }
    };
  }
  if (!state.game.impostorId) {
    state.game.impostorId = currentPlayerId;
    state.game.impostorName = username;
    state.game.word = "Volcano";
    state.game.impostorWord = "Mountain";
  }
  if (!state.game.votes) {
    state.game.votes = {};
  }

  // Set phase-specific dummy data
  switch (nextPhase) {
    case "role-reveal":
      state.game.status = "role-reveal";
      state.game.revealEndsAt = Date.now() + 5000;
      break;
    case "playing":
      state.game.status = "playing";
      state.game.startedAt = Date.now();
      state.game.turnOrder = state.players.map((p) => p.id);
      state.game.currentTurnIndex = 0;
      state.game.turnStartedAt = Date.now();
      break;
    case "voting":
      state.game.status = "voting";
      state.game.votingEndsAt = Date.now() + 30000;
      break;
    case "result":
      state.game.status = "result";
      state.game.winner = "crew";
      state.game.resultText = `${username} was the impostor. The crew wins.`;
      state.game.eliminatedId = currentPlayerId;
      state.game.eliminatedName = username;
      state.game.eliminatedRole = "impostor";
      break;
    default:
      state.game.status = "waiting";
  }

  switchPhase(nextPhase);
}

/* ==================================================================
   Bootstrap
   ================================================================== */
async function bootstrap() {
  await ensurePlayerPresence();
  elements.roomCodeDisplay.textContent = roomCode;
  elements.currentUserDisplay.textContent = username;

  subscribeToRoomStatus(roomCode, (room) => {
    state.room = room;
  });

  onValue(playersRef(roomCode), async (snapshot) => {
    state.players = snapshot.exists()
      ? Object.values(snapshot.val()).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
      : [];
    state.currentPlayer = state.players.find((p) => p.id === currentPlayerId) || null;

    // Re-render the active phase so player lists stay fresh
    switchPhase(state.activePhase);
    await maybePromoteHost(state.players);
  });

  subscribeToGame(roomCode, async (game) => {
    const previousStatus = state.game.status;
    state.game = game;

    // In test mode the Next Phase button drives the UI manually,
    // so ignore Firebase-driven phase switches.
    if (state.testMode) {
      switchPhase(state.activePhase);
      return;
    }

    // When status changes, switch to the matching phase
    if (game.status !== previousStatus) {
      switchPhase(game.status);
    } else {
      // Same status — just re-render current phase for live data (votes, timer, etc.)
      switchPhase(state.activePhase);
    }

    // Optionally finalize if backend hasn't already (fallback)
    if (game.status === "voting") {
      await maybeFinalizeRound(roomCode, state.players, game);
    }
  });

  // Chat only lives in the play phase
  subscribeToChat(roomCode, currentPlayerId, elements.playChatMessages);
}

/* ==================================================================
   Event listeners
   ================================================================== */
elements.lobbyStartButton?.addEventListener("click", handleStartGame);
elements.playEndRoundButton?.addEventListener("click", handleEndRound);
elements.votingCards?.addEventListener("click", handleVoteSelection);
elements.resultNextRoundButton?.addEventListener("click", handleNextRound);
elements.resultLeaveButton?.addEventListener("click", handleLeaveRoom);

elements.playChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendChatMessage(roomCode, { id: currentPlayerId, username }, elements.playChatInput.value);
  elements.playChatInput.value = "";
});

elements.copyRoomCode?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(roomCode);
  elements.copyRoomCode.textContent = "Copied";
  setTimeout(() => {
    elements.copyRoomCode.textContent = "Copy code";
  }, 1200);
});

// Test-only: cycle through phases manually to preview each layout
elements.testNextPhase?.addEventListener("click", handleTestNextPhase);

bootstrap();
