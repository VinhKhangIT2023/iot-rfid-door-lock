const assert=require('assert'),c=require('./core');const m=c.initial(),now=1780000000000;
const topic=s=>c.BASE+'/'+s;const state={state:'LOCKED',door:'CLOSED',session:'0123456789abcdef'};
m.broker=true;c.ingest(m,topic('availability'),'online',true,now);c.ingest(m,topic('state'),JSON.stringify(state),true,now);
assert(c.command(m,'unlock',now).error,'retained cannot authorize');
c.ingest(m,topic('state'),JSON.stringify(state),false,now);const a=c.command(m,'unlock',now);assert(!a.error);assert.strictEqual(a.retain,false);
const b=c.command(m,'status',now);assert(JSON.parse(b.payload).seq>JSON.parse(a.payload).seq);
assert(c.command(m,'unlock',now+13000).error,'stale blocked');
assert(c.command(m,'lock',now).error,'unknown blocked');
c.ingest(m,topic('availability'),'offline',false,now);assert(c.command(m,'unlock',now).error);
c.ingest(m,topic('availability'),'online',false,now);assert(c.command(m,'unlock',now).error,'online alone insufficient');
c.ingest(m,topic('state'),JSON.stringify(state),false,now);
const force=JSON.stringify({evt:'DOOR_FORCED'});assert(c.ingest(m,topic('event'),force,false,now).request.action==='status');assert(!c.ingest(m,topic('event'),force,false,now).request);
assert.strictEqual(m.alerts.length,1);assert(!c.ingest(m,topic('event'),force,true,now).request);
c.ingest(m,topic('state'),JSON.stringify(state),false,now);assert(c.ingest(m,topic('event'),force,false,now).request);
m.broker=false;assert(c.command(m,'unlock',now).error);
const flows=require('./flows.json');for(const n of flows)if(n.type==='function')new Function('msg','flow','global','node','env',n.func);
// Execute actual exported auth function: check HTTP errors do not publish MQTT.
if(flows.some(n=>n.id==='auth')) {
const auth=new Function('msg','flow','global','node','env',flows.find(n=>n.id==='auth').func);
let live=c.initial();const flow={get:()=>live,set:(_,v)=>{live=v;}};
const globalCtx={get:()=>c};const env={get:()=> 'test-only-code'};
let result=auth({req:{headers:{authorization:'Bearer wrong'}},payload:{action:'unlock'}},flow,globalCtx,{},env);
assert.strictEqual(result[0],null);assert.strictEqual(result[1].statusCode,403);
result=auth({req:{headers:{authorization:'Bearer test-only-code'}},payload:{action:'unlock'}},flow,globalCtx,{},env);
assert.strictEqual(result[0],null);assert.strictEqual(result[1].statusCode,409);
live.broker=true;c.ingest(live,topic('availability'),'online',false,Date.now());c.ingest(live,topic('state'),JSON.stringify(state),false,Date.now());
result=auth({req:{headers:{authorization:'Bearer test-only-code'}},payload:{action:'status'}},flow,globalCtx,{},env);
assert.strictEqual(result[1].statusCode,202);assert.strictEqual(JSON.parse(result[0].payload).action,'status');
console.log('PASS: HTTP auth 403/409/202.');
}
console.log('PASS: freshness, retained, offline, seq, action, broker, automation de-duplication, flow syntax. Offline logic tests only.');
