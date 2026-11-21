const socket = io();
const $ = id => document.getElementById(id);
const state = {
  roomCode: null, selfId: null, isHost: false, members: new Map(), pcs: new Map(),
  localCamera: null, localScreen: null, screenOwner: null, remoteScreens: new Map(),
  remoteCameras: new Map(), cameraEnabled: false, screenTransceivers: new Map(),
  cameraTransceivers: new Map(), activeTab: "screenPanel"
};
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
function showHomeError(message = "") { $("homeError").textContent = message; }
function setConnection(message) { $("connectionState").textContent = message; }
function switchTab(panelId) {
  state.activeTab = panelId;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === panelId));
  $("screenPanel").classList.toggle("hidden", panelId !== "screenPanel");
  $("cameraPanel").classList.toggle("hidden", panelId !== "cameraPanel");
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

function updateMembers(members) {
  state.members = new Map(members.map(m => [m.id, m]));
  $("memberCount").textContent = String(members.length);
  $("hostLabel").textContent = state.isHost ? "Você é o anfitrião" : "Sala hospedada por " + (members.find(m => m.isHost)?.name || "Anfitrião");
  renderCameras();
}
function renderCameras() {
  const grid = $("videoGrid"); grid.innerHTML = "";
  for (const member of state.members.values()) {
    const tile = document.createElement("div"); tile.className = "video-tile";
    const video = document.createElement("video"); video.autoplay = true; video.playsInline = true;
    video.muted = member.id === state.selfId;
    const stream = member.id === state.selfId ? state.localCamera : state.remoteCameras.get(member.id);
    if (stream) video.srcObject = stream;
    else {
      const empty = document.createElement("div"); empty.className = "no-camera"; empty.textContent = "Câmera desligada";
      tile.appendChild(empty);
    }
    tile.appendChild(video);
    const name = document.createElement("div"); name.className = "name";
    name.textContent = (member.name || "Participante") + (member.id === state.selfId ? " (você)" : "");
    tile.appendChild(name); grid.appendChild(tile);
  }
  $("cameraStatus").textContent = state.cameraEnabled ? "Sua câmera está ligada" : "Câmera desligada";
}
function makePeer(peerId) {
  if (state.pcs.has(peerId)) return state.pcs.get(peerId);
  const pc = new RTCPeerConnection(rtcConfig);
  const screenTx = pc.addTransceiver("video", { direction: "sendrecv" });
  const cameraTx = pc.addTransceiver("video", { direction: "sendrecv" });
  state.screenTransceivers.set(peerId, screenTx);
  state.cameraTransceivers.set(peerId, cameraTx);
  if (state.localScreen?.getVideoTracks()[0]) screenTx.sender.replaceTrack(state.localScreen.getVideoTracks()[0]).catch(()=>{});
  if (state.localCamera?.getVideoTracks()[0]) cameraTx.sender.replaceTrack(state.localCamera.getVideoTracks()[0]).catch(()=>{});

  pc.onicecandidate = e => { if (e.candidate) socket.emit("signal", { to: peerId, candidate: e.candidate }); };
  pc.ontrack = e => {
    const stream = e.streams[0] || new MediaStream([e.track]);
    if (e.transceiver === screenTx || e.transceiver.mid === "0") {
      state.remoteScreens.set(peerId, stream);
      if (state.screenOwner === peerId) showRemoteScreen(peerId);
    } else {
      state.remoteCameras.set(peerId, stream);
      renderCameras();
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
  };
  state.pcs.set(peerId, pc);
  return pc;
}
async function initiatePeer(peerId) {
  const pc = makePeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: peerId, description: pc.localDescription });
}
socket.on("signal", async ({ from, description, candidate }) => {
  try {
    const pc = makePeer(from);
    if (description) {
      await pc.setRemoteDescription(description);
      if (description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, description: pc.localDescription });
      }
    } else if (candidate) await pc.addIceCandidate(candidate);
  } catch (err) { console.error("Falha na negociação WebRTC", err); }
});
socket.on("peer:left", ({ peerId }) => {
  state.pcs.get(peerId)?.close(); state.pcs.delete(peerId);
  state.screenTransceivers.delete(peerId); state.cameraTransceivers.delete(peerId);
  state.remoteCameras.delete(peerId); state.remoteScreens.delete(peerId);
  if (state.screenOwner === peerId) resetScreenDisplay();
  renderCameras();
});
socket.on("room:members", ({ members }) => updateMembers(members));
socket.on("screen:started", ({ peerId }) => {
  state.screenOwner = peerId;
  const name = state.members.get(peerId)?.name || "Participante";
  $("screenStatus").textContent = peerId === state.selfId ? "Você está transmitindo" : `${name} está transmitindo`;
  $("screenStatus").classList.add("live");
  $("screenOwner").textContent = `Transmitindo: ${name}`;
  $("screenOwner").classList.remove("hidden");
  if (peerId !== state.selfId) showRemoteScreen(peerId);
});
socket.on("screen:stopped", ({ peerId }) => {
  if (state.screenOwner === peerId) resetScreenDisplay();
});
socket.on("room:closed", () => {
  cleanupLocal();
  alert("O anfitrião encerrou a sala.");
  location.reload();
});

