const socket = io();
const $ = id => document.getElementById(id);
const state = {
  cameraZoom:1,cameraMirrored:true,cameraTiles:new Map(),roomCode:null,selfId:null,isHost:false,members:new Map(),pcs:new Map(),
  localCamera:null,outgoingCamera:null,localScreen:null,screenOwner:null,remoteScreens:new Map(),remoteScreenAudio:null,
  remoteCameras:new Map(),cameraEnabled:false,screenTransceivers:new Map(),cameraTransceivers:new Map(),screenAudioTransceivers:new Map(),pendingCandidates:new Map(),
  activeTab:"screenPanel",cameraMode:null,avatarImage:null,backgroundImage:null,
  filterMode:"none",filterActive:false,segmenter:null,segmenterLoading:null,
  processedCanvas:null,processedStream:null,avatarCanvas:null,avatarStream:null,cameraOffCanvas:null,cameraOffStream:null
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
  const cameraPanel=$("cameraPanel");
  const memberTotal=Math.max(1,state.members.size);
  cameraPanel.dataset.participants=String(memberTotal);
  grid.dataset.participants=String(memberTotal);
  const activeIds=new Set(state.members.keys());
  for(const [id,data] of state.cameraTiles){if(!activeIds.has(id)){data.tile.remove();state.cameraTiles.delete(id);}}
  for(const member of state.members.values()){
    let data=state.cameraTiles.get(member.id);
    if(!data){
      const tile=document.createElement("div");tile.className="video-tile";
      const video=document.createElement("video");video.autoplay=true;video.playsInline=true;video.muted=member.id===state.selfId;
      const empty=document.createElement("div");empty.className="no-camera";empty.textContent="Vídeo desligado";
      const name=document.createElement("div");name.className="name";
      tile.append(video,empty,name);grid.appendChild(tile);data={tile,video,empty,name};state.cameraTiles.set(member.id,data);
    }
    data.name.textContent=(member.name||"Participante")+(member.id===state.selfId?" (você)":"");
    const stream=member.id===state.selfId?state.outgoingCamera:state.remoteCameras.get(member.id);
    if(stream&&data.video.srcObject!==stream){data.video.srcObject=stream;data.video.play().catch(()=>{});}
    if(!stream&&data.video.srcObject)data.video.srcObject=null;
    data.empty.classList.toggle("hidden",!!stream);data.video.classList.toggle("hidden",!stream);
    data.video.style.transform="";
  }
  $("cameraStatus").textContent=state.cameraMode==="avatar"?"Avatar ativo":state.cameraEnabled?"Sua câmera está ligada":"Vídeo desligado";
}

