// Read-only live observation. Never publishes MQTT or sends door commands.
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),value=(name,fallback)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1)??fallback;
const seconds=Number(value('--seconds','900')),output=path.resolve(value('--output','../runtime/observation.jsonl'));
if(!Number.isInteger(seconds)||seconds<1||seconds>3600)throw new Error('--seconds must be 1..3600');
if(fs.existsSync(output)||fs.existsSync(output+'.summary.json'))throw new Error('Choose a new output file; existing evidence is preserved.');
fs.mkdirSync(path.dirname(output),{recursive:true});
const summary={kind:'live_http_observation',requested_seconds:seconds,start_utc:new Date().toISOString(),samples:0,ready_samples:0,not_ready_samples:0,errors:0,connections:{},sessions:[],max_age_ms:0,heartbeat_gaps_ms:[],note:'API observation proves telemetry availability only, not physical servo motion.'};
const start=performance.now();let priorHeartbeat=null,priorSession=null;
(async()=>{while(true){let sample={time_utc:new Date().toISOString(),elapsed_ms:Math.round(performance.now()-start)};
try{const response=await fetch('http://127.0.0.1:1880/api/door',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();Object.assign(sample,{ready:data.ready,connection:data.connection,broker_connected:data.broker_connected,device_online:data.device_online,age_ms:data.age_ms,state:data.state});summary.samples++;summary[data.ready?'ready_samples':'not_ready_samples']++;summary.connections[data.connection]=(summary.connections[data.connection]||0)+1;if(data.age_ms!==null)summary.max_age_ms=Math.max(summary.max_age_ms,data.age_ms);const id=data.state?.session;if(id&&!summary.sessions.includes(id))summary.sessions.push(id);
for(const row of data.history||[]){if(row.retained||!row.topic.endsWith('/state'))continue;const at=Date.parse(row.time_utc);if(priorHeartbeat!==null&&at<=priorHeartbeat)continue;if(priorHeartbeat!==null&&row.data.session===priorSession)summary.heartbeat_gaps_ms.push(at-priorHeartbeat);priorHeartbeat=at;priorSession=row.data.session;}
}catch(e){sample.error=e.message;summary.errors++;summary.samples++;summary.not_ready_samples++;}
fs.appendFileSync(output,JSON.stringify(sample)+'\n');if(performance.now()-start>=seconds*1000)break;await new Promise(r=>setTimeout(r,1000));}
summary.end_utc=new Date().toISOString();summary.elapsed_seconds=(performance.now()-start)/1000;summary.max_heartbeat_gap_ms=summary.heartbeat_gaps_ms.length?Math.max(...summary.heartbeat_gaps_ms):null;summary.continuous_ready=summary.not_ready_samples===0&&summary.errors===0&&summary.elapsed_seconds>=seconds;delete summary.heartbeat_gaps_ms;fs.writeFileSync(output+'.summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));})().catch(e=>{console.error(e.message);process.exitCode=1;});
