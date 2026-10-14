const fs=require('node:fs'),path=require('node:path'),policy=require('./card_policy'),core=require('./core');
const FILE=path.resolve(__dirname,'../runtime/card_policy.json');
function createAdmin({file=FILE,now=Date.now}={}){
  let desired=policy.defaults(),approved=false,error=null,lastSent=0,lastSession=null,blocked=false;
  if(fs.existsSync(file)){try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));desired=policy.normalize(saved);approved=saved.approved===true;}catch{error='policy_file_invalid';}}
  function view(model,at=now()){
    const ready=core.view(model,at).ready,supported=Number.isSafeInteger(model.state?.policy_revision);
    const observed=model.policy?.session===model.state?.session?model.policy:null;
    const target=approved?desired:observed||desired;
    const applied=ready&&model.state?.policy_ok===true&&observed?.ok===true&&observed.revision===target.revision&&model.state.policy_revision===target.revision;
    return {supported,ready,revision:target.revision,cards:target.cards,applied,
      can_edit:ready&&supported&&!!observed&&model.state.policy_revision===observed.revision&&(!approved||observed.revision>=desired.revision)&&!error,
      clock_synced:model.state?.clock_synced===true,device_revision:model.state?.policy_revision??null,
      error:error||model.policyAck?.reason||null,ack:model.policyAck||null};
  }
  function prepare(model,body){
    const state=view(model);if(!state.ready)throw Error('offline_or_stale');if(!state.supported)throw Error('firmware_update_required');if(error)throw Error(error);
    if(body?.retry===true){if(!approved)throw Error('no_pending_policy');blocked=false;lastSent=0;return {revision:desired.revision,retry:true};}
    if(!state.can_edit)throw Error('policy_pending');
    if(body?.expected_revision!==state.revision)throw Error('policy_conflict');
    const next=policy.normalize({revision:Math.max(now(),state.revision+1,desired.revision+1),cards:body.cards});
    if(Buffer.byteLength(JSON.stringify({...next,session:model.state.session}))>2048)throw Error('policy_too_large');
    fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.tmp',fd=fs.openSync(temporary,'w');
    try{fs.writeFileSync(fd,JSON.stringify({...next,approved:true},null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,file);desired=next;approved=true;blocked=false;lastSent=0;return {revision:next.revision};
  }
  function observeAck(ack){if(approved&&ack.revision===desired.revision&&ack.result==='rejected')blocked=true;}
  function reconcile(model,at=now()){
    const state=view(model,at),session=model.state?.session;
    if(session!==lastSession){lastSession=session;lastSent=0;blocked=false;}
    if(!approved||error||blocked||!state.ready||!state.supported||state.applied||model.state.policy_revision>desired.revision||at-lastSent<2000)return null;
    lastSent=at;return {topic:core.BASE+'/policy_cmd',payload:JSON.stringify({...desired,session}),qos:1,retain:false};
  }
  return {view,prepare,reconcile,observeAck};
}
let shared;function getAdmin(){return shared||(shared=createAdmin());}
module.exports={FILE,createAdmin,getAdmin};
