'use strict';
// One styled listbox for every select: keyboard, focus and touch use the same menu.
const selectControls=new Map();
function detachControlFromLabel(label,wrapper){
  // Popovers contain their own buttons. Nesting them inside <label> makes a
  // calendar click activate its labelled trigger again and close the popover.
  if(label?.contains(wrapper)){const field=document.createElement('div');field.className='control-field';label.before(field);field.append(label,wrapper);}
}
function enhanceSelects(root=document){
  for(const select of root.querySelectorAll('select')){
    if(selectControls.has(select))continue;
    const wrapper=document.createElement('div');wrapper.className='custom-select';
    const button=document.createElement('button');button.type='button';button.id=select.id+'-trigger';button.className='select-trigger';
    const label=document.querySelector('label[for="'+select.id+'"]');
    if(label){label.id=label.id||select.id+'-label';label.htmlFor=button.id;button.setAttribute('aria-label',[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||'Chọn giá trị');}
    else button.setAttribute('aria-label',select.getAttribute('aria-label')||'Chọn giá trị');
    const value=document.createElement('span');value.id=button.id+'-value';
    const arrow=document.createElement('span');arrow.className='select-chevron';arrow.setAttribute('aria-hidden','true');
    button.append(value,arrow);button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const list=document.createElement('div');list.className='select-options';list.id=select.id+'-options';list.setAttribute('role','listbox');list.hidden=true;
    button.setAttribute('aria-controls',list.id);select.before(wrapper);wrapper.append(select,button,list);select.hidden=true;detachControlFromLabel(label,wrapper);
    let active=0;
    function sync(){value.textContent=select.selectedOptions[0]?.textContent||'Chọn';button.disabled=select.disabled;
      for(const [i,option] of [...list.children].entries()){option.setAttribute('aria-selected',String(select.options[i].value===select.value));}}
    function close(){list.hidden=true;button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');wrapper.classList.remove('opens-up');}
    function highlight(index){active=Math.max(0,Math.min(select.options.length-1,index));for(const [i,option] of [...list.children].entries())option.classList.toggle('is-active',i===active);button.setAttribute('aria-activedescendant',select.id+'-option-'+active);list.children[active]?.scrollIntoView({block:'nearest'});}
    function open(){for(const control of selectControls.values())control.close();list.hidden=false;button.setAttribute('aria-expanded','true');const rect=button.getBoundingClientRect();wrapper.classList.toggle('opens-up',innerHeight-rect.bottom<Math.min(250,list.scrollHeight)&&rect.top>250);highlight(select.selectedIndex);}
    function choose(index){const option=select.options[index];if(!option||option.disabled)return;select.value=option.value;sync();close();button.focus();select.dispatchEvent(new Event('change',{bubbles:true}));}
    for(const [i,option] of [...select.options].entries()){
      const item=document.createElement('div');item.id=select.id+'-option-'+i;item.setAttribute('role','option');item.className='select-option';item.textContent=option.textContent;item.setAttribute('aria-disabled',String(option.disabled));
      // Keep focus on the combobox until click commits the option. Otherwise
      // focusout hides the menu before the pointer's click can reach it.
      item.onpointerdown=e=>e.preventDefault();item.onclick=()=>choose(i);list.append(item);
    }
    button.onclick=()=>list.hidden?open():close();
    button.onkeydown=event=>{
      if(event.key==='Escape'){close();return;}
      if(event.key==='Tab'){close();return;}
      if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
        event.preventDefault();const wasClosed=list.hidden;
        if(wasClosed){open();if(event.key==='Enter'||event.key===' ')return;}
        if(event.key==='ArrowDown')highlight(wasClosed?select.selectedIndex:active+1);
        else if(event.key==='ArrowUp')highlight(wasClosed?select.selectedIndex:active-1);
        else if(event.key==='Home')highlight(0);else if(event.key==='End')highlight(select.options.length-1);
        else choose(active);
      }
    };
    select.addEventListener('change',sync);selectControls.set(select,{close,sync});sync();
  }
}
document.addEventListener('pointerdown',event=>{for(const [select,control] of selectControls)if(!select.parentElement.contains(event.target))control.close();});
function syncSelectControls(){for(const control of selectControls.values())control.sync();}

const dateControls=new Map();
const dateIso=date=>date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
function enhanceDates(root=document){
  for(const input of root.querySelectorAll('input[type=date]')){
    if(dateControls.has(input))continue;
    const wrapper=document.createElement('div');wrapper.className='date-control';input.before(wrapper);wrapper.append(input);input.hidden=true;
    const trigger=document.createElement('button');trigger.type='button';trigger.id=input.id+'-trigger';trigger.className='date-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    const label=document.querySelector('label[for="'+input.id+'"]');const labelText=label?[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():'Chọn ngày';if(label)label.htmlFor=trigger.id;
    const value=document.createElement('span'),icon=document.createElement('span');icon.className='calendar-icon';icon.setAttribute('aria-hidden','true');trigger.append(value,icon);wrapper.append(trigger);
    const clear=document.createElement('button');clear.type='button';clear.className='date-clear';clear.textContent='×';clear.onclick=()=>choose('');wrapper.append(clear);
    const calendar=document.createElement('div');calendar.className='calendar-popover';calendar.hidden=true;calendar.setAttribute('role','dialog');calendar.setAttribute('aria-label',labelText);wrapper.append(calendar);detachControlFromLabel(label,wrapper);
    let month=new Date(),focusDay=null;
    function sync(){const caption=label?.textContent.trim()||labelText;value.textContent=input.value?input.value.split('-').reverse().join('/'):'Chọn ngày';value.classList.toggle('date-placeholder',!input.value);trigger.setAttribute('aria-label',caption+': '+value.textContent);trigger.disabled=input.disabled;clear.hidden=!input.value;clear.disabled=input.disabled;clear.setAttribute('aria-label','Xóa '+caption.toLowerCase());calendar.setAttribute('aria-label',caption);}
    function close(refocus=false){calendar.hidden=true;wrapper.classList.remove('opens-up');trigger.setAttribute('aria-expanded','false');if(refocus)trigger.focus();}
    function choose(date){input.value=date;sync();close(true);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    function makeButton(text,cls,action){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.onclick=action;return b;}
    function draw(){
      calendar.replaceChildren();const header=document.createElement('div');header.className='calendar-header';
      const previous=makeButton('‹','calendar-month',()=>{month.setUTCMonth(month.getUTCMonth()-1);draw();calendar.querySelector('.calendar-month').focus();});previous.setAttribute('aria-label','Tháng trước');
      const next=makeButton('›','calendar-month',()=>{month.setUTCMonth(month.getUTCMonth()+1);draw();calendar.querySelectorAll('.calendar-month')[1].focus();});next.setAttribute('aria-label','Tháng sau');
      const title=document.createElement('strong');title.textContent='Tháng '+(month.getUTCMonth()+1)+' · '+month.getUTCFullYear();header.append(previous,title,next);calendar.append(header);
      const grid=document.createElement('div');grid.className='calendar-grid';
      for(const text of ['T2','T3','T4','T5','T6','T7','CN']){const day=document.createElement('span');day.className='calendar-weekday';day.textContent=text;grid.append(day);}
      const first=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1)),offset=(first.getUTCDay()+6)%7;
      if(!focusDay?.startsWith(dateIso(first).slice(0,7)))focusDay=dateIso(first);
      for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
      const count=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
      for(let i=1;i<=count;i++){
        const iso=dateIso(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),i))),button=makeButton(String(i),'calendar-day',()=>choose(iso));button.dataset.date=iso;button.setAttribute('aria-label',iso.split('-').reverse().join('/'));button.setAttribute('aria-pressed',String(input.value===iso));
        button.disabled=(!!input.min&&iso<input.min)||(!!input.max&&iso>input.max);button.tabIndex=iso===focusDay?0:-1;
        button.onkeydown=e=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta===undefined)return;e.preventDefault();const date=new Date(iso+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+delta);focusDay=dateIso(date);month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));draw();calendar.querySelector('[data-date="'+focusDay+'"]')?.focus();};grid.append(button);
      }
      calendar.append(grid);const footer=document.createElement('div');footer.className='calendar-footer';
      footer.append(makeButton('Xóa ngày','text-button',()=>choose('')),makeButton('Hôm nay','text-button',()=>{const today=new Date();const iso=dateIso(new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())));if((!input.min||iso>=input.min)&&(!input.max||iso<=input.max))choose(iso);}));calendar.append(footer);
    }
    trigger.onclick=()=>{if(!calendar.hidden){close();return;}for(const c of dateControls.values())c.close();for(const c of selectControls.values())c.close();const selected=input.value?new Date(input.value+'T00:00:00Z'):new Date();focusDay=input.value||dateIso(selected);month=new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth(),1));draw();calendar.hidden=false;trigger.setAttribute('aria-expanded','true');const rect=trigger.getBoundingClientRect();wrapper.classList.toggle('opens-up',innerHeight-rect.bottom<calendar.offsetHeight+8&&rect.top>calendar.offsetHeight+8);calendar.querySelector('[data-date="'+focusDay+'"]')?.focus();};
    wrapper.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close(true);}};
    calendar.onpointerdown=e=>e.preventDefault();input.addEventListener('change',sync);dateControls.set(input,{sync,close});sync();
  }
}
function syncDateControls(){for(const c of dateControls.values())c.sync();}
document.addEventListener('pointerdown',e=>{for(const [input,c] of dateControls)if(!input.parentElement.contains(e.target))c.close();});
document.addEventListener('focusin',e=>{for(const [input,c] of dateControls)if(!input.parentElement.contains(e.target))c.close();for(const [select,c] of selectControls)if(!select.parentElement.contains(e.target))c.close();});

