import { chatRef, onValue, push, serverTimestamp, set } from "./firebase.js";
import { escapeHtml, formatTimestamp } from "./utils.js";

function subscribeToChat(roomCode, currentPlayerId, container) {
  onValue(chatRef(roomCode), (snapshot) => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldStickToBottom = distanceFromBottom < 80;
    const chatEntries = snapshot.exists() ? Object.values(snapshot.val()) : [];
    const sortedEntries = chatEntries.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));

    if (!sortedEntries.length) {
      container.innerHTML = '<div class="empty-state">No chat yet. Start the discussion with a careful clue.</div>';
      return;
    }

    container.innerHTML = sortedEntries.map((entry) => `
      <article class="chat-message ${entry.playerId === currentPlayerId ? "own" : ""}">
        <div class="chat-avatar ${entry.playerId === currentPlayerId ? "own" : "other"}">
          ${escapeHtml((entry.username || "?").slice(0, 1).toUpperCase())}
        </div>
        <div class="chat-bubble">
          <div class="message-meta">
            <strong>${escapeHtml(entry.username)}</strong>
            <span>${formatTimestamp(entry.createdAt)}</span>
          </div>
          <p class="message-body">${escapeHtml(entry.message)}</p>
        </div>
      </article>
    `).join("");

    if (shouldStickToBottom) {
      container.scrollTop = container.scrollHeight;
    }
  });
}

async function sendChatMessage(roomCode, player, message) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return;
  }

  const messageRef = push(chatRef(roomCode));
  await set(messageRef, {
    playerId: player.id,
    username: player.username,
    message: trimmedMessage,
    createdAt: Date.now(),
    serverCreatedAt: serverTimestamp()
  });
}

export { sendChatMessage, subscribeToChat };
