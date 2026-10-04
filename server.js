const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "messages.json");

fs.mkdirSync(dataDir, { recursive: true });

function loadMessages() {
  try {
    if (!fs.existsSync(dataFile)) return [];
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return Array.isArray(data) ? data.slice(-500) : [];
  } catch {
    return [];
  }
}

let messages = loadMessages();

function saveMessages() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(messages.slice(-500), null, 2), "utf8");
  } catch (err) {
    console.error("Could not save messages:", err.message);
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "realtime-chat-app" });
});

io.on("connection", (socket) => {
  socket.emit("history", messages);

  socket.on("join", (name) => {
    const cleanName = String(name || "ゲスト").trim().slice(0, 30) || "ゲスト";
    socket.data.name = cleanName;
    socket.broadcast.emit("system", `${cleanName} が参加しました`);
    io.emit("onlineCount", io.engine.clientsCount);
  });

  socket.on("chatMessage", (text) => {
    const cleanText = String(text || "").trim().slice(0, 1000);
    if (!cleanText) return;

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: socket.data.name || "ゲスト",
      text: cleanText,
      time: new Date().toISOString()
    };

    messages.push(message);
    messages = messages.slice(-500);
    saveMessages();
    io.emit("chatMessage", message);
  });

  socket.on("typing", (isTyping) => {
    socket.broadcast.emit("typing", {
      name: socket.data.name || "ゲスト",
      isTyping: Boolean(isTyping)
    });
  });

  socket.on("disconnect", () => {
    if (socket.data.name) {
      socket.broadcast.emit("system", `${socket.data.name} が退出しました`);
    }
    io.emit("onlineCount", io.engine.clientsCount);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Chat server listening on http://${HOST}:${PORT}`);
});
