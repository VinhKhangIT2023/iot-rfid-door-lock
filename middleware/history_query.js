const presentation=require('./event_presentation');
function source(row){return row.data.offline?'offline':row.historical?'retry':'live';}
function day(value,end=false){
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('invalid_date');
  const stamp=Date.parse(value+'T00:00:00+07:00');
  if(!Number.isFinite(stamp)||new Date(stamp+7*3600000).toISOString().slice(0,10)!==value)throw Error('invalid_date');
  return stamp+(end?86400000:0);
}
function query(rows,options={}){
  const from=day(options.from),to=day(options.to,true),kind=options.source||'all',q=String(options.q||'').trim().toLowerCase();
  if(from!==null&&to!==null&&from>=to)throw Error('date_range');
  if(!['all','offline','retry','live'].includes(kind)||q.length>160)throw Error('filter');
  const page=Number(options.page||0),limit=Number(options.limit||50);
  if(!Number.isInteger(page)||page<0||page>100000||!Number.isInteger(limit)||limit<1||limit>100)throw Error('pagination');
  const matches=rows.filter(r=>{const at=Date.parse(r.event_time_utc||r.time_utc);return (kind==='all'||source(r)===kind)&&
    (from===null||at>=from)&&(to===null||at<to)&&(!q||(presentation.title(r.data)+' '+presentation.detail(r.data)+' '+r.data.evt+' '+r.data.detail+' '+r.event_id).toLowerCase().includes(q));}).reverse();
  return {total:matches.length,page,limit,has_more:(page+1)*limit<matches.length,events:matches.slice(page*limit,(page+1)*limit).map(presentation.present),matches};
}
function cell(value){let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function csv(rows){
  const header=['event_id','occurred_at_utc','received_at_utc','boot_id','uptime_ms','event','state','source','detail'];
  return '\uFEFF'+[header,...rows.map(r=>[r.event_id,r.event_time_utc||'',r.time_utc,r.data.boot_id,r.data.uptime_ms,r.data.evt,r.data.state,source(r),r.data.detail])].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
module.exports={source,day,query,csv};
