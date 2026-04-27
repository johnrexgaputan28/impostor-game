import {
  auth,
  get,
  loginWithEmail,
  onAuthStateChanged,
  playerRef,
  registerWithEmail,
  roomRef,
  serverTimestamp,
  signInWithFacebook,
  signInWithGoogle,
  signOut,
  update,
  updateProfile
} from "./firebase.js";
import {
  createPlayerId,
  generateRoomCode,
  normalizeRoomCode,
  normalizeUsername,
  redirectToRoom,
  saveRoomSession
} from "./utils.js";

const usernameInput = document.querySelector("#username");
const roomCodeInput = document.querySelector("#roomCode");
const feedback = document.querySelector("#form-feedback");
const createRoomButton = document.querySelector("#create-room");
const joinRoomButton = document.querySelector("#join-room");
const googleLoginButton = document.querySelector("#google-login");
const facebookLoginButton = document.querySelector("#facebook-login");
const emailSignUpButton = document.querySelector("#email-sign-up");
const emailLoginButton = document.querySelector("#email-login");
const authNameInput = document.querySelector("#auth-name");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const signOutButton = document.querySelector("#sign-out-button");
const authDisplayName = document.querySelector("#auth-display-name");
const authDisplayEmail = document.querySelector("#auth-display-email");
const roomStepModal = document.querySelector("#room-step-modal");
const roomStepCard = document.querySelector("#room-step-card");
const closeRoomStepButton = document.querySelector("#close-room-step");
const lobbyForm = document.querySelector("#lobby-form");
const playerId = createPlayerId();
let hasShownRoomModal = false;

function showFeedback(message, isError = true) {
  feedback.textContent = message;
  feedback.style.color = isError ? "var(--danger)" : "var(--success)";
}

function isAuthenticated() {
  return Boolean(auth.currentUser);
}

function setLobbyAccess(enabled) {
  usernameInput.disabled = !enabled;
  roomCodeInput.disabled = !enabled;
  createRoomButton.disabled = !enabled;
  joinRoomButton.disabled = !enabled;
}

function openRoomStepModal() {
  roomStepModal?.classList.remove("hidden");
  roomStepModal?.setAttribute("aria-hidden", "false");
}

function closeRoomStepModal() {
  roomStepModal?.classList.add("hidden");
  roomStepModal?.setAttribute("aria-hidden", "true");
}

function setButtonsDisabled(disabled) {
  createRoomButton.disabled = disabled || !isAuthenticated();
  joinRoomButton.disabled = disabled || !isAuthenticated();
  googleLoginButton.disabled = disabled;
  facebookLoginButton.disabled = disabled;
  emailSignUpButton.disabled = disabled;
  emailLoginButton.disabled = disabled;
  authNameInput.disabled = disabled;
  authEmailInput.disabled = disabled;
  authPasswordInput.disabled = disabled;
  roomCodeInput.disabled = disabled || !isAuthenticated();
}

function fillUsernameFromAuth(user) {
  const fallbackName = user.displayName || user.email?.split("@")[0] || "";
  const normalizedName = normalizeUsername(fallbackName);

  if (normalizedName) {
    usernameInput.value = normalizedName;
  }
}

function renderAuthState(user) {
  if (!user) {
    authDisplayName.textContent = "Authentication Required";
    authDisplayEmail.textContent = "Use Google, Facebook, or email to continue.";
    signOutButton.classList.add("hidden");
    closeRoomStepModal();
    hasShownRoomModal = false;
    usernameInput.value = "";
    usernameInput.setAttribute("readonly", "readonly");
    usernameInput.placeholder = "Sign in to fill your username";
    setLobbyAccess(false);
    return;
  }

  authDisplayName.textContent = user.displayName || "Signed in player";
  authDisplayEmail.textContent = user.email || "Social account connected";
  signOutButton.classList.remove("hidden");
  fillUsernameFromAuth(user);
  usernameInput.setAttribute("readonly", "readonly");
  authNameInput.value = user.displayName || "";
  authEmailInput.value = user.email || "";
  authPasswordInput.value = "";
  roomCodeInput.disabled = false;
  setLobbyAccess(true);

  if (!hasShownRoomModal) {
    openRoomStepModal();
    hasShownRoomModal = true;
  }
}

function validateUsername() {
  if (!isAuthenticated()) {
    showFeedback("Sign in first before creating or joining a room.");
    return "";
  }

  const username = normalizeUsername(usernameInput.value);

  if (!username) {
    showFeedback("Enter a username before continuing.");
    usernameInput.focus();
    return "";
  }

  showFeedback("", false);
  return username;
}

function validateEmailCredentials(requireName = false) {
  const displayName = normalizeUsername(authNameInput.value);
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (requireName && !displayName) {
    showFeedback("Add a display name before creating an account.");
    authNameInput.focus();
    return null;
  }

  if (!email) {
    showFeedback("Enter your email address.");
    authEmailInput.focus();
    return null;
  }

  if (password.length < 6) {
    showFeedback("Password must be at least 6 characters long.");
    authPasswordInput.focus();
    return null;
  }

  return { displayName, email, password };
}

