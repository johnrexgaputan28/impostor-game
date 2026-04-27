# Who Is The Impostor

A simple multiplayer word game built with vanilla HTML, CSS, JavaScript, and Firebase Realtime Database.

## Features

- Create or join private rooms with a 6-character code
- Live room roster with automatic host assignment
- Realtime room chat powered by Firebase Realtime Database
- Host-controlled game flow: waiting, playing, voting, result
- Random impostor selection and per-player role assignment stored in Firebase
- Realtime vote tracking and automatic round resolution
- Responsive layout for desktop and mobile

## Project structure

/impostor-game
|-- index.html
|-- room.html
|-- css/style.css
|-- js/firebase.js
|-- js/app.js
|-- js/room.js
|-- js/chat.js
|-- js/game.js
|-- js/utils.js
|-- assets/images
|-- assets/sounds
|-- README.md

## Firebase setup

1. Create a Firebase project.
2. Enable Realtime Database in test mode while developing.
3. Enable Google and Facebook sign-in inside Firebase Authentication if you want to use the social login buttons.
4. Add your app domain to the authorized domains list in Firebase Authentication.
5. Copy your web app config values into `js/firebase.js`.
6. Confirm `databaseURL` points at your Realtime Database region URL.
7. Host the project locally or on Firebase Hosting.

## Suggested database shape

```json
{
  "rooms": {
    "ABC123": {
      "createdAt": 1710000000000,
      "hostId": "player-id",
      "players": {
        "player-id": {
          "id": "player-id",
          "username": "Alex",
          "isHost": true,
          "joinedAt": 1710000000000
        }
      },
      "chat": {
        "message-id": {
          "playerId": "player-id",
          "username": "Alex",
          "message": "I think it belongs indoors.",
          "createdAt": 1710000000000
        }
      },
      "game": {
        "status": "waiting",
        "impostorId": "player-id",
        "word": "Library",
        "impostorWord": "Museum",
        "roles": {},
        "votes": {}
      }
    }
  }
}
```

## Running the project

Because the app uses ES modules, serve it from a local web server instead of opening the HTML files directly.

Example options:

- `npx serve .`
- VS Code Live Server
- Firebase Hosting

## Notes

- The impostor currently receives a related but different word. If you prefer no word at all, update `js/game.js` so the impostor word is an empty string.
- Firebase security rules should be tightened before production use.
- A good next step is adding round timers and a rematch button.
