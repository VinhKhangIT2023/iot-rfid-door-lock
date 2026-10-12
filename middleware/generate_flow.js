const fs=require('fs'),path=require('path'),core=require('./core');const z='door-automation';
// Standalone clones keep logs inside the project. --week is for local reports.
const weekArg=process.argv.slice(2).find(arg=>arg.startsWith('--week='));
const reportWeek=weekArg?Number(weekArg.slice(7)):null;
if(weekArg&&(!Number.isInteger(reportWeek)||reportWeek<6||reportWeek>10))throw new Error('Use --week=6 through --week=10');
const historyFile=reportWeek===null
  ?path.resolve(__dirname,'..','runtime','history.jsonl')
  :path.resolve(__dirname,'..','..',`Tuan${String(reportWeek).padStart(2,'0')}`,'evidence',`w${reportWeek}`,'runtime','history.jsonl');
const uiFile=path.join(__dirname,'../application/index.html');const hasUI=fs.existsSync(uiFile);
const uiHtml=hasUI?fs.readFileSync(uiFile,'utf8')
  .replace('<!-- APP_STYLES -->',()=>'<style>'+fs.readFileSync(path.join(__dirname,'../application/styles.css'),'utf8')+'</style>')
  .replace('<!-- APP_SCRIPT -->',()=>'<script>'+fs.readFileSync(path.join(__dirname,'../application/dashboard.js'),'utf8')+'</script>'):'';
const flowLabel='RFID — Hai quy tắc tự động';
const flowInfo='R1 DOOR_FORCED: cảnh báo + status nếu đủ điều kiện; R2 LEFT_OPEN_WARN: nhắc đóng cửa. Một controller, không tự unlock.';
const nodes=[{id:z,type:'tab',label:flowLabel,disabled:false,info:flowInfo},
{id:'broker',type:'mqtt-broker',name:'Mô phỏng Mosquitto',broker:'test.mosquitto.org',port:'1883',clientid:'',autoConnect:true,usetls:false,protocolVersion:'4',keepalive:'15',cleansession:true},
{id:'rx',type:'mqtt in',z,name:'Nhận state/event/ack',topic:core.BASE+'/#',qos:'1',datatype:'utf8',broker:'broker',x:160,y:100,wires:[['ingest']]},
{id:'connection',type:'status',z,name:'Trạng thái kết nối broker',scope:['rx'],x:170,y:180,wires:[['connection-state']]},
{id:'tx',type:'mqtt out',z,name:'Gửi cmd QoS1 không retain',topic:'',qos:'1',retain:'false',broker:'broker',x:980,y:180,wires:[]},
{id:'log',type:'file',z,name:'Lịch sử MQTT và xử lý rule',filename:historyFile,filenameType:'str',appendNewline:true,createDir:true,overwriteFile:'false',encoding:'utf8',x:990,y:100,wires:[[]]},
{id:'debug',type:'debug',z,name:'Kết quả middleware',active:true,tosidebar:true,console:false,tostatus:false,complete:'payload',targetType:'msg',x:980,y:260,wires:[]},
{id:'ui',type:'http in',z,name:'Web App',url:'/door',method:'get',upload:false,x:150,y:360,wires:[['html']]},
{id:'html',type:'template',z,name:'Dashboard và theo dõi RFID',field:'payload',fieldType:'msg',format:'html',syntax:'plain',template:uiHtml,output:'str',x:470,y:360,wires:[['response']]},
{id:'get',type:'http in',z,name:'Truy vấn dữ liệu',url:'/api/door',method:'get',upload:false,x:160,y:440,wires:[['view']]},
{id:'post',type:'http in',z,name:'Lệnh người điều khiển',url:'/api/command',method:'post',upload:false,x:170,y:520,wires:[['auth']]},
{id:'response',type:'http response',z,name:'HTTP response',statusCode:'',headers:{'Cache-Control':'no-store'},x:1000,y:440,wires:[]},
{id:'manual',type:'inject',z,name:'Yêu cầu status thủ công',props:[{p:'action',v:'status',vt:'str'}],repeat:'',once:false,x:450,y:260,wires:[['command']]}
];
function fn(id,name,func,outputs,wires,x,y,initialize=''){nodes.push({id,type:'function',z,name,func,outputs,timeout:0,noerr:0,initialize,finalize:'',libs:[],wires,x,y});}
fn('connection-state','Theo dõi broker',`const c=global.get('doorCore');const m=flow.get('model')||c.initial();m.broker=msg.status.text==='node-red:common.status.connected';if(!m.broker)m.freshAt=0;flow.set('model',m);return null;`,1,[[]],480,180);
fn('ingest','Validate + history + R1/R2',`const c=global.get('doorCore');const m=flow.get('model')||c.initial();const r=c.ingest(m,msg.topic,msg.payload,msg.retain,Date.now());flow.set('model',m);if(r.error){node.warn(r.error);return null;}const rows=[{payload:JSON.stringify(r.row)}];if(r.rule)rows.push({payload:JSON.stringify(r.rule)});return [rows,r.request,r.rule?{payload:r.rule}:null];`,3,[['log'],['command'],['debug']],480,100,`flow.set('model',global.get('doorCore').initial());`);
fn('command','Một cổng gửi lệnh + kết quả rule',`const c=global.get('doorCore');const m=flow.get('model')||c.initial();const now=Date.now();const r=c.command(m,msg.action,now);const row=c.recordRuleAction(m,msg,r,now);flow.set('model',m);if(r.error)node.warn(r.error);return [r.error?null:r,row?{payload:JSON.stringify(row)}:null];`,2,[['tx'],['log','debug']],730,180);
fn('view','Dữ liệu ứng dụng',`const c=global.get('doorCore');const m=flow.get('model')||c.initial();msg.headers={'Content-Type':'application/json'};msg.payload=c.view(m,Date.now());return msg;`,1,[['response']],490,440);
fn('auth','Kiểm tra quyền + freshness',`const token=env.get('DOOR_OPERATOR_TOKEN');msg.headers={'Content-Type':'application/json'};if(!token||msg.req.headers.authorization!=='Bearer '+token){msg.statusCode=403;msg.payload={error:'forbidden'};return [null,msg];}const c=global.get('doorCore');const m=flow.get('model')||c.initial();const action=msg.payload&&msg.payload.action;const r=c.command(m,action,Date.now());flow.set('model',m);if(r.error){msg.statusCode=409;msg.payload={error:r.error};return [null,msg];}msg.statusCode=202;msg.payload={sent:true,action,seq:JSON.parse(r.payload).seq,note:'Chờ ACK; không xác nhận cửa mở'};return [r,msg];`,2,[['tx'],['response']],510,520);
const uiIds=['ui','html','get','post','response','view','auth'];
fs.writeFileSync(path.join(__dirname,'flows.json'),JSON.stringify(hasUI?nodes:nodes.filter(n=>!uiIds.includes(n.id)),null,2));console.log('Generated flows.json; Web App='+hasUI+'; log mode='+(reportWeek===null?'standalone':'week '+reportWeek)+'; history='+historyFile);