async function handleSocialLogin(providerName) {
  setButtonsDisabled(true);
  showFeedback(`Connecting to ${providerName}...`, false);

  try {
    const result = providerName === "Google"
      ? await signInWithGoogle()
      : await signInWithFacebook();
    renderAuthState(result.user);
    showFeedback(`${providerName} account connected. You can create or join a room now.`, false);
  } catch (error) {
    console.error(error);
    showFeedback(`${providerName} login failed. Make sure the provider is enabled in Firebase Auth.`);
  } finally {
    setButtonsDisabled(false);
  }
}

async function handleEmailSignUp() {
  const credentials = validateEmailCredentials(true);
  if (!credentials) {
    return;
  }

  setButtonsDisabled(true);
  showFeedback("Creating your account...", false);

  try {
    const result = await registerWithEmail(credentials.email, credentials.password);
    await updateProfile(result.user, { displayName: credentials.displayName });
    renderAuthState({ ...result.user, displayName: credentials.displayName });
    showFeedback("Account created. You can create or join a room now.", false);
  } catch (error) {
    console.error(error);
    showFeedback("Email sign-up failed. Make sure Email/Password is enabled in Firebase Auth.");
  } finally {
    setButtonsDisabled(false);
  }
}

async function handleEmailLogin() {
  const credentials = validateEmailCredentials(false);
  if (!credentials) {
    return;
  }

  setButtonsDisabled(true);
  showFeedback("Signing you in...", false);

  try {
    const result = await loginWithEmail(credentials.email, credentials.password);
    renderAuthState(result.user);
    showFeedback("Logged in successfully. You can create or join a room now.", false);
  } catch (error) {
    console.error(error);
    showFeedback("Email login failed. Double-check your email, password, and Firebase Auth settings.");
  } finally {
    setButtonsDisabled(false);
  }
}

async function createRoom() {
  const username = validateUsername();
  if (!username) {
    return;
  }

  setButtonsDisabled(true);
  showFeedback("Creating your room...", false);

  try {
    let roomCode = generateRoomCode();
    let roomSnapshot = await get(roomRef(roomCode));

    while (roomSnapshot.exists()) {
      roomCode = generateRoomCode();
      roomSnapshot = await get(roomRef(roomCode));
    }

    const joinedAt = Date.now();

    await update(roomRef(roomCode), {
      createdAt: joinedAt,
      hostId: playerId,
      "game/status": "waiting",
      "game/round": 0,
      [`players/${playerId}/id`]: playerId,
      [`players/${playerId}/username`]: username,
      [`players/${playerId}/isHost`]: true,
      [`players/${playerId}/joinedAt`]: joinedAt,
      [`players/${playerId}/lastActive`]: joinedAt,
      [`players/${playerId}/authUid`]: auth.currentUser?.uid || null,
      [`players/${playerId}/photoURL`]: auth.currentUser?.photoURL || null
    });

    saveRoomSession(roomCode, username);
    redirectToRoom(roomCode, username);
  } catch (error) {
    console.error(error);
    showFeedback("Room creation failed. Check your Firebase config and Realtime Database rules.");
  } finally {
    setButtonsDisabled(false);
  }
}

async function joinRoom(event) {
  event.preventDefault();

  const username = validateUsername();
  const roomCode = normalizeRoomCode(roomCodeInput.value);

  if (!username) {
    return;
  }

  if (!roomCode) {
    showFeedback("Enter a room code to join an existing room.");
    roomCodeInput.focus();
    return;
  }

  setButtonsDisabled(true);
  showFeedback("Joining room...", false);

  try {
    const roomSnapshot = await get(roomRef(roomCode));
    if (!roomSnapshot.exists()) {
      showFeedback("That room does not exist yet. Double-check the code or create a new one.");
      return;
    }

    const roomData = roomSnapshot.val();
    const players = roomData.players || {};
    const isHost = roomData.hostId === playerId || Object.keys(players).length === 0;

    await update(playerRef(roomCode, playerId), {
      id: playerId,
      username,
      isHost,
      joinedAt: players[playerId]?.joinedAt || Date.now(),
      lastActive: serverTimestamp(),
      authUid: auth.currentUser?.uid || null,
      photoURL: auth.currentUser?.photoURL || null
    });

    if (isHost && roomData.hostId !== playerId) {
      await update(roomRef(roomCode), { hostId: playerId });
    }

    saveRoomSession(roomCode, username);
    redirectToRoom(roomCode, username);
  } catch (error) {
    console.error(error);
    showFeedback("Unable to join the room right now. Please try again.");
  } finally {
    setButtonsDisabled(false);
  }
}

googleLoginButton?.addEventListener("click", () => handleSocialLogin("Google"));
facebookLoginButton?.addEventListener("click", () => handleSocialLogin("Facebook"));
emailSignUpButton?.addEventListener("click", handleEmailSignUp);
emailLoginButton?.addEventListener("click", handleEmailLogin);
signOutButton?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setLobbyAccess(false);
    showFeedback("Signed out. Sign in again to create or join a room.", false);
  } catch (error) {
    console.error(error);
    showFeedback("Unable to sign out right now.");
  }
});
closeRoomStepButton?.addEventListener("click", closeRoomStepModal);
roomStepModal?.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeRoomStepModal();
  }
});
createRoomButton?.addEventListener("click", createRoom);
lobbyForm?.addEventListener("submit", joinRoom);

onAuthStateChanged(auth, (user) => {
  renderAuthState(user);

  if (!user) {
    roomCodeInput.value = "";
  }
});
