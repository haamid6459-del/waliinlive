const SERVER_URL = "https://waliinlive.onrender.com";

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"]
});

let myName = "";
let currentRoom = "";
let mySocketId = "";
let localStream = null;
let micOn = false;
let cameraOn = false;

const users = {};
const seats = {};

socket.on("connect", () => {
  mySocketId = socket.id;
  console.log("Connected:", socket.id);
});

socket.on("connect_error", () => {
  console.log("Server connection failed");
  document.getElementById("loginStatus").innerText =
    "Server waliin wal qunnamtiin hin milkoofne.";
});

function createRoom() {

  myName = document.getElementById("nameInput").value.trim();

  if (!myName) {
    alert("Maqaa kee galchi.");
    return;
  }

  currentRoom =
    "ROOM-" +
    Math.random().toString(36).substring(2, 8).toUpperCase();

  enterRoom();
}

function joinRoom() {

  myName = document.getElementById("nameInput").value.trim();
  currentRoom = document.getElementById("roomInput").value.trim();

  if (!myName) {
    alert("Maqaa kee galchi.");
    return;
  }

  if (!currentRoom) {
    alert("Room ID galchi.");
    return;
  }

  enterRoom();
}

function enterRoom() {

  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("roomPage").classList.remove("hidden");

  document.getElementById("roomInfo").innerText =
    "Room: " + currentRoom;

  socket.emit("join-room", {
    roomId: currentRoom,
    name: myName
  });
}

socket.on("room-users", data => {

  Object.keys(data.users || {}).forEach(id => {
    users[id] = data.users[id];
  });

  Object.keys(data.seats || {}).forEach(id => {
    seats[id] = data.seats[id];
  });

  renderUsers();
  renderSeats();
});

socket.on("user-joined", user => {

  users[user.id] = user;

  renderUsers();
  updateUserCount();
});

socket.on("user-left", id => {

  delete users[id];

  Object.keys(seats).forEach(seat => {
    if (seats[seat] === id) {
      delete seats[seat];
    }
  });

  renderUsers();
  renderSeats();
  updateUserCount();
});

function renderUsers() {

  const list = document.getElementById("usersList");

  list.innerHTML = "";

  Object.keys(users).forEach(id => {

    const user = users[id];

    const div = document.createElement("div");

    div.className = "userItem";

    div.innerHTML =
      "👤 " + escapeHTML(user.name || "User");

    if (id === mySocketId) {
      div.innerHTML += " <small>(Ati)</small>";
    }

    list.appendChild(div);
  });

  updateUserCount();
}

function updateUserCount() {

  const count = Object.keys(users).length;

  document.getElementById("userCount").innerText =
    count + " users";
}

function renderSeats() {

  const container = document.getElementById("seats");

  container.innerHTML = "";

  const seatNumbers = Object.keys(seats);

  let totalSeats = Math.max(
    10,
    Object.keys(users).length + 5,
    seatNumbers.length
  );

  for (let i = 1; i <= totalSeats; i++) {

    const seat = document.createElement("div");

    seat.className = "seat";

    const occupantId = seats[i];

    if (occupantId) {

      seat.classList.add("occupied");

      const occupant =
        users[occupantId];

      seat.innerHTML = `
        <div class="seatNumber">Seat ${i}</div>
        <div class="seatName">
          🎤 ${escapeHTML(
            occupant ? occupant.name : "User"
          )}
        </div>
      `;

    } else {

      seat.innerHTML = `
        <div class="seatNumber">Seat ${i}</div>
        <div class="seatName">💺 Duwwaa</div>
      `;

      seat.onclick = () => takeSpecificSeat(i);
    }

    container.appendChild(seat);
  }
}

function takeSpecificSeat(seatNumber) {

  socket.emit("take-seat", {
    roomId: currentRoom,
    seat: seatNumber
  });
}

function takeSeat() {

  const occupied =
    Object.keys(seats).map(Number);

  let seat = 1;

  while (occupied.includes(seat)) {
    seat++;
  }

  takeSpecificSeat(seat);
}

function leaveSeat() {

  socket.emit("leave-seat", {
    roomId: currentRoom
  });
}

