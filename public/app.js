const socket = io();
const login = document.getElementById("login");
const chat = document.getElementById("chat");
const nameInput = document.getElementById("name");
const joinButton = document.getElementById("join");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const online = document.getElementById("online");
const status = document.getElementById("status");
const typingEl = document.getElementById("typing");

let joined = false;
let typingTimer;

function addMessage(m) {
  const el = document.createElement("div");
  el.className = "msg";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${m.name} · ${new Date(m.time).toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"})}`;
  const body = document.createElement("div");
  body.textContent = m.text;
  el.append(meta, body);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const el = document.createElement("div");
  el.className = "system";
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

joinButton.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  joined = true;
  login.classList.add("hidden");
  chat.classList.remove("hidden");
  socket.emit("join", name);
  input.focus();
});

nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") joinButton.click();
});

form.addEventListener("submit", e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !joined) return;
  socket.emit("chatMessage", text);
  input.value = "";
  socket.emit("typing", false);
});

input.addEventListener("input", () => {
  socket.emit("typing", input.value.length > 0);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("typing", false), 900);
});

socket.on("connect", () => status.textContent = "接続済み");
socket.on("disconnect", () => status.textContent = "切断されました");
socket.on("onlineCount", n => online.textContent = `オンライン: ${n}`);
socket.on("history", history => {
  messagesEl.innerHTML = "";
  history.forEach(addMessage);
});
socket.on("chatMessage", addMessage);
socket.on("system", addSystem);
socket.on("typing", data => {
  typingEl.textContent = data.isTyping ? `${data.name} が入力中...` : "";
});