function normalizeClock(value){
  let text=String(value).trim().replace(/[h.]/i,':');
  if(/^\d{3,4}$/.test(text))text=text.slice(0,-2)+':'+text.slice(-2);
  const match=text.match(/^(\d{1,2})(?::(\d{2}))?$/);if(!match)return null;
  const hour=Number(match[1]),minute=Number(match[2]||0);if(hour>23||minute>59)return null;
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
const timeControls=new Map();
function enhanceTimes(root=document){
  for(const input of root.querySelectorAll('input[type=time]')){
    if(timeControls.has(input))continue;
    const wrapper=document.createElement('div');wrapper.className='time-control';input.before(wrapper);wrapper.append(input);input.hidden=true;
    const label=document.querySelector('label[for="'+input.id+'"]'),caption=label?[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():'Chọn giờ';
    const editor=document.createElement('input');editor.type='text';editor.id=input.id+'-entry';editor.className='time-entry';editor.inputMode='numeric';editor.autocomplete='off';editor.placeholder='HH:mm';editor.maxLength=5;editor.setAttribute('aria-label',caption+' (HH:mm)');if(label)label.htmlFor=editor.id;
    const trigger=document.createElement('button');trigger.type='button';trigger.id=input.id+'-trigger';trigger.className='time-trigger';trigger.setAttribute('aria-label','Chọn '+caption.toLowerCase()+' bằng đồng hồ');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');const symbol=document.createElement('span');symbol.className='clock-icon';symbol.setAttribute('aria-hidden','true');trigger.append(symbol);
    const popup=document.createElement('div');popup.className='clock-popover';popup.id=input.id+'-clock';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label',caption);trigger.setAttribute('aria-controls',popup.id);
    const error=document.createElement('small');error.id=input.id+'-error';error.className='time-error';error.hidden=true;error.textContent='Nhập giờ từ 00:00 đến 23:59.';editor.setAttribute('aria-describedby',error.id);
    wrapper.append(editor,trigger,popup,error);detachControlFromLabel(label,wrapper);
    let hour=0,minute=0,mode='hour';
    function sync(){editor.value=input.value;editor.disabled=trigger.disabled=input.disabled;editor.removeAttribute('aria-invalid');error.hidden=true;}
    function close(refocus=false){popup.hidden=true;trigger.setAttribute('aria-expanded','false');wrapper.classList.remove('opens-up');if(refocus)trigger.focus();}
    function commit(value){input.value=value;editor.value=value;editor.removeAttribute('aria-invalid');error.hidden=true;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    function button(text,cls,action){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.onclick=action;return b;}
    function draw(){
      popup.replaceChildren();const heading=document.createElement('div');heading.className='clock-heading';const title=document.createElement('b');title.textContent=mode==='hour'?'Chọn giờ':'Chọn phút';const hint=document.createElement('small');hint.textContent='Định dạng 24 giờ';heading.append(title,hint);popup.append(heading);
      const display=document.createElement('div');display.className='clock-display';const h=button(String(hour).padStart(2,'0'),'clock-number'+(mode==='hour'?' active':''),()=>{mode='hour';draw();});h.setAttribute('aria-label','Chọn giờ');const m=button(String(minute).padStart(2,'0'),'clock-number'+(mode==='minute'?' active':''),()=>{mode='minute';draw();});m.setAttribute('aria-label','Chọn phút');const colon=document.createElement('span');colon.textContent=':';display.append(h,colon,m);popup.append(display);
      const periods=document.createElement('div');periods.className='clock-periods';
      for(const [text,offset] of [['00–11 giờ',0],['12–23 giờ',12]]){const p=button(text,'clock-period'+(Math.floor(hour/12)===offset/12?' active':''),()=>{hour=hour%12+offset;mode='hour';draw();});p.setAttribute('aria-pressed',String(Math.floor(hour/12)===offset/12));periods.append(p);}popup.append(periods);
      const dial=document.createElement('div');dial.className='clock-dial';dial.setAttribute('role','group');dial.setAttribute('aria-label',mode==='hour'?'Các giờ':'Các phút');
      const hand=document.createElement('span');hand.className='clock-hand';hand.style.transform='rotate('+(mode==='hour'?(hour%12)*30:minute*6)+'deg)';hand.setAttribute('aria-hidden','true');dial.append(hand);
      for(let i=0;i<12;i++){
        const value=mode==='hour'?i+Math.floor(hour/12)*12:i*5,selected=mode==='hour'?hour:minute;
        const mark=button(String(value).padStart(2,'0'),'clock-mark'+(value===selected?' active':''),()=>{if(mode==='hour'){hour=value;mode='minute';}else minute=value;draw();});mark.setAttribute('aria-label',value+(mode==='hour'?' giờ':' phút'));mark.setAttribute('aria-pressed',String(value===selected));mark.style.left=(50+Math.sin(i*Math.PI/6)*37)+'%';mark.style.top=(50-Math.cos(i*Math.PI/6)*37)+'%';dial.append(mark);
      }
      const centre=document.createElement('span');centre.className='clock-centre';dial.append(centre);popup.append(dial);
      const note=document.createElement('small');note.className='clock-note';note.textContent='Chọn trên đồng hồ hoặc nhập chính xác giờ/phút trong ô.';popup.append(note);
      const actions=document.createElement('div');actions.className='clock-actions';actions.append(button('Hủy','button secondary compact',()=>close(true)),button('Áp dụng','button primary compact',()=>{commit(String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'));close(true);}));popup.append(actions);
    }
    editor.oninput=()=>{const value=normalizeClock(editor.value);input.value=value||'';editor.removeAttribute('aria-invalid');error.hidden=true;};
    editor.onblur=()=>{const value=normalizeClock(editor.value);if(value)commit(value);else{input.value='';editor.setAttribute('aria-invalid','true');error.hidden=false;}};
    trigger.onclick=()=>{if(!popup.hidden){close();return;}for(const c of timeControls.values())c.close();for(const c of dateControls.values())c.close();for(const c of selectControls.values())c.close();[hour,minute]=(normalizeClock(editor.value)||'00:00').split(':').map(Number);mode='hour';draw();popup.hidden=false;trigger.setAttribute('aria-expanded','true');const rect=trigger.getBoundingClientRect();wrapper.classList.toggle('opens-up',innerHeight-rect.bottom<popup.offsetHeight+8&&rect.top>popup.offsetHeight+8);};
    popup.onpointerdown=e=>e.preventDefault();wrapper.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close(true);}if(e.key==='Enter'&&e.target===editor){e.preventDefault();editor.blur();}};
    input.addEventListener('change',sync);timeControls.set(input,{sync,close});sync();
  }
}
function syncTimeControls(){for(const c of timeControls.values())c.sync();}
document.addEventListener('pointerdown',e=>{for(const [input,c] of timeControls)if(!input.parentElement.contains(e.target))c.close();});
document.addEventListener('focusin',e=>{for(const [input,c] of timeControls)if(!input.parentElement.contains(e.target))c.close();});

function isHotelStay(card){return card.start===-1&&card.end===-1&&card.days===127&&card.valid_from>0&&card.valid_until>0&&((card.valid_from/60+420)%1440)===840&&((card.valid_until/60+420)%1440)===720;}
function makeCardSchedule(mode,from,until,startValue,endValue,dayMask){
  if(!['all','window','hotel'].includes(mode))throw Error('schedule');
  const midnight=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('validity');const n=Date.parse(value+'T00:00:00+07:00')/1000;if(!Number.isFinite(n)||dateIso(new Date((n+7*3600)*1000))!==value)throw Error('validity');return n;};
  if(mode==='hotel'){
    if(!from||!until)throw Error('hotel_dates');
    const valid_from=midnight(from)+14*3600,valid_until=midnight(until)+12*3600;
    if(valid_until<=valid_from)throw Error('hotel_dates');
    return {days:127,start:-1,end:-1,valid_from,valid_until};
  }
  const minute=value=>{if(!/^\d{2}:\d{2}$/.test(value))throw Error('schedule');const [hour,min]=value.split(':').map(Number);if(hour>23||min>59)throw Error('schedule');return hour*60+min;};
  const start=mode==='window'?minute(startValue):-1,end=mode==='window'?minute(endValue):-1;
  const valid_from=from?midnight(from):0,valid_until=until?midnight(until)+86400:0;
  if((mode==='window'&&start===end)||(valid_from&&valid_until&&valid_from>=valid_until))throw Error('validity');
  return {days:dayMask,start,end,valid_from,valid_until};
}

function initializeMicMeter({onLevel,onInfo}){
  let generation=0,stream=null,context=null,frame=null,peak=0;
  function release(){if(frame!==null)cancelAnimationFrame(frame);frame=null;if(stream)for(const track of stream.getTracks())track.stop();stream=null;if(context)context.close().catch(()=>{});context=null;}
  return {
    async start(){
      const current=++generation;release();peak=0;onLevel(0);onInfo('Đang kiểm tra âm thanh micro…');
      try{
        const next=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        if(current!==generation){next.getTracks().forEach(t=>t.stop());return;}stream=next;
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){onInfo('Đã mở micro; trình duyệt chưa hỗ trợ thanh mức âm.');return;}
        context=new Audio();await context.resume();if(current!==generation)return;
        const analyser=context.createAnalyser();analyser.fftSize=512;context.createMediaStreamSource(stream).connect(analyser);const samples=new Uint8Array(analyser.fftSize),label=stream.getAudioTracks()[0]?.label||'Micro mặc định';
        const tick=()=>{if(current!==generation)return;analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,n)=>s+((n-128)/128)**2,0)/samples.length);peak=Math.max(peak,rms);onLevel(Math.min(100,Math.round(rms*450)));onInfo(label+(peak>.012?' · đã thu được âm thanh':' · chưa thu được tiếng, kiểm tra nút tắt micro'));frame=requestAnimationFrame(tick);};tick();
      }catch(error){if(current===generation)onInfo(error.name==='NotAllowedError'?'Micro chưa được cấp quyền cho trang Web.':error.name==='NotFoundError'?'Không tìm thấy micro trên máy.':'Chưa mở được micro để kiểm tra âm thanh.');}
    },stop(){generation++;release();onLevel(0);}
  };
}