socket.on("seats-updated", updatedSeats => {

  Object.keys(seats).forEach(k => {
    delete seats[k];
  });

  Object.assign(seats, updatedSeats);

  renderSeats();
});

function sendMessage() {

  const input =
    document.getElementById("messageInput");

  const message = input.value.trim();

  if (!message) return;

  socket.emit("chat-message", {
    roomId: currentRoom,
    message: message,
    name: myName
  });

  input.value = "";
}

socket.on("chat-message", data => {

  const messages =
    document.getElementById("messages");

  const div =
    document.createElement("div");

  div.className = "message";

  div.innerHTML =
    "<strong>" +
    escapeHTML(data.name) +
    ":</strong> " +
    escapeHTML(data.message);

  messages.appendChild(div);

  messages.scrollTop =
    messages.scrollHeight;
});

document
  .getElementById("messageInput")
  .addEventListener("keydown", e => {

    if (e.key === "Enter") {
      sendMessage();
    }

  });

async function toggleMic() {

  if (!localStream) {

    try {

      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });

      micOn = true;

    } catch (error) {

      alert("Microphone hayyame.");
      return;
    }

  } else {

    const track =
      localStream.getAudioTracks()[0];

    if (track) {

      track.enabled = !track.enabled;
      micOn = track.enabled;

    }

  }

  document.getElementById("micBtn").innerText =
    micOn ? "🔊 Mic ON" : "🔇 Mic OFF";
}

async function toggleCamera() {

  if (!localStream) {

    try {

      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });

      micOn = true;
      cameraOn = true;

      showLocalVideo();

    } catch (error) {

      alert("Camera/Microphone hayyame.");
      return;
    }

  } else {

    const track =
      localStream.getVideoTracks()[0];

    if (track) {

      track.enabled = !track.enabled;
      cameraOn = track.enabled;

    } else {

      try {

        const videoStream =
          await navigator.mediaDevices.getUserMedia({
            video: true
          });

        videoStream
          .getVideoTracks()
          .forEach(track => {
            localStream.addTrack(track);
          });

        cameraOn = true;
        showLocalVideo();

      } catch (error) {

        alert("Camera hayyame.");
        return;
      }
    }
  }

  document.getElementById("cameraBtn").innerText =
    cameraOn ? "📹 Camera ON" : "📷 Camera OFF";
}

function showLocalVideo() {

  const area =
    document.getElementById("videoArea");

  let box =
    document.getElementById("localVideoBox");

  if (!box) {

    box = document.createElement("div");

    box.id = "localVideoBox";
    box.className = "videoBox";

    box.innerHTML = `
      <video id="localVideo"
        autoplay
        muted
        playsinline>
      </video>
      <div class="videoName">Ati</div>
    `;

    area.prepend(box);
  }

  const video =
    document.getElementById("localVideo");

  video.srcObject = localStream;
}

function copyRoomLink() {

  const url =
    window.location.origin +
    window.location.pathname +
    "?room=" +
    encodeURIComponent(currentRoom);

  navigator.clipboard.writeText(url);

  alert("Room link copy ta'eera.");
}

function openSettings() {

  document
    .getElementById("settingsModal")
    .classList.remove("hidden");
}

function closeSettings() {

  document
    .getElementById("settingsModal")
    .classList.add("hidden");
}

function saveSettings() {

  const roomName =
    document.getElementById("roomNameInput").value;

  const privacy =
    document.getElementById("privacyInput").value;

  socket.emit("room-settings", {
    roomId: currentRoom,
    roomName: roomName,
    privacy: privacy
  });

  closeSettings();

  alert("Settings save ta'e.");
}

function leaveRoom() {

  if (!confirm("Room keessaa ba'uu barbaaddaa?")) {
    return;
  }

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => track.stop());

    localStream = null;
  }

  socket.emit("leave-room", {
    roomId: currentRoom
  });

  location.reload();
}

function escapeHTML(text) {

  const div =
    document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}

const params =
  new URLSearchParams(window.location.search);

const roomFromURL =
  params.get("room");

if (roomFromURL) {

  document.getElementById("roomInput").value =
    roomFromURL;
  }
