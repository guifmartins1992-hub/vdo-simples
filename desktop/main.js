const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
let mainWindow, tunnelProcess, tunnelUrl = "", vdoServer;
function sendStatus(message){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("vdo:status",message);}
function downloadCloudflared(destination){
 return new Promise((resolve,reject)=>{
  const request=(url,redirects=0)=>{
   if(redirects>8)return reject(new Error("Redirecionamentos demais ao baixar o Cloudflare Tunnel."));
   https.get(url,response=>{
    if([301,302,303,307,308].includes(response.statusCode)&&response.headers.location){response.resume();return request(response.headers.location,redirects+1);}
    if(response.statusCode!==200){response.resume();return reject(new Error("Download do Cloudflare Tunnel falhou: HTTP "+response.statusCode));}
    const file=fs.createWriteStream(destination);response.pipe(file);file.on("finish",()=>file.close(resolve));file.on("error",reject);
   }).on("error",reject);
  };request("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe");
 });
}
async function startTunnel(){
 const binary=path.join(app.getPath("userData"),"cloudflared.exe");fs.mkdirSync(path.dirname(binary),{recursive:true});
 if(!fs.existsSync(binary)){sendStatus("Baixando componente de conexão pública…");await downloadCloudflared(binary);}
 sendStatus("Gerando o link público…");
 tunnelProcess=spawn(binary,["tunnel","--no-autoupdate","--url","http://127.0.0.1:3001"],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 const consume=chunk=>{
  const match=chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if(match&&!tunnelUrl){tunnelUrl=match[0];sendStatus("Conexão pública pronta.");if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("vdo:tunnel-ready",tunnelUrl);}
 };
 tunnelProcess.stdout.on("data",consume);tunnelProcess.stderr.on("data",consume);
 tunnelProcess.on("error",e=>sendStatus("Falha ao iniciar o túnel: "+e.message));
 tunnelProcess.on("exit",code=>{if(code&&code!==0)sendStatus("A conexão pública foi encerrada (código "+code+").");});
}
function createWindow(){
 mainWindow=new BrowserWindow({width:1440,height:900,minWidth:900,minHeight:620,backgroundColor:"#080b09",autoHideMenuBar:true,title:"VDO Simples",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 mainWindow.loadURL("http://127.0.0.1:3001");mainWindow.on("closed",()=>{mainWindow=null;});
}
ipcMain.handle("vdo:get-invite-link",async(_event,code)=>{
 if(!/^[A-Z0-9]{6}$/.test(String(code||"")))throw new Error("Código de sala inválido.");
 if(!tunnelUrl)throw new Error("A conexão pública ainda está sendo preparada.");
 return tunnelUrl+"/?room="+encodeURIComponent(code);
});
app.whenReady().then(async()=>{
 process.env.PORT="3001";process.chdir(app.getAppPath());vdoServer=require(path.join(app.getAppPath(),"server.js")).server;createWindow();
 try{await startTunnel();}catch(error){sendStatus("Link público indisponível: "+error.message);dialog.showMessageBox(mainWindow,{type:"warning",title:"Conexão pública indisponível",message:"O VDO abriu, mas não conseguiu preparar o link para convidados.",detail:error.message});}
});
app.on("before-quit",()=>{if(tunnelProcess&&!tunnelProcess.killed)tunnelProcess.kill();if(vdoServer&&vdoServer.listening)vdoServer.close();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