function mapPeerTransceivers(peerId,pc){
  // O SDP mantém a ordem das faixas: m-line 0 = tela; m-line 1 = câmera.
  const transceivers=pc.getTransceivers().slice().sort((a,b)=>{
    const am=a.mid===null?999:Number(a.mid),bm=b.mid===null?999:Number(b.mid);
    return am-bm;
  });
  const screenTx=transceivers.find(tx=>tx.mid==="0")||transceivers[0];
  const cameraTx=transceivers.find(tx=>tx.mid==="1")||transceivers[1];
  if(screenTx){screenTx.direction="sendrecv";state.screenTransceivers.set(peerId,screenTx);}
  const audioTx=transceivers.find(tx=>tx.receiver.track.kind==="audio");
  if(cameraTx){cameraTx.direction="sendrecv";state.cameraTransceivers.set(peerId,cameraTx);}
  if(audioTx){audioTx.direction="sendrecv";state.screenAudioTransceivers.set(peerId,audioTx);}
  console.info("Faixas WebRTC mapeadas",peerId,{screen:screenTx?.mid,camera:cameraTx?.mid,audio:audioTx?.mid});
}
async function syncLocalTracks(peerId){
  const screenTx=state.screenTransceivers.get(peerId),cameraTx=state.cameraTransceivers.get(peerId),audioTx=state.screenAudioTransceivers.get(peerId);
  if(screenTx)await screenTx.sender.replaceTrack(state.localScreen?.getVideoTracks()[0]||null);
  if(cameraTx)await cameraTx.sender.replaceTrack(state.outgoingCamera?.getVideoTracks()[0]||null);
  if(audioTx)await audioTx.sender.replaceTrack(state.localScreen?.getAudioTracks()[0]||null);
}
async function flushIceCandidates(peerId,pc){
  const queued=state.pendingCandidates.get(peerId)||[];
  state.pendingCandidates.set(peerId,[]);
  for(const candidate of queued){try{await pc.addIceCandidate(candidate)}catch(err){console.warn("Candidato ICE não aplicado",err)}}
}
function makePeer(peerId,offerer=false){
  if(state.pcs.has(peerId))return state.pcs.get(peerId);
  const pc=new RTCPeerConnection(rtcConfig);
  if(offerer){pc.addTransceiver("video",{direction:"sendrecv"});pc.addTransceiver("video",{direction:"sendrecv"});pc.addTransceiver("audio",{direction:"sendrecv"});}
  pc.onicecandidate=e=>{if(e.candidate)socket.emit("signal",{to:peerId,candidate:e.candidate})};
  pc.ontrack=e=>{
    if(e.track.kind==="audio"){
      const audio=$("remoteScreenAudio");audio.srcObject=e.streams?.[0]||new MediaStream([e.track]);
      audio.volume=Number($("screenAudioVolume").value)/100;audio.muted=$("screenAudioMute").dataset.muted==="true";
      audio.play().catch(()=>{audio.muted=true;$("screenAudioMute").dataset.muted="true";$("screenAudioMute").textContent="♪";$("screenAudioMute").title="Ativar áudio";toast("Clique no controle de áudio para liberar o som.");});
      $("screenAudioPanel").classList.toggle("hidden",!state.screenOwner);
      e.track.onended=()=>{audio.srcObject=null;};return;
    }
    // Usa o MediaStream fornecido pelo WebRTC, preservando a associação original da faixa.
    const stream=e.streams?.[0]||new MediaStream([e.track]);
    const isScreen=e.transceiver.mid==="0";
    const collection=isScreen?state.remoteScreens:state.remoteCameras;
    const update=()=>{
      if(isScreen){
        if(e.track.muted){collection.delete(peerId);}
        else{collection.set(peerId,stream);}
        if(state.screenOwner===peerId){
          if(collection.has(peerId))showRemoteScreen(peerId);
          else{$("remoteScreen").srcObject=null;$("remoteScreen").classList.add("hidden");}
        }
      }else{
        if(e.track.muted)collection.delete(peerId);
        else collection.set(peerId,stream);
        renderCameras();
      }
    };
    e.track.onmute=update;
    e.track.onunmute=update;
    e.track.onended=()=>{
      collection.delete(peerId);
      if(isScreen){
        if(state.screenOwner===peerId){$("remoteScreen").srcObject=null;$("remoteScreen").classList.add("hidden");}
      }else renderCameras();
    };
    update();
  };
  pc.oniceconnectionstatechange=()=>{console.info("WebRTC ICE",peerId,pc.iceConnectionState);if(pc.iceConnectionState==="failed")pc.restartIce();};
  pc.onconnectionstatechange=()=>console.info("WebRTC conexão",peerId,pc.connectionState);
  state.pcs.set(peerId,pc);if(offerer)mapPeerTransceivers(peerId,pc);return pc;
}
async function initiatePeer(peerId){
  const pc=makePeer(peerId,true);await syncLocalTracks(peerId);
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  socket.emit("signal",{to:peerId,description:pc.localDescription});
}
socket.on("signal",async({from,description,candidate})=>{
  try{
    const pc=makePeer(from,false);
    if(description){
      await pc.setRemoteDescription(description);
      if(description.type==="offer"){
        mapPeerTransceivers(from,pc);
        await syncLocalTracks(from);
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.info("Resposta SDP enviada",from,pc.localDescription.sdp.split("\\r\\n").filter(line=>line.startsWith("a=send")||line.startsWith("a=recv")||line.startsWith("m=video")));
        socket.emit("signal",{to:from,description:pc.localDescription});
      }
      await flushIceCandidates(from,pc);
    }else if(candidate){
      if(pc.remoteDescription?.type)await pc.addIceCandidate(candidate);
      else{const queue=state.pendingCandidates.get(from)||[];queue.push(candidate);state.pendingCandidates.set(from,queue);}
    }
  }catch(err){console.error("Falha na negociação WebRTC",err);}
});
function discardPeer(peerId){
  const pc=state.pcs.get(peerId);
  if(pc){pc.ontrack=null;pc.onicecandidate=null;pc.close();}
  state.pcs.delete(peerId);state.screenTransceivers.delete(peerId);state.cameraTransceivers.delete(peerId);state.screenAudioTransceivers.delete(peerId);
  state.pendingCandidates.delete(peerId);state.remoteScreens.delete(peerId);state.remoteCameras.delete(peerId);
  const tile=state.cameraTiles.get(peerId);
  if(tile){tile.video.srcObject=null;tile.video.classList.add("hidden");tile.empty.classList.remove("hidden");}
  if(state.screenOwner===peerId){$("remoteScreen").srcObject=null;$("remoteScreen").classList.add("hidden");}
}
async function refreshCameraToPeer(peerId){
  const tx=state.cameraTransceivers.get(peerId);
  const track=state.outgoingCamera?.getVideoTracks()[0]||null;
  if(!tx||!track||track.readyState!=="live")return;
  try{
    // Reanexa somente a faixa de câmera. Não fecha nem renegocia a conexão
    // e não toca na transceiver dedicada à transmissão de tela.
    await tx.sender.replaceTrack(track);
  }catch(err){console.warn("Falha ao reativar envio da câmera",peerId,err);}
}
async function reloadReceivedMedia(){
  if(!state.roomCode)return;
  const peers=[...state.members.keys()].filter(id=>id!==state.selfId);
  if(!peers.length){toast("Não há outros participantes para recuperar.");return;}
  setConnection("Solicitando atualização das câmeras…");
  socket.emit("camera:refresh");
  await Promise.all(peers.map(refreshCameraToPeer));
  setConnection("Solicitação de câmeras enviada");
  toast("Solicitei aos participantes que reenviem suas câmeras.");
}
async function refreshScreenToPeer(peerId){
  const tx=state.screenTransceivers.get(peerId);
  const track=state.localScreen?.getVideoTracks()[0]||null;
  if(!tx||!track||track.readyState!=="live")return;
  try{await tx.sender.replaceTrack(track);const audioTx=state.screenAudioTransceivers.get(peerId);if(audioTx)await audioTx.sender.replaceTrack(state.localScreen?.getAudioTracks()[0]||null);}
  catch(err){console.warn("Falha ao reativar envio da tela/áudio",peerId,err);}
}
async function reloadReceivedScreen(){
  if(!state.roomCode)return;
  const peers=[...state.members.keys()].filter(id=>id!==state.selfId);
  if(!peers.length){toast("Não há outros participantes para recuperar.");return;}
  setConnection("Solicitando atualização da transmissão…");
  socket.emit("screen:refresh");
  await Promise.all(peers.map(refreshScreenToPeer));
  setConnection("Solicitação de transmissão enviada");
  toast("Solicitei ao transmissor que reenvie a tela, sem reiniciar a sala.");
}

async function reloadMyScreen(){
  if(!state.localScreen){toast("Apenas quem está transmitindo pode recarregar a própria transmissão.");return;}
  try{
    const fresh=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60,max:60}},audio:true,windowAudio:"window",systemAudio:"exclude"});
    const track=fresh.getVideoTracks()[0];
    if(!track){stopStream(fresh);toast("Não foi possível obter a nova captura.");return;}
    const previous=state.localScreen;
    for(const tx of state.screenTransceivers.values())await tx.sender.replaceTrack(track);
    const isolated=getIsolatedShareAudio(fresh);
    for(const tx of state.screenAudioTransceivers.values())await tx.sender.replaceTrack(isolated.track);
    state.localScreen=fresh;
    $("localScreenPreview").srcObject=fresh;
    track.onended=stopScreen;
    stopStream(previous);
    toast("Transmissão recarregada.");
  }catch(err){
    if(err.name!=="NotAllowedError")toast("Não foi possível recarregar a transmissão.");
  }
}
async function reloadMyCameras(){
  if(state.cameraMode==="camera"&&state.localCamera){
    try{
      const fresh=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640,max:1280},height:{ideal:360,max:720},frameRate:{ideal:24,max:30}},audio:false});
      const previous=state.localCamera;
      state.localCamera=fresh;
      if(state.filterActive)await applyCameraFilter();
      else await replaceOutgoingCamera(fresh);
      stopStream(previous);
      toast("Câmera recarregada.");
    }catch(err){console.error(err);toast("Não foi possível recarregar sua câmera.");}
    return;
  }
  if(state.cameraMode==="avatar"&&state.avatarImage){
    const canvas=state.avatarCanvas;
    if(canvas){
      const ctx=canvas.getContext("2d"),img=state.avatarImage;
      ctx.fillStyle="#101a13";ctx.fillRect(0,0,640,360);
      const scale=Math.min(560/img.width,300/img.height),w=img.width*scale,h=img.height*scale;
      ctx.drawImage(img,(640-w)/2,(360-h)/2,w,h);
      toast("Avatar atualizado.");
    }
    return;
  }
  toast("Ligue sua câmera ou selecione um avatar para recarregar.");
}
socket.on("peer:left",({peerId})=>{discardPeer(peerId);if(state.screenOwner===peerId)resetScreenDisplay();renderCameras();});
socket.on("camera:refresh",async({from})=>{
  await refreshCameraToPeer(from);
});
socket.on("screen:refresh",async({from})=>{
  await refreshScreenToPeer(from);
});
socket.on("room:members",({members})=>updateMembers(members));
socket.on("screen:started",({peerId})=>{
  state.screenOwner=peerId;$("screenAudioPanel").classList.remove("hidden");const name=state.members.get(peerId)?.name||"Participante";
  $("screenStatus").textContent=peerId===state.selfId?"Você está transmitindo":name+" está transmitindo";$("screenStatus").classList.add("live");
  $("screenOwner").textContent="Transmitindo: "+name;$("screenOwner").classList.remove("hidden");if(peerId!==state.selfId)showRemoteScreen(peerId);
});
socket.on("screen:stopped",({peerId})=>{if(state.screenOwner===peerId)resetScreenDisplay()});
socket.on("room:closed",()=>{cleanupLocal();alert("O anfitrião encerrou a sala.");location.reload()});

