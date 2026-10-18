import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT||8787);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 try{let urlPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(urlPath.endsWith('/'))urlPath+='index.html';const file=path.resolve(root,'.'+urlPath);if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile())throw Error('not found');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('페이지를 찾을 수 없습니다.');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`${port}번 포트를 사용 중입니다. 다른 로컬 서버를 종료하거나 PORT를 바꾸세요.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/\nEditor: http://127.0.0.1:${port}/editor.html\nCtrl+C로 종료합니다.`));