function showRemoteScreen(peerId) {
  const stream = state.remoteScreens.get(peerId);
  if (!stream) return;
  $("remoteScreen").srcObject = stream;
  $("remoteScreen").classList.remove("hidden");
  $("screenPlaceholder").classList.add("hidden");
  $("localScreenPreview").classList.add("hidden");
}
function resetScreenDisplay() {
  state.screenOwner = null;
  $("remoteScreen").srcObject = null; $("remoteScreen").classList.add("hidden");
  $("localScreenPreview").srcObject = null; $("localScreenPreview").classList.add("hidden");
  $("screenPlaceholder").classList.remove("hidden");
  $("screenOwner").classList.add("hidden");
  $("screenStatus").textContent = "Ninguém transmitindo"; $("screenStatus").classList.remove("live");
  $("stopShareBtn").classList.add("hidden"); $("shareBtn").classList.remove("hidden");
}
async function startCamera() {
  try {
    state.localCamera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    state.cameraEnabled = true;
    const track = state.localCamera.getVideoTracks()[0];
    for (const [id, tx] of state.cameraTransceivers) await tx.sender.replaceTrack(track);
    $("cameraBtn").classList.add("hidden"); $("cameraOffBtn").classList.remove("hidden");
    renderCameras(); toast("Câmera ligada.");
  } catch (e) { toast("Não foi possível acessar a câmera. Verifique a permissão do navegador."); }
}
async function stopCamera() {
  state.localCamera?.getTracks().forEach(t => t.stop()); state.localCamera = null; state.cameraEnabled = false;
  for (const tx of state.cameraTransceivers.values()) await tx.sender.replaceTrack(null).catch(()=>{});
  $("cameraBtn").classList.remove("hidden"); $("cameraOffBtn").classList.add("hidden");
  renderCameras();
}
async function startScreen() {
  socket.emit("screen:request", {}, async result => {
    if (!result?.ok) return toast(result?.error || "Não foi possível iniciar a transmissão.");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: false });
      state.localScreen = stream;
      const track = stream.getVideoTracks()[0];
      for (const tx of state.screenTransceivers.values()) await tx.sender.replaceTrack(track);
      $("localScreenPreview").srcObject = stream;
      $("localScreenPreview").classList.remove("hidden");
      $("screenPlaceholder").classList.add("hidden");
      $("shareBtn").classList.add("hidden"); $("stopShareBtn").classList.remove("hidden");
      track.onended = stopScreen;
      toast("Você está compartilhando sua tela.");
    } catch (e) {
      socket.emit("screen:stop");
      if (e.name !== "NotAllowedError") toast("Não foi possível iniciar a captura de tela.");
    }
  });
}
async function stopScreen() {
  if (!state.localScreen) return;
  state.localScreen.getTracks().forEach(t => t.stop());
  state.localScreen = null;
  for (const tx of state.screenTransceivers.values()) await tx.sender.replaceTrack(null).catch(()=>{});
  socket.emit("screen:stop");
  resetScreenDisplay();
}
function cleanupLocal() {
  stopCamera().catch(()=>{});
  if (state.localScreen) state.localScreen.getTracks().forEach(t => t.stop());
  for (const pc of state.pcs.values()) pc.close();
  state.pcs.clear();
}
function enterRoom(data) {
  state.roomCode = data.code; state.selfId = data.selfId; state.isHost = data.isHost;
  $("home").classList.add("hidden"); $("room").classList.remove("hidden");
  $("roomCodeLabel").textContent = "SALA " + data.code;
  $("endRoomBtn").classList.toggle("hidden", !state.isHost);
  $("hostLabel").textContent = state.isHost ? "Você é o anfitrião" : "";
  updateMembers(data.members);
  setConnection("Conectado à sala");
  if (data.activeScreen) {
    state.screenOwner = data.activeScreen;
    $("screenStatus").textContent = "Transmissão em andamento";
    $("screenStatus").classList.add("live");
  }
  Promise.all((data.existing || []).map(m => initiatePeer(m.id))).catch(console.error);
}
$("createBtn").addEventListener("click", () => {
  showHomeError("");
  socket.emit("room:create", { name: "Anfitrião" }, result => {
    if (!result?.ok) return showHomeError("Não foi possível criar a sala.");
    enterRoom(result);
  });
});
$("joinBtn").addEventListener("click", () => {
  showHomeError("");
  const code = $("roomCode").value.trim().toUpperCase();
  if (!code) return showHomeError("Digite o código da sala.");
  socket.emit("room:join", { code, name: "Participante" }, result => {
    if (!result?.ok) return showHomeError(result?.error || "Não foi possível entrar.");
    enterRoom(result);
  });
});
$("roomCode").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
$("shareBtn").addEventListener("click", startScreen);
$("stopShareBtn").addEventListener("click", stopScreen);
$("cameraBtn").addEventListener("click", startCamera);
$("cameraOffBtn").addEventListener("click", stopCamera);
$("copyCodeBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.roomCode); toast("Código copiado."); }
  catch { toast("Código da sala: " + state.roomCode); }
});
$("leaveBtn").addEventListener("click", () => {
  if (state.isHost && !confirm("Sair encerrará a sala para todos. Continuar?")) return;
  socket.emit("room:leave"); cleanupLocal(); location.reload();
});
$("endRoomBtn").addEventListener("click", () => {
  if (confirm("Encerrar a sala para todos os participantes?")) { socket.emit("room:leave"); cleanupLocal(); location.reload(); }
});
socket.on("connect", () => setConnection("Conectado ao servidor"));
socket.on("disconnect", () => setConnection("Reconectando…"));
window.addEventListener("beforeunload", () => { if (state.roomCode) socket.emit("room:leave"); });