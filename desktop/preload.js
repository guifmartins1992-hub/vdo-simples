const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vdoDesktop",{
 isDesktop:true,
 getInviteLink:code=>ipcRenderer.invoke("vdo:get-invite-link",code),
 onTunnelReady:callback=>ipcRenderer.on("vdo:tunnel-ready",(_event,url)=>callback(url)),
 onStatus:callback=>ipcRenderer.on("vdo:status",(_event,message)=>callback(message))
});
