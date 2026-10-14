const MAX_CARDS=8;
function normalize(config){
  if(!config||Array.isArray(config)||!Number.isSafeInteger(config.revision)||config.revision<0||!Array.isArray(config.cards)||config.cards.length>MAX_CARDS)throw Error('policy_schema');
  const seen=new Set();
  const cards=config.cards.map(card=>{
    if(!card||typeof card.uid!=='string'||typeof card.name!=='string'||typeof card.enabled!=='boolean')throw Error('card_schema');
    const uid=card.uid.replace(/[:\s]/g,'').toUpperCase(),name=card.name.trim().normalize('NFC');
    if(!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid)||seen.has(uid))throw Error('uid_invalid_or_duplicate');
    if(!name||Buffer.byteLength(name,'utf8')>48||/[\u0000-\u001f\u007f]/.test(name))throw Error('card_name');
    seen.add(uid);
    const {days,start,end,valid_from,valid_until}=card;
    if(!Number.isInteger(days)||days<0||days>127||!Number.isInteger(start)||!Number.isInteger(end)||
      !((start===-1&&end===-1)||(start>=0&&start<1440&&end>=0&&end<1440&&start!==end)))throw Error('schedule');
    if(![valid_from,valid_until].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=4102444800)||
      (valid_from&&valid_until&&valid_from>=valid_until))throw Error('validity');
    return {uid,name,enabled:card.enabled,days,start,end,valid_from,valid_until};
  });
  return {revision:config.revision,cards};
}
function defaults(){return normalize({revision:0,cards:[['01020304','blue'],['11223344','green']].map(([uid,name])=>({uid,name,enabled:true,days:127,start:-1,end:-1,valid_from:0,valid_until:0}))});}
module.exports={MAX_CARDS,normalize,defaults};
