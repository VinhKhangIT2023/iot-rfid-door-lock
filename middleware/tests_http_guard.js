// Real HTTP requests to a local, isolated parser fixture; no MQTT or unlocks.
const assert=require('node:assert/strict'),http=require('node:http'),guard=require('./http_guard');
const server=http.createServer((req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  guard(req,res,()=>res.json({action:req.body?.action||null}));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+server.address().port;let passed=0;
  const cases=[['malformed JSON','{bad','application/json',400,'invalid_json'],['array body','[]','application/json',400,'command_schema'],['oversized body',JSON.stringify({action:'status',padding:'x'.repeat(3000)}),'application/json',413,'payload_too_large'],['unsupported content type','action=status','text/plain',415,'content_type'],['valid command JSON',JSON.stringify({action:'status'}),'application/json',200,null]];
  for(const [name,body,type,status,error] of cases){const r=await fetch(root+'/api/command',{method:'POST',headers:{'Content-Type':type},body});const d=await r.json();assert.equal(r.status,status,name);if(error)assert.equal(d.error,error,name);else assert.equal(d.action,'status');passed++;console.log('PASS: '+name);}
  const other=await fetch(root+'/api/door');assert.equal(other.status,200);passed++;console.log('PASS: unrelated GET is unchanged');
  console.log(`SUMMARY: ${passed}/6 HTTP parser fixtures passed. Isolated server; no live device implied.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
