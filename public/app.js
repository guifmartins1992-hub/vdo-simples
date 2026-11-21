const socket = io();
const $ = id => document.getElementById(id);
const state = {
  cameraZoom:1,cameraTiles:new Map(),roomCode:null,selfId:null,isHost:false,members:new Map(),pcs:new Map(),
  localCamera:null,outgoingCamera:null,localScreen:null,screenOwner:null,remoteScreens:new Map(),
  remoteCameras:new Map(),cameraEnabled:false,screenTransceivers:new Map(),cameraTransceivers:new Map(),pendingCandidates:new Map(),
  activeTab:"screenPanel",cameraMode:null,avatarImage:null,backgroundImage:null,
  filterMode:"none",filterActive:false,segmenter:null,segmenterLoading:null,
  processedCanvas:null,processedStream:null,avatarCanvas:null,avatarStream:null
};
const rtcConfig = {iceServers:[{urls:"stun:stun.l.google.com:19302"}]};

function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2800)}
function showHomeError(message=""){$("homeError").textContent=message}
function setConnection(message){$("connectionState").textContent=message}
function updateMembers(members){
  state.members=new Map(members.map(m=>[m.id,m]));$("memberCount").textContent=String(members.length);
  $("hostLabel").textContent=state.isHost?"Você é o anfitrião":"Sala hospedada por "+(members.find(m=>m.isHost)?.name||"Anfitrião");renderCameras();
}
function renderCameras(){
  const grid=$("videoGrid");
  const activeIds=new Set(state.members.keys());
  for(const [id,tileData] of state.cameraTiles){
    if(!activeIds.has(id)){tileData.tile.remove();state.cameraTiles.delete(id);}
  }
  for(const member of state.members.values()){
    let data=state.cameraTiles.get(member.id);
    if(!data){
      const tile=document.createElement("div");tile.className="video-tile";
      const video=document.createElement("video");video.autoplay=true;video.playsInline=true;video.muted=member.id===state.selfId;
      const empty=document.createElement("div");empty.className="no-camera";empty.textContent="Vídeo desligado";
      const name=document.createElement("div");name.className="name";
      tile.append(video,empty,name);grid.appendChild(tile);data={tile,video,empty,name,stream:null};state.cameraTiles.set(member.id,data);
    }
    data.name.textContent=(member.name||"Participante")+(member.id===state.selfId?" (você)":"");
    const stream=member.id===state.selfId?state.outgoingCamera:state.remoteCameras.get(member.id);
    if(stream&&data.video.srcObject!==stream){data.video.srcObject=stream;data.video.play().catch(()=>{});}
    if(!stream&&data.video.srcObject){data.video.srcObject=null;}
    data.empty.classList.toggle("hidden",!!stream);data.video.classList.toggle("hidden",!stream);
    data.video.style.transform=(member.id===state.selfId?"scaleX(-1) ":"")+"scale("+state.cameraZoom+")";
  }
  $("cameraStatus").textContent=state.cameraMode==="avatar"?"Avatar ativo":state.cameraEnabled?"Sua câmera está ligada":"Vídeo desligado";
}

