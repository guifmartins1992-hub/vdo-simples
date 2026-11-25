const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("veetDesktop",{
 isDesktop:true,
 getInviteLink:code=>ipcRenderer.invoke("veet:get-invite-link",code),
 onTunnelReady:callback=>ipcRenderer.on("veet:tunnel-ready",(_event,url)=>callback(url)),
 onStatus:callback=>ipcRenderer.on("veet:status",(_event,message)=>callback(message))
});