function showRemoteScreen(peerId){
  const stream=state.remoteScreens.get(peerId);if(!stream)return;
  $("remoteScreen").srcObject=stream;$("remoteScreen").play().catch(()=>{});$("remoteScreen").classList.remove("hidden");$("screenPlaceholder").classList.add("hidden");$("localScreenPreview").classList.add("hidden");
}
function resetScreenDisplay(){
  state.screenOwner=null;$("screenAudioPanel").classList.add("hidden");$("remoteScreen").srcObject=null;$("remoteScreen").classList.add("hidden");
  $("localScreenPreview").srcObject=null;$("localScreenPreview").classList.add("hidden");$("screenPlaceholder").classList.remove("hidden");
  $("screenOwner").classList.add("hidden");$("screenStatus").textContent="Ninguém transmitindo";$("screenStatus").classList.remove("live");
  $("stopShareBtn").classList.add("hidden");$("shareBtn").classList.remove("hidden");
}
async function replaceOutgoingCamera(stream){
  state.outgoingCamera=stream;const track=stream?.getVideoTracks()[0]||null;
  if(track)track.contentHint="motion";
  for(const tx of state.cameraTransceivers.values()){
    try{
      await tx.sender.replaceTrack(track);
      const params=tx.sender.getParameters();
      if(params.encodings?.length){
        params.encodings[0].maxBitrate=650000;
        params.encodings[0].maxFramerate=24;
        await tx.sender.setParameters(params);
      }
    }catch(err){console.warn("Não foi possível ajustar envio da câmera",err);}
  }
  renderCameras();
}
function stopStream(stream){stream?.getTracks().forEach(t=>t.stop())}
function clearProcessed(){
  stopStream(state.processedStream);state.processedStream=null;state.processedCanvas=null;
  stopStream(state.avatarStream);state.avatarStream=null;state.avatarCanvas=null;
}
async function loadSegmenter(){
  if(state.segmenter)return state.segmenter;if(state.segmenterLoading)return state.segmenterLoading;
  state.segmenterLoading=new Promise((resolve,reject)=>{
    const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
    script.onload=()=>{
      try{
        const seg=new SelfieSegmentation({locateFile:file=>"https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/"+file});
        seg.setOptions({modelSelection:1});
        state.segmenter=seg;resolve(seg);
      }catch(e){reject(e)}
    };
    script.onerror=()=>reject(new Error("Não foi possível carregar o filtro de câmera."));document.head.appendChild(script);
  }).catch(err=>{state.segmenterLoading=null;throw err});
  return state.segmenterLoading;
}
function drawCameraSource(ctx,source,w,h){
  if(source.readyState<2)return;
  const sw=source.videoWidth||w,sh=source.videoHeight||h,scale=Math.max(w/sw,h/sh)*state.cameraZoom,dw=sw*scale,dh=sh*scale;
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(state.cameraMirrored?-1:1,1);ctx.drawImage(source,-dw/2,-dh/2,dw,dh);ctx.restore();
}
async function applyCameraFilter(){
  if(!state.localCamera)return;
  try{
    state.stopFilterLoop?.();state.stopFilterLoop=null;
    const useSegmentation=state.filterActive&&state.filterMode!=="none";
    if(useSegmentation&&state.filterMode==="image"&&!state.backgroundImage){toast("Escolha uma imagem de fundo primeiro.");return}
    const seg=useSegmentation?await loadSegmenter():null;clearProcessed();
    const source=document.createElement("video");source.srcObject=state.localCamera;source.muted=true;source.playsInline=true;await source.play();
    const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext("2d"),stream=canvas.captureStream(24);state.processedCanvas=canvas;state.processedStream=stream;
    const foreground=document.createElement("canvas");foreground.width=640;foreground.height=360;const fg=foreground.getContext("2d");
    const mask=document.createElement("canvas");mask.width=640;mask.height=360;const mctx=mask.getContext("2d");
    const blurred=document.createElement("canvas");blurred.width=640;blurred.height=360;const bg=blurred.getContext("2d");
    const background=()=>{
      ctx.clearRect(0,0,640,360);
      if(useSegmentation&&state.filterMode==="blur"){bg.clearRect(0,0,640,360);bg.save();bg.filter="blur(18px)";drawCameraSource(bg,source,640,360);bg.restore();ctx.drawImage(blurred,0,0)}
      else if(useSegmentation&&state.filterMode==="image"&&state.backgroundImage)ctx.drawImage(state.backgroundImage,0,0,640,360);
      else if(useSegmentation&&state.filterMode==="remove"){ctx.fillStyle="#080b09";ctx.fillRect(0,0,640,360)}
      else{ctx.fillStyle="#101a13";ctx.fillRect(0,0,640,360)}
    };
    const segmented=results=>{
      background();fg.clearRect(0,0,640,360);drawCameraSource(fg,source,640,360);
      const sw=source.videoWidth||640,sh=source.videoHeight||360,scale=Math.max(640/sw,360/sh)*state.cameraZoom,dw=sw*scale,dh=sh*scale;
      mctx.clearRect(0,0,640,360);mctx.save();mctx.translate(320,180);mctx.scale(state.cameraMirrored?-1:1,1);mctx.drawImage(results.segmentationMask,-dw/2,-dh/2,dw,dh);mctx.restore();
      fg.globalCompositeOperation="destination-in";fg.drawImage(mask,0,0);fg.globalCompositeOperation="source-over";ctx.drawImage(foreground,0,0);
    };
    if(seg)seg.onResults(segmented);
    await replaceOutgoingCamera(stream);
    let running=true;
    const process=async()=>{
      if(!running||!state.localCamera||!state.cameraEnabled||state.cameraMode!=="camera")return;
      if(source.readyState>=2){if(seg){try{await seg.send({image:source})}catch(e){console.warn(e)}}else{ctx.clearRect(0,0,640,360);drawCameraSource(ctx,source,640,360)}}
      requestAnimationFrame(process);
    };
    state.stopFilterLoop=()=>{running=false;source.pause();source.srcObject=null};requestAnimationFrame(process);
    toast(useSegmentation?"Efeitos de câmera atualizados.":"Zoom e espelhamento atualizados.");
  }catch(err){console.error(err);toast(err.message||"Falha ao aplicar efeitos de câmera.")}
}
async function startCamera(){
  try{
    state.localCamera=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640,max:1280},height:{ideal:360,max:720},frameRate:{ideal:24,max:30}},audio:false});
    state.cameraEnabled=true;state.cameraMode="camera";$("cameraBtn").classList.add("hidden");$("cameraOffBtn").classList.remove("hidden");
    await applyCameraFilter();renderCameras();toast("Câmera ligada.");
  }catch(e){toast("Não foi possível acessar a câmera ou iniciar o efeito. Verifique as permissões.")}
}
function createCameraOffStream(){
  if(state.cameraOffStream?.getVideoTracks()[0]?.readyState==="live")return state.cameraOffStream;
  const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#c0c0c0";ctx.fillRect(0,0,640,360);
  ctx.fillStyle="#555555";ctx.font="bold 26px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("Vídeo desligado",320,180);
  state.cameraOffCanvas=canvas;state.cameraOffStream=canvas.captureStream(10);
  return state.cameraOffStream;
}
async function stopCamera(){
  state.stopFilterLoop?.();state.stopFilterLoop=null;
  stopStream(state.localCamera);state.localCamera=null;
  state.cameraEnabled=false;state.cameraMode=null;clearProcessed();
  // Mantém a faixa WebRTC de câmera ativa e envia uma imagem prata no lugar
  // de remover a faixa. Assim os outros nunca ficam com o último quadro congelado.
  await replaceOutgoingCamera(createCameraOffStream());
  $("cameraBtn").classList.remove("hidden");$("cameraOffBtn").classList.add("hidden");$("avatarBtn").textContent="Usar avatar";renderCameras();
}
function drawAvatarOutput(){
  if(!state.avatarCanvas||!state.avatarImage)return;
  const ctx=state.avatarCanvas.getContext("2d"),img=state.avatarImage;ctx.fillStyle="#101a13";ctx.fillRect(0,0,640,360);
  const scale=Math.min(560/img.width,300/img.height)*state.cameraZoom,w=img.width*scale,h=img.height*scale;
  ctx.save();ctx.translate(320,180);ctx.scale(state.cameraMirrored?-1:1,1);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
}
async function startAvatar(file){
  if(!file)return;
  try{
    const url=URL.createObjectURL(file),img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
    await stopCamera();state.avatarImage=img;state.cameraMode="avatar";state.cameraEnabled=true;
    const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext("2d");
    state.avatarCanvas=canvas;state.avatarStream=canvas.captureStream(10);drawAvatarOutput();
    $("cameraBtn").classList.add("hidden");$("cameraOffBtn").classList.remove("hidden");$("avatarBtn").textContent="Avatar selecionado";
    await replaceOutgoingCamera(state.avatarStream);renderCameras();URL.revokeObjectURL(url);toast("Avatar ativado.");
  }catch(e){console.error(e);toast("Não foi possível carregar essa imagem.")}
}
function getIsolatedShareAudio(stream){
  const videoTrack=stream?.getVideoTracks()[0];
  const surface=videoTrack?.getSettings?.().displaySurface;
  const audioTrack=stream?.getAudioTracks()[0]||null;
  // browser = áudio da guia; window = áudio do aplicativo/janela selecionada.
  // monitor nunca deve enviar áudio, pois isso pode incluir a mixagem do sistema.
  if(surface!=="browser"&&surface!=="window"){
    if(audioTrack)audioTrack.stop();
    return {track:null,surface};
  }
  return {track:audioTrack,surface};
}
async function startScreen(){
  socket.emit("screen:request",{},async result=>{
    if(!result?.ok)return toast(result?.error||"Não foi possível iniciar a transmissão.");
    try{
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60,max:60}},audio:true,windowAudio:"window",systemAudio:"exclude"});
      state.localScreen=stream;const track=stream.getVideoTracks()[0];
      for(const tx of state.screenTransceivers.values())await tx.sender.replaceTrack(track);
      const isolated=getIsolatedShareAudio(stream),audioTrack=isolated.track;
      for(const tx of state.screenAudioTransceivers.values())await tx.sender.replaceTrack(audioTrack);
      $("screenAudioHint").textContent=isolated.surface==="browser"?(audioTrack?"Áudio isolado da guia será transmitido.":"A guia não forneceu áudio."):isolated.surface==="window"?(audioTrack?"Áudio isolado da janela selecionada será transmitido.":"A janela não forneceu áudio. Verifique se o navegador oferece captura de áudio por janela."):"Áudio não transmitido: a tela inteira pode incluir sons de outros aplicativos.";
      $("localScreenPreview").srcObject=stream;$("localScreenPreview").classList.remove("hidden");$("screenPlaceholder").classList.add("hidden");
      $("shareBtn").classList.add("hidden");$("stopShareBtn").classList.remove("hidden");track.onended=stopScreen;toast("Você está compartilhando sua tela.");
    }catch(e){socket.emit("screen:stop");if(e.name!=="NotAllowedError")toast("Não foi possível iniciar a captura de tela.")}
  });
}
async function stopScreen(){
  if(!state.localScreen)return;stopStream(state.localScreen);state.localScreen=null;
  for(const tx of state.screenTransceivers.values())await tx.sender.replaceTrack(null).catch(()=>{});
  for(const tx of state.screenAudioTransceivers.values())await tx.sender.replaceTrack(null).catch(()=>{});
  socket.emit("screen:stop");resetScreenDisplay();
}
function cleanupLocal(){
  stopCamera().catch(()=>{});stopStream(state.localScreen);
  const audio=$("remoteScreenAudio");if(audio)audio.srcObject=null;
  for(const pc of state.pcs.values())pc.close();state.pcs.clear();
}
function enterRoom(data){
  state.roomCode=data.code;state.selfId=data.selfId;state.isHost=data.isHost;
  $("home").classList.add("hidden");$("room").classList.remove("hidden");$("roomCodeLabel").textContent="SALA "+data.code;
  $("endRoomBtn").classList.toggle("hidden",!state.isHost);updateMembers(data.members);setConnection("Conectado à sala");
  if(data.activeScreen){state.screenOwner=data.activeScreen;$("screenStatus").textContent="Transmissão em andamento";$("screenStatus").classList.add("live")}
  Promise.all((data.existing||[]).map(m=>initiatePeer(m.id))).catch(console.error);
}
function joinRoomByCode(code){
  showHomeError("");const normalized=String(code||"").trim().toUpperCase();if(!normalized)return showHomeError("Digite o código da sala.");
  socket.emit("room:join",{code:normalized,name:"Participante"},result=>{if(!result?.ok)return showHomeError(result?.error||"Não foi possível entrar.");enterRoom(result)});
}
async function updateDesktopInvite(code){
  const panel=$("desktopInvitePanel");
  if(!panel||!window.veetDesktop?.isDesktop||!state.isHost)return;
  panel.classList.remove("hidden");
  $("desktopInviteLink").value="Preparando link público…";
  try{$("desktopInviteLink").value=await window.veetDesktop.getInviteLink(code);}
  catch(err){$("desktopInviteLink").value="Aguardando conexão pública…";console.error(err);}
}
$("createBtn").addEventListener("click",()=>{
  showHomeError("");socket.emit("room:create",{name:"Anfitrião"},result=>{if(!result?.ok)return showHomeError("Não foi possível criar a sala.");enterRoom(result);updateDesktopInvite(result.code)});
});
$("joinBtn").addEventListener("click",()=>joinRoomByCode($("roomCode").value));
const inviteFromUrl=new URLSearchParams(location.search).get("room");
if(inviteFromUrl){$("roomCode").value=inviteFromUrl.toUpperCase();socket.on("connect",()=>{if(inviteFromUrl&&!state.roomCode)joinRoomByCode(inviteFromUrl)});}
if(window.veetDesktop?.isDesktop){document.documentElement.classList.add("veet-desktop");window.veetDesktop.onTunnelReady(()=>{if(state.isHost&&state.roomCode)updateDesktopInvite(state.roomCode)});}
$("copyInviteBtn")?.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText($("desktopInviteLink").value);toast("Link da sala copiado!");}
  catch{const field=$("desktopInviteLink");field.select();document.execCommand("copy");toast("Link da sala copiado!");}
});
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("shareBtn").addEventListener("click",startScreen);$("stopShareBtn").addEventListener("click",stopScreen);
$("screenAudioVolume").addEventListener("input",e=>{$("remoteScreenAudio").volume=Number(e.target.value)/100;$("screenAudioVolumeValue").textContent=e.target.value+"%";});
$("screenAudioMute").addEventListener("click",()=>{const muted=$("screenAudioMute").dataset.muted!=="true";$("screenAudioMute").dataset.muted=String(muted);$("remoteScreenAudio").muted=muted;$("screenAudioMute").textContent="♪";$("screenAudioMute").title=muted?"Ativar áudio":"Silenciar";$("screenAudioMute").setAttribute("aria-label",muted?"Ativar áudio":"Silenciar áudio");if(!muted)$("remoteScreenAudio").play().catch(()=>{});});
$("reloadScreenBtn").addEventListener("click",reloadReceivedScreen);$("reloadCamerasBtn").addEventListener("click",reloadReceivedMedia);
$("cameraBtn").addEventListener("click",startCamera);$("cameraOffBtn").addEventListener("click",stopCamera);
$("filterSelect").addEventListener("change",e=>{
  state.filterMode=e.target.value;$("filterToggleBtn").disabled=state.filterMode==="none"||(state.filterMode==="image"&&!state.backgroundImage);
  if(state.filterActive&&state.localCamera)applyCameraFilter();
});
$("backgroundUpload").addEventListener("change",e=>{
  const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{state.backgroundImage=img;$("filterSelect").value="image";state.filterMode="image";$("filterToggleBtn").disabled=false;URL.revokeObjectURL(url);if(state.filterActive&&state.localCamera)applyCameraFilter();toast("Imagem de fundo carregada.")};
  img.onerror=()=>toast("Não foi possível abrir essa imagem.");img.src=url;
});
$("filterToggleBtn").addEventListener("click",()=>{
  state.filterActive=!state.filterActive;$("filterToggleBtn").textContent=state.filterActive?"Desativar filtro":"Ativar filtro";
  if(state.localCamera)applyCameraFilter();else toast("Ligue a câmera para aplicar o filtro.");
});
$("avatarBtn").addEventListener("click",()=>{if(state.cameraMode==="avatar")$("avatarUpload").click();else $("avatarUpload").click()});
$("avatarUpload").addEventListener("change",e=>startAvatar(e.target.files?.[0]));
$("cameraZoom").addEventListener("input",e=>{
  state.cameraZoom=Number(e.target.value);$("cameraZoomValue").textContent=state.cameraZoom.toFixed(1)+"×";
  if(state.localCamera&&state.cameraMode==="camera")applyCameraFilter();else if(state.cameraMode==="avatar")drawAvatarOutput();
});
$("mirrorCameraBtn").addEventListener("click",()=>{
  state.cameraMirrored=!state.cameraMirrored;
  $("mirrorCameraBtn").textContent=state.cameraMirrored?"Espelhar câmera: ligado":"Espelhar câmera: desligado";
  $("mirrorCameraBtn").classList.toggle("primary",state.cameraMirrored);$("mirrorCameraBtn").classList.toggle("secondary",!state.cameraMirrored);
  if(state.localCamera&&state.cameraMode==="camera")applyCameraFilter();else if(state.cameraMode==="avatar")drawAvatarOutput();
});
$("copyCodeBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.roomCode);toast("Código copiado.")}catch{toast("Código da sala: "+state.roomCode)}});
$("leaveBtn").addEventListener("click",()=>{if(state.isHost&&!confirm("Sair encerrará a sala para todos. Continuar?"))return;socket.emit("room:leave");cleanupLocal();location.reload()});
$("endRoomBtn").addEventListener("click",()=>{if(confirm("Encerrar a sala para todos os participantes?")){socket.emit("room:leave");cleanupLocal();location.reload()}});
socket.on("connect",()=>setConnection("Conectado ao servidor"));socket.on("disconnect",()=>setConnection("Reconectando…"));
window.addEventListener("beforeunload",()=>{if(state.roomCode)socket.emit("room:leave")});
