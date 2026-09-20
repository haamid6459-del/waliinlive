const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.json({
    app: "Waliin Live",
    status: "online",
    usersLimit: "unlimited",
    seatSystem: true
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size
  });
});

/* =========================
   ROOM
========================= */

function createRoom(roomId, hostId, hostName) {
  return {
    id: roomId,

    hostId,

    users: new Map(),

    seats: new Map(),

    settings: {
      chat: true,
      camera: true,
      microphone: true
    },

    createdAt: new Date().toISOString()
  };
}

function getUsers(room) {
  return [...room.users.values()];
}

function getSeats(room) {
  return [...room.seats.entries()].map(([seatId, userId]) => {

    const user = room.users.get(userId);

    return {
      seatId,
      userId,
      name: user ? user.name : "Unknown"
    };
  });
}

/* =========================
   SOCKET
========================= */

io.on("connection", socket => {

  console.log("Connected:", socket.id);

  /* =========================
     CREATE ROOM
  ========================= */

  socket.on("create-room", ({ roomId, name }, callback) => {

    if (!roomId || !name) {
      return callback({
        success: false,
        message: "Room ID fi maqaa guuti."
      });
    }

    if (rooms.has(roomId)) {
      return callback({
        success: false,
        message: "Room kun duraan jira."
      });
    }

    const room = createRoom(
      roomId,
      socket.id,
      name
    );

    rooms.set(roomId, room);

    joinRoom(socket, roomId, name, callback);
  });

  /* =========================
     JOIN ROOM
  ========================= */

  socket.on("join-room", ({ roomId, name }, callback) => {

    if (!roomId || !name) {
      return callback({
        success: false,
        message: "Room ID fi maqaa guuti."
      });
    }

    if (!rooms.has(roomId)) {

      return callback({
        success: false,
        message: "Room hin argamne."
      });
    }

    joinRoom(socket, roomId, name, callback);
  });

  /* =========================
     JOIN FUNCTION
  ========================= */

  function joinRoom(socket, roomId, name, callback) {

    const room = rooms.get(roomId);

    const user = {
      id: socket.id,
      name: name.trim(),
      joinedAt: new Date().toISOString()
    };

    room.users.set(socket.id, user);

    socket.join(roomId);

    socket.roomId = roomId;

    callback({
      success: true,

      roomId,

      socketId: socket.id,

      isHost: room.hostId === socket.id,

      users: getUsers(room),

      seats: getSeats(room),

      settings: room.settings
    });

    socket.to(roomId).emit("user-joined", user);

    io.to(roomId).emit(
      "room-users",
      getUsers(room)
    );
  }

  /* =========================
     TAKE SEAT
  ========================= */

  socket.on("take-seat", ({ roomId, seatId }, callback) => {

    const room = rooms.get(roomId);

    if (!room) {
      return callback({
        success: false,
        message: "Room hin argamne."
      });
    }

    if (!room.users.has(socket.id)) {
      return callback({
        success: false,
        message: "Room keessa hin jirtu."
      });
    }

    /* User already has a seat */

    for (const [id, userId] of room.seats) {

      if (userId === socket.id) {

        return callback({
          success: false,
          message: "Ati duraan kursii qabda."
        });
      }
    }

    /* Seat already occupied */

    if (room.seats.has(String(seatId))) {

      return callback({
        success: false,
        message: "Kursiin kun qabameera."
      });
    }

    room.seats.set(
      String(seatId),
      socket.id
    );

    io.to(roomId).emit(
      "seats-updated",
      getSeats(room)
    );

    callback({
      success: true,
      seatId
    });
  });

  /* =========================
     LEAVE SEAT
  ========================= */

  socket.on("leave-seat", ({ roomId }, callback) => {

    const room = rooms.get(roomId);

    if (!room) {
      return callback({
        success: false
      });
    }

    let removed = false;

    for (const [seatId, userId] of room.seats) {

      if (userId === socket.id) {

        room.seats.delete(seatId);

        removed = true;
        break;
      }
    }

    io.to(roomId).emit(
      "seats-updated",
      getSeats(room)
    );

    callback({
      success: removed
    });
  });

  /* =========================
     CHAT
  ========================= */

  socket.on("chat-message", ({ roomId, message }) => {

    const room = rooms.get(roomId);

    if (!room || !room.settings.chat) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    io.to(roomId).emit("chat-message", {

      sender: user.name,

      senderId: socket.id,

      message: String(message).slice(0, 2000),

      time: new Date().toISOString()
    });
  });

  /* =========================
     SETTINGS
  ========================= */

  socket.on("room-settings", ({ roomId, settings }) => {

    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostId !== socket.id) return;

    room.settings = {
      ...room.settings,
      ...settings
    };

    io.to(roomId).emit(
      "room-settings",
      room.settings
    );
  });

  /* =========================
     WEBRTC SIGNAL
  ========================= */

  socket.on("signal", ({ target, signal }) => {

    if (!target || !signal) return;

    io.to(target).emit("signal", {
      from: socket.id,
      signal
    });
  });

  /* =========================
     REMOVE USER
  ========================= */

  socket.on("remove-user", ({ roomId, userId }) => {

    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostId !== socket.id) return;

    const target = io.sockets.sockets.get(userId);

    if (!target) return;

    target.emit("removed-from-room");

    target.disconnect(true);
  });

  /* =========================
     LEAVE ROOM
  ========================= */

  socket.on("leave-room", () => {

    leaveRoom(socket);
  });

  /* =========================
     DISCONNECT
  ========================= */

  socket.on("disconnect", () => {

    leaveRoom(socket);

    console.log(
      "Disconnected:",
      socket.id
    );
  });

  /* =========================
     LEAVE FUNCTION
  ========================= */

  function leaveRoom(socket) {

    const roomId = socket.roomId;

    if (!roomId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    /* Remove user */

    room.users.delete(socket.id);

    /* Remove seat */

    for (const [seatId, userId] of room.seats) {

      if (userId === socket.id) {

        room.seats.delete(seatId);
      }
    }

    socket.to(roomId).emit(
      "user-left",
      {
        id: socket.id,
        name: user ? user.name : "Unknown"
      }
    );

    io.to(roomId).emit(
      "room-users",
      getUsers(room)
    );

    io.to(roomId).emit(
      "seats-updated",
      getSeats(room)
    );

    /*
      Room hin haqabamu.
      Namni hundi yoo bahe qofa
      room haqama.
    */

    if (room.users.size === 0) {

      rooms.delete(roomId);

      console.log(
        "Room deleted:",
        roomId
      );
    }

    socket.roomId = null;
  }
});

/* =========================
   SERVER
========================= */

const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    `Waliin Live server running on port ${PORT}`
  );
});