function voiceIntent(text){
  const value=String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  if(/^(mo khoa( cua)?|mo cua)$/.test(value))return 'unlock';
  if(/^(doc|xem|kiem tra) trang thai( cua)?$/.test(value))return 'status';
  if(/^(xem|mo) lich su( cua)?$/.test(value))return 'journal';
  if(/^(xem|mo) (hoat dong (the|rfid)|rfid)$/.test(value))return 'rfid';
  if(/^(xem|mo) quan ly the$/.test(value))return 'cards';
  if(/^(xem|mo) tong quan$/.test(value))return 'overview';
  return null;
}
function initializeVoice({onIntent,onText,onState,Recognition=window.SpeechRecognition||window.webkitSpeechRecognition,schedule=setTimeout,cancel=clearTimeout}){
  if(!Recognition){onState('unsupported');return {start(){},stop(){}};}
  let recognition;try{recognition=new Recognition();}catch{onState('unsupported');return {start(){},stop(){}};}
  recognition.lang='vi-VN';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
  let phase='idle',handled=false,endState='idle',watchdog=null,stable=null,lastText='';
  function clearTimers(){if(watchdog!==null)cancel(watchdog);if(stable!==null)cancel(stable);watchdog=stable=null;}
  function finish(text){if(handled||!text.trim())return;handled=true;clearTimers();onText(text,true);const intent=voiceIntent(text);endState=intent?'recognized':'unknown';onState(endState);if(intent)onIntent(intent);if(phase!=='idle'){phase='stopping';try{recognition.stop();}catch{}}}
  recognition.onstart=()=>{phase='listening';onState('listening');};
  recognition.onaudiostart=()=>{if(!handled&&phase!=='stopping')onState('listening','audio');};
  recognition.onspeechstart=()=>{if(!handled&&phase!=='stopping')onState('listening','speech');};
  recognition.onspeechend=()=>{if(!handled&&phase==='listening'){phase='stopping';onState('processing');recognition.stop();}};
  recognition.onend=()=>{phase='idle';clearTimers();if(endState==='idle')onState('error',lastText?'no_final_result':'no_result');};
  recognition.onerror=e=>{if(endState==='cancelled'||(endState==='error'&&e.error==='aborted'))return;clearTimers();phase='idle';endState='error';onState('error',e.error);};
  recognition.onnomatch=()=>{if(!handled){endState='unknown';onState('unknown');}};
  recognition.onresult=e=>{
    if(handled)return;if(stable!==null)cancel(stable);stable=null;
    const results=Array.from(e.results||[]),text=results.map(r=>r[0]?.transcript||'').join(' ').trim();lastText=text;
    if(!text){onState('listening');return;}const final=results.length>0&&results.every(r=>r.isFinal);onText(text,final);
    if(final){finish(text);return;}
    const intent=voiceIntent(text);
    // Navigation can act on a complete, stable phrase. Opening the lock always
    // waits for the engine's final result and the existing confirmation dialog.
    if(intent&&intent!=='unlock')stable=schedule(()=>finish(text),700);
  };
  return {start(){
    if(phase==='stopping')return;
    if(phase!=='idle'){phase='stopping';onState('processing');try{recognition.stop();}catch{phase='idle';onState('error','stop_failed');}return;}
    clearTimers();handled=false;endState='idle';lastText='';phase='starting';onText('',false);onState('starting');
    watchdog=schedule(()=>{endState='error';phase='idle';clearTimers();onState('error','timeout');recognition.abort();},20000);
    try{recognition.start();}catch{clearTimers();phase='idle';endState='error';onState('error','start_failed');}
  },stop(){clearTimers();endState='cancelled';phase='idle';recognition.abort();}};
}
