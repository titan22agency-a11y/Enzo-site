
(function(){
  var STATUSES=[['new','جديد'],['confirmed','اتأكد'],['preparing','بيتجهز'],['shipped','اتشحن'],['delivered','اتسلم'],['returned','مرتجع'],['cancelled','ملغي']];
  var SL={};STATUSES.forEach(function(s){SL[s[0]]=s[1];});
  var TP={d3:'سؤال الاستخدام',d7:'تقييم أول انطباع',d21:'النتيجة وNPS',refill:'إعادة الطلب',recover:'اتصال بعد تقييم وحش'};
  var REASONS=['التوصيل','التغليف','النتيجة','سهولة الاستخدام','الريحة أو القوام','السعر','خدمة العملاء'];
  var db={me:{},products:[],orders:[],feedback:[],sent:{},settings:{},content:{ann:['','','']}};
  function api(method,url,body){
    return fetch(url,{method:method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(j){
        if(r.status===401&&url!=='/api/login'){showLogin();throw new Error('login');}
        if(!r.ok)throw new Error(j.error||'حصل خطأ');return j;});});
  }
  function fail(e){if(e&&e.message!=='login')toast(e.message||'حصل خطأ');}
  function loadState(){return api('GET','/api/admin/state').then(function(s){var first=!db.me.username;db=s;$('#meName').textContent=s.me.name;renderAll();return first;}).catch(fail);}
  function $(s){return document.querySelector(s);} function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(n){return Number(n||0).toLocaleString('ar-EG');}
  function fdate(iso){var d=new Date(iso);return d.toLocaleDateString('ar-EG',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});}
  function fday(iso){return new Date(iso).toLocaleDateString('ar-EG',{day:'numeric',month:'short'});}
  function badge(s){return '<span class="st st-'+s+'">'+SL[s]+'</span>';}
  function stars(n){var s='';for(var i=1;i<=5;i++)s+=i<=n?'★':'☆';return '<span class="stars" aria-label="'+n+' من 5">'+s+'</span>';}
  function toast(t){var el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on');},2400);}
  function waLink(phone,msg){return 'https://wa.me/'+phone.replace(/^0/,'20')+'?text='+encodeURIComponent(msg);}
  function fbLink(o,t){return location.origin+'/feedback?o='+encodeURIComponent(o.id)+'&t='+t+'&k='+encodeURIComponent(o.fbToken||'');}
  function fill(tpl,o,t){return tpl.replace(/\{name\}/g,o.name.split(' ')[0]).replace(/\{order\}/g,o.id).replace(/\{link\}/g,fbLink(o,t));}
  function itemsText(o){return o.items.map(function(it){var p=db.products.find(function(x){return x.id===it.pid;});return (p?p.name:'منتج')+' × '+it.qty;}).join('، ');}
  function valid(o){return o.status!=='returned'&&o.status!=='cancelled';}
  function daysSince(iso){return Math.floor((Date.now()-new Date(iso))/864e5);}

  /* login */
  function showLogin(){$('#app').style.display='none';$('#login').style.display='flex';}
  function enter(){$('#login').style.display='none';$('#app').style.display='flex';return loadState();}
  $('#loginForm').addEventListener('submit',function(e){e.preventDefault();$('#lErr').style.display='none';
    api('POST','/api/login',{username:$('#lUser').value.trim(),password:$('#lPass').value}).then(function(){$('#lPass').value='';enter();})
      .catch(function(err){$('#lErr').textContent=err.message;$('#lErr').style.display='block';});});
  $('#logout').onclick=function(){api('POST','/api/logout').then(function(){location.reload();}).catch(function(){location.reload();});};
  setInterval(function(){if($('#app').style.display!=='none')loadState();},60000);

  /* nav */
  function go(v){$$('.nav-btn').forEach(function(b){b.classList.toggle('on',b.dataset.view===v);});$$('.view').forEach(function(s){s.classList.toggle('on',s.id==='v-'+v);});window.scrollTo(0,0);try{history.replaceState(null,'','#'+v);}catch(e){}}
  $$('.nav-btn').forEach(function(b){b.onclick=function(){go(b.dataset.view);};});
  document.addEventListener('click',function(e){var g=e.target.closest('[data-go]');if(g)go(g.dataset.go);});

  /* follow-up engine */
  function dueList(){
    var s=db.settings, out=[];
    db.orders.forEach(function(o){
      if(o.status!=='delivered'||!o.deliveredAt)return;
      var age=daysSince(o.deliveredAt);
      [['d3',s.d3],['d7',s.d7],['d21',s.d21],['refill',s.refill]].forEach(function(p){
        var day=Number(p[1]); if(!day)return;
        if(age>=day&&!db.sent[o.id+':'+p[0]]){
          var answered=db.feedback.some(function(f){return f.orderId===o.id&&f.type===p[0];});
          if(!answered)out.push({o:o,type:p[0],late:age-day,dueDay:day});
        }
      });
    });
    db.feedback.forEach(function(f){
      var low=(f.csat!=null&&f.csat<=2)||(f.result!=null&&f.result<=2);
      if(low&&!f.handled){var o=db.orders.find(function(x){return x.id===f.orderId;});if(o)out.unshift({o:o,type:'recover',late:daysSince(f.at),fb:f});}
    });
    return out;
  }
  var fuFilter='';
  function renderFollowups(){
    var all=dueList(); $('#fuCount').textContent=all.length||'';
    var counts={};all.forEach(function(x){counts[x.type]=(counts[x.type]||0)+1;});
    $('#fuChips').innerHTML='<button type="button" class="chip'+(fuFilter===''?' on':'')+'" data-f="">الكل ('+all.length+')</button>'+Object.keys(TP).map(function(k){return '<button type="button" class="chip'+(fuFilter===k?' on':'')+'" data-f="'+k+'">'+TP[k]+' ('+(counts[k]||0)+')</button>';}).join('');
    $$('#fuChips .chip').forEach(function(c){c.onclick=function(){fuFilter=c.dataset.f;renderFollowups();};});
    var list=all.filter(function(x){return !fuFilter||x.type===fuFilter;});
    var noRefill=!Number(db.settings.refill);
    $('#fuList').innerHTML=(noRefill?'<p class="sub" style="margin-bottom:8px">تذكير إعادة الطلب مقفول. فعّله من <button type="button" data-go="settings" style="background:none;border:0;color:var(--red);text-decoration:underline;cursor:pointer;padding:0">إعدادات المتابعة</button>.</p>':'')+
      (list.length?list.map(function(x,i){
        var key={d3:'msgD3',d7:'msgD7',d21:'msgD21',refill:'msgRefill',recover:'msgRecover'}[x.type];
        var msg=fill(db.settings[key],x.o,x.type);
        var extra=x.fb?'<div class="sub">قال: "'+esc(x.fb.comment||'من غير تعليق')+'"'+(x.fb.reasons&&x.fb.reasons.length?' · '+x.fb.reasons.join('، '):'')+'</div>':'';
        return '<div class="fu"><div class="who"><b>'+esc(x.o.name)+'</b> <span class="sub" style="margin:0">· '+x.o.id+' · '+esc(x.o.gov)+'</span><div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tp tp-'+x.type+'">'+TP[x.type]+'</span>'+(x.type==='recover'?'<span class="late">من '+x.late+' يوم</span>':(x.late>0?'<span class="late">متأخرة '+x.late+' يوم</span>':'<span class="sub" style="margin:0">مستحقة النهارده</span>'))+'</div>'+extra+'</div>'+
          '<a class="btn wa sm" target="_blank" rel="noopener" data-send="'+i+'" href="'+waLink(x.o.phone,msg)+'">ابعت على واتساب</a>'+
          (x.type==='recover'?'<button type="button" class="btn ghost sm" data-handle="'+x.fb.id+'">اتواصلنا واتحلت</button>':'<button type="button" class="btn ghost sm" data-skip="'+i+'">تخطّي</button>')+'</div>';
      }).join(''):'<p class="empty">مفيش متابعات مستحقة دلوقتي.</p>');
    function mark(x,skipped){return api('POST','/api/admin/sent',{key:x.o.id+':'+x.type,skipped:!!skipped}).then(loadState).catch(fail);}
    $$('#fuList [data-send]').forEach(function(a){a.addEventListener('click',function(){var x=list[Number(a.dataset.send)];if(x.type!=='recover'){mark(x,false);}});});
    $$('#fuList [data-skip]').forEach(function(b){b.onclick=function(){mark(list[Number(b.dataset.skip)],true).then(function(){toast('اتخطّت');});};});
    $$('#fuList [data-handle]').forEach(function(b){b.onclick=function(){var f=db.feedback.find(function(y){return y.id===b.dataset.handle;});api('PATCH','/api/admin/feedback/'+f.id,{handled:true}).then(function(){var o=db.orders.find(function(y){return y.id===f.orderId;});return o?api('PATCH','/api/admin/orders/'+o.id,{historyNote:'اتقفل التقييم الوحش بعد التواصل'}):null;}).then(loadState).then(function(){toast('اتسجل إنها اتحلت');}).catch(fail);};});
    var sentList=Object.keys(db.sent).map(function(k){var p=k.split(':');return {id:p[0],type:p[1],at:db.sent[k]};}).sort(function(a,b){return new Date(b.at)-new Date(a.at);}).slice(0,8);
    $('#fuSent').innerHTML=sentList.length?sentList.map(function(s){var o=db.orders.find(function(x){return x.id===s.id;});var replied=db.feedback.some(function(f){return f.orderId===s.id&&f.type===s.type;});return '<div class="list-row"><span><b>'+esc(o?o.name:s.id)+'</b> <span class="tp tp-'+s.type+'">'+TP[s.type]+'</span></span><span class="sub" style="margin:0">'+fday(s.at)+(s.type==='d7'||s.type==='d21'?(replied?' · ردّ':' · لسه مردّش'):'')+'</span></div>';}).join(''):'<p class="sub">لسه مفيش.</p>';
  }

  /* satisfaction */
  function metrics(){
    var d7=db.feedback.filter(function(f){return f.csat!=null;}), d21=db.feedback.filter(function(f){return f.nps!=null;});
    var csat=d7.length?Math.round(d7.filter(function(f){return f.csat>=4;}).length/d7.length*100):null;
    var pro=d21.filter(function(f){return f.nps>=9;}).length, det=d21.filter(function(f){return f.nps<=6;}).length, pas=d21.length-pro-det;
    var nps=d21.length?Math.round((pro-det)/d21.length*100):null;
    var asked=Object.keys(db.sent).filter(function(k){return /:(d7|d21)$/.test(k);}).length;
    var resp=asked?Math.round(db.feedback.filter(function(f){return f.type==='d7'||f.type==='d21';}).length/asked*100):null;
    var m={};db.orders.forEach(function(o){m[o.phone]=(m[o.phone]||0)+1;});var ph=Object.keys(m);
    var rep=ph.length?Math.round(ph.filter(function(p){return m[p]>1;}).length/ph.length*100):null;
    return {csat:csat,nps:nps,resp:resp,rep:rep,pro:pro,det:det,pas:pas,n21:d21.length,n7:d7.length};
  }
  var fbFilter='';
  function renderSatisfaction(){
    var mt=metrics();
    $('#sCsat').textContent=mt.csat==null?'—':mt.csat+'%';
    $('#sNps').textContent=mt.nps==null?'—':(mt.nps>0?'+':'')+mt.nps;
    $('#sResp').textContent=mt.resp==null?'—':Math.min(100,mt.resp)+'%';
    $('#sRepeat').textContent=mt.rep==null?'—':mt.rep+'%';
    var t=mt.n21||1;
    $('#npsDist').innerHTML='<span style="width:'+(mt.pro/t*100)+'%;background:#1E7A4C"></span><span style="width:'+(mt.pas/t*100)+'%;background:#C9C9D1"></span><span style="width:'+(mt.det/t*100)+'%;background:#C8102E"></span>';
    $('#npsNote').textContent=mt.n21?('من '+mt.n21+' ردود: '+mt.pro+' مروّج، '+mt.pas+' محايد، '+mt.det+' منتقد. العينة صغيرة، فالرقم هيتغير كتير لحد ما الردود تزيد.'):'لسه مفيش ردود على سؤال يوم 21.';
    var low=db.feedback.filter(function(f){return (f.csat!=null&&f.csat<=2)||(f.result!=null&&f.result<=2);}).sort(function(a,b){return new Date(b.at)-new Date(a.at);});
    var open=low.filter(function(f){return !f.handled;}); $('#alertCount').textContent=open.length||'';
    $('#alerts').innerHTML=low.length?low.map(function(f){var o=db.orders.find(function(x){return x.id===f.orderId;});var hrs=Math.floor((Date.now()-new Date(f.at))/36e5);return '<div class="list-row" style="flex-wrap:wrap"><span style="flex:1 1 260px"><b>'+esc(f.name)+'</b> · '+f.orderId+' · '+(f.csat!=null?stars(f.csat):'النتيجة '+stars(f.result))+'<br><span class="sub" style="margin:0">"'+esc(f.comment||'من غير تعليق')+'"'+(f.reasons.length?' · '+f.reasons.join('، '):'')+'</span></span>'+(f.handled?'<span class="st st-delivered">اتحلت</span>':'<span class="late">'+(hrs<24?'من '+hrs+' ساعة':'متأخر: من '+Math.floor(hrs/24)+' يوم')+'</span> <a class="btn wa sm" target="_blank" rel="noopener" href="'+waLink(f.phone,fill(db.settings.msgRecover,o||{name:f.name,id:f.orderId},'d7'))+'">كلّمه</a> <button type="button" class="btn ghost sm" data-handle2="'+f.id+'">اتحلت</button>')+'</div>';}).join(''):'<p class="sub">مفيش تقييمات وحشة. ممتاز.</p>';
    $$('#alerts [data-handle2]').forEach(function(b){b.onclick=function(){api('PATCH','/api/admin/feedback/'+b.dataset.handle2,{handled:true}).then(loadState).then(function(){toast('اتسجل إنها اتحلت');}).catch(fail);};});
    var rc={};db.feedback.forEach(function(f){var lowish=(f.csat!=null&&f.csat<=3)||(f.result!=null&&f.result<=3)||(f.nps!=null&&f.nps<=6);if(lowish)(f.reasons||[]).forEach(function(r){rc[r]=(rc[r]||0)+1;});});
    var rk=Object.keys(rc).sort(function(a,b){return rc[b]-rc[a];}),rm=rc[rk[0]]||1;
    $('#reasons').innerHTML=rk.length?rk.map(function(k){return '<div class="tagbar"><span class="l">'+k+'</span><span class="b" style="width:'+(rc[k]/rm*60)+'%"></span><b>'+rc[k]+'</b></div>';}).join(''):'<p class="sub">لسه مفيش أسباب متسجلة.</p>';
    var fl=[['','الكل'],['d7','أول انطباع'],['d21','النتيجة'],['consent','موافق على النشر']];
    $('#fbChips').innerHTML=fl.map(function(x){return '<button type="button" class="chip'+(fbFilter===x[0]?' on':'')+'" data-fb="'+x[0]+'">'+x[1]+'</button>';}).join('');
    $$('#fbChips .chip').forEach(function(c){c.onclick=function(){fbFilter=c.dataset.fb;renderSatisfaction();};});
    var rows=db.feedback.filter(function(f){return !fbFilter||(fbFilter==='consent'?f.consent:f.type===fbFilter);}).sort(function(a,b){return new Date(b.at)-new Date(a.at);});
    $('#fbBody').innerHTML=rows.length?rows.map(function(f){return '<tr><td style="white-space:nowrap">'+fday(f.at)+'</td><td><b>'+esc(f.name)+'</b><br><span class="sub" style="margin:0">'+f.orderId+'</span></td><td><span class="tp tp-'+f.type+'">'+TP[f.type]+'</span></td><td>'+(f.csat!=null?stars(f.csat):(f.result!=null?'النتيجة '+stars(f.result):'—'))+'</td><td>'+(f.nps!=null?'<b>'+f.nps+'</b>/10':'—')+'</td><td style="min-width:220px">'+esc(f.comment||'—')+'</td><td>'+(f.consent&&f.comment?'<label style="display:flex;gap:6px;align-items:center;cursor:pointer;white-space:nowrap"><input type="checkbox" data-pub="'+f.id+'"'+(f.published?' checked':'')+'> انشره</label>':'<span class="sub" style="margin:0">مفيش موافقة</span>')+'</td></tr>';}).join(''):'<tr><td colspan="7" class="empty">مفيش فيدباك بالفلتر ده</td></tr>';
    $$('#fbBody [data-pub]').forEach(function(c){c.onchange=function(){api('PATCH','/api/admin/feedback/'+c.dataset.pub,{published:c.checked}).then(loadState).then(function(){toast(c.checked?'اتنشر كريفيو على الموقع':'اتشال من الريفيوز');}).catch(function(e){c.checked=!c.checked;fail(e);});};});
  }

  /* overview */
  function renderOverview(){
    var recent=db.orders.filter(function(o){return (Date.now()-new Date(o.created))<30*864e5;});
    var good=recent.filter(valid),sales=good.reduce(function(a,o){return a+o.total;},0);
    $('#kSales').textContent=money(sales);$('#kOrders').textContent=money(recent.length);
    $('#kAov').textContent=good.length?money(Math.round(sales/good.length)):'—';
    var mt=metrics();$('#kCsat').textContent=mt.csat==null?'—':mt.csat+'%';
    var nw=db.orders.filter(function(o){return o.status==='new';}).length;$('#newCount').textContent=nw||'';
    var days=[],max=1;
    for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var key=d.toDateString();var v=db.orders.filter(function(o){return valid(o)&&new Date(o.created).toDateString()===key;}).reduce(function(a,o){return a+o.total;},0);days.push({l:d.toLocaleDateString('ar-EG',{weekday:'short'}),v:v});if(v>max)max=v;}
    $('#bars').innerHTML=days.map(function(d){return '<div class="bar"><em>'+(d.v?money(d.v):'')+'</em><span class="v" style="height:'+(d.v/max*150)+'px"></span><small>'+d.l+'</small></div>';}).join('');
    var att=[];
    if(nw)att.push([nw+' أوردر جديد محتاج تأكيد','orders']);
    var fu=dueList();if(fu.length)att.push([fu.length+' متابعة عميل مستحقة','followups']);
    var lowOpen=db.feedback.filter(function(f){return !f.handled&&((f.csat!=null&&f.csat<=2)||(f.result!=null&&f.result<=2));}).length;if(lowOpen)att.push([lowOpen+' تقييم وحش محتاج اتصال','satisfaction']);
    db.orders.forEach(function(o){if(o.status==='shipped'&&daysSince(o.created)>3)att.push(['أوردر '+o.id+' متشحن من '+daysSince(o.created)+' أيام','orders']);});
    db.products.forEach(function(p){if(p.active&&p.stock<20)att.push(['مخزون '+p.name+' قليل','products']);});
    $('#attention').innerHTML=att.length?att.map(function(a){return '<div class="list-row"><span>'+esc(a[0])+'</span><button type="button" class="btn ghost sm" data-go="'+a[1]+'">افتح</button></div>';}).join(''):'<p class="sub">مفيش حاجة متأخرة.</p>';
    var rows=db.orders.slice().sort(function(a,b){return new Date(b.created)-new Date(a.created);}).slice(0,5);
    $('#recentBody').innerHTML=rows.map(function(o){return '<tr class="click" data-id="'+o.id+'"><td><b>'+o.id+'</b></td><td>'+esc(o.name)+'</td><td>'+esc(o.gov)+'</td><td>'+money(o.total)+' ج</td><td class="pay">'+o.pay+'</td><td>'+badge(o.status)+'</td></tr>';}).join('');
    $$('#recentBody tr').forEach(function(tr){tr.onclick=function(){openOrder(tr.dataset.id);};});
  }

  /* orders */
  var fStatus='';
  function renderChips(){
    var c={};db.orders.forEach(function(o){c[o.status]=(c[o.status]||0)+1;});
    $('#statusChips').innerHTML='<button type="button" class="chip'+(fStatus===''?' on':'')+'" data-s="">الكل ('+db.orders.length+')</button>'+STATUSES.map(function(s){return '<button type="button" class="chip'+(fStatus===s[0]?' on':'')+'" data-s="'+s[0]+'">'+s[1]+' ('+(c[s[0]]||0)+')</button>';}).join('');
    $$('#statusChips .chip').forEach(function(ch){ch.onclick=function(){fStatus=ch.dataset.s;renderOrders();};});
  }
  function filtered(){var q=$('#search').value.trim(),pay=$('#payFilter').value;return db.orders.filter(function(o){return (!fStatus||o.status===fStatus)&&(!pay||o.pay===pay)&&(!q||(o.name+o.phone+o.id).indexOf(q)>-1);}).sort(function(a,b){return new Date(b.created)-new Date(a.created);});}
  function renderOrders(){
    renderChips();var rows=filtered();
    $('#ordersBody').innerHTML=rows.length?rows.map(function(o){return '<tr class="click" data-id="'+o.id+'"><td><b>'+o.id+'</b></td><td style="white-space:nowrap">'+fdate(o.created)+'</td><td>'+esc(o.name)+'</td><td dir="ltr" style="text-align:right">'+o.phone+'</td><td>'+esc(o.gov)+'</td><td>'+o.items.reduce(function(a,i){return a+i.qty;},0)+'</td><td>'+money(o.total)+' ج</td><td class="pay">'+o.pay+'</td><td>'+badge(o.status)+'</td></tr>';}).join(''):'<tr><td colspan="9" class="empty">مفيش أوردرات بالفلتر ده</td></tr>';
    $$('#ordersBody tr[data-id]').forEach(function(tr){tr.onclick=function(){openOrder(tr.dataset.id);};});
  }
  $('#search').oninput=renderOrders;$('#payFilter').onchange=renderOrders;
  $('#exportCsv').onclick=function(){
    var rows=[['رقم الأوردر','التاريخ','العميل','الموبايل','المحافظة','العنوان','المنتجات','الإجمالي','الدفع','الحالة']].concat(filtered().map(function(o){return [o.id,new Date(o.created).toLocaleString('ar-EG'),o.name,o.phone,o.gov,o.address,itemsText(o),o.total,o.pay,SL[o.status]];}));
    // A cell starting with = + - @ (or tab/CR) is run as a formula by Excel. A customer could type
    // =HYPERLINK(...) as their name, so put a ' in front: Excel then shows it as plain text.
    var cell=function(c){var s=String(c==null?'':c);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    var csv='﻿'+rows.map(function(r){return r.map(cell).join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='enzo-orders.csv';a.click();
  };

  /* drawer */
  function openOrder(id){
    var o=db.orders.find(function(x){return x.id===id;});if(!o)return;
    var fbs=db.feedback.filter(function(f){return f.orderId===o.id;});
    var msg='أهلًا '+o.name.split(' ')[0]+'، معاك فريق ENZO بخصوص أوردرك رقم '+o.id+' ('+SL[o.status]+').';
    $('#dTitle').textContent='أوردر '+o.id;
    $('#dBody').innerHTML=
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+badge(o.status)+'<span class="sub" style="margin:0">'+fdate(o.created)+'</span></div>'+
      '<label class="f">غيّر الحالة<select class="select" id="dStatus">'+STATUSES.map(function(s){return '<option value="'+s[0]+'"'+(s[0]===o.status?' selected':'')+'>'+s[1]+'</option>';}).join('')+'</select></label>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn wa" target="_blank" rel="noopener" href="'+waLink(o.phone,msg)+'">كلّم العميل على واتساب</a><a class="btn ghost" href="tel:'+o.phone+'">اتصال</a></div>'+
      '<div><h3 style="font-size:14px;margin-bottom:10px">العميل</h3><dl class="kv"><dt>الاسم</dt><dd>'+esc(o.name)+'</dd><dt>الموبايل</dt><dd dir="ltr" style="text-align:right">'+o.phone+'</dd><dt>المحافظة</dt><dd>'+esc(o.gov)+'</dd><dt>العنوان</dt><dd>'+esc(o.address)+'</dd>'+(o.notes?'<dt>ملاحظة العميل</dt><dd>'+esc(o.notes)+'</dd>':'')+'</dl></div>'+
      '<div><h3 style="font-size:14px;margin-bottom:10px">الأوردر</h3><dl class="kv"><dt>المنتجات</dt><dd>'+esc(itemsText(o))+'</dd><dt>قيمة المنتجات</dt><dd>'+money(o.subtotal)+' ج</dd><dt>الشحن</dt><dd>'+(o.shipping?money(o.shipping)+' ج':'مجاني')+'</dd><dt>الإجمالي</dt><dd><b>'+money(o.total)+' ج</b></dd><dt>الدفع</dt><dd>'+o.pay+'</dd></dl></div>'+
      (fbs.length?'<div><h3 style="font-size:14px;margin-bottom:10px">فيدباك العميل</h3>'+fbs.map(function(f){return '<div class="list-row"><span><span class="tp tp-'+f.type+'">'+TP[f.type]+'</span> '+(f.csat!=null?stars(f.csat):'')+(f.nps!=null?' NPS '+f.nps:'')+'<br><span class="sub" style="margin:0">'+esc(f.comment||'—')+'</span></span></div>';}).join('')+'</div>':'')+
      '<label class="f">ملاحظات التيم<textarea id="dNotes" rows="3" placeholder="مثلًا: العميلة طلبت التوصيل بعد 5">'+esc(o.teamNotes||'')+'</textarea></label>'+
      '<button class="btn" type="button" id="dSave">حفظ</button>'+
      '<div><h3 style="font-size:14px;margin-bottom:10px">سجل الأوردر</h3><div class="timeline">'+o.history.slice().reverse().map(function(h){return '<div><i></i><span>'+esc(h.text)+'</span><span class="sub" style="margin:0">'+fdate(h.at)+'</span></div>';}).join('')+'</div></div>';
    $('#dSave').onclick=function(){var ns=$('#dStatus').value;
      api('PATCH','/api/admin/orders/'+o.id,{status:ns,teamNotes:$('#dNotes').value}).then(loadState).then(function(){openOrder(o.id);toast(ns==='delivered'?'اتحفظ واتجدولت المتابعات':'اتحفظ');}).catch(fail);
    };
    $('#scrim').classList.add('on');$('#drawer').classList.add('on');
  }
  function closeD(){$('#scrim').classList.remove('on');$('#drawer').classList.remove('on');}
  $('#dClose').onclick=closeD;$('#scrim').onclick=closeD;
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeD();});

  /* products */
  function renderProducts(){
    $('#productList').innerHTML=db.products.map(function(p){
      var sold=db.orders.filter(valid).reduce(function(a,o){return a+o.items.filter(function(i){return i.pid===p.id;}).reduce(function(x,i){return x+i.qty;},0);},0);
      return '<div class="card prod" data-id="'+p.id+'"><img src="'+p.img+'" alt=""><div class="meta"><h3>'+esc(p.name)+'</h3><p class="sub">'+p.size+' · اتباع منه '+money(sold)+' قطعة '+(p.active&&p.stock<20?'<span class="low">· المخزون قليل</span>':'')+'</p></div>'+
      '<div class="edit"><label class="f">السعر (جنيه)<input class="input" type="number" min="0" data-k="price" value="'+p.price+'"></label><label class="f">المخزون<input class="input" type="number" min="0" data-k="stock" value="'+p.stock+'"></label><label class="f">الحالة<select class="select" data-k="active"><option value="1"'+(p.active?' selected':'')+'>ظاهر في الموقع</option><option value="0"'+(!p.active?' selected':'')+'>مخفي</option></select></label><button class="btn sm" type="button" data-save>حفظ</button></div></div>';
    }).join('');
    $$('#productList .prod').forEach(function(card){card.querySelector('[data-save]').onclick=function(){var p=db.products.find(function(x){return x.id===card.dataset.id;});api('PUT','/api/admin/products/'+p.id,{name:p.name,size:p.size,price:Number(card.querySelector('[data-k=price]').value)||0,stock:Number(card.querySelector('[data-k=stock]').value)||0,active:card.querySelector('[data-k=active]').value==='1'}).then(loadState).then(function(){toast('المنتج اتحدّث، وظاهر على الموقع');}).catch(fail);};});
  }

  /* customers */
  function renderCustomers(){
    var m={};db.orders.forEach(function(o){var c=m[o.phone]||(m[o.phone]={name:o.name,phone:o.phone,gov:o.gov,count:0,spent:0});c.count++;if(valid(o))c.spent+=o.total;});
    var q=$('#custSearch').value.trim();
    var list=Object.keys(m).map(function(k){return m[k];}).filter(function(c){return !q||(c.name+c.phone).indexOf(q)>-1;}).sort(function(a,b){return b.spent-a.spent;});
    $('#custBody').innerHTML=list.map(function(c){
      var last=db.feedback.filter(function(f){return f.phone===c.phone;}).sort(function(a,b){return new Date(b.at)-new Date(a.at);})[0];
      var lt=last?(last.csat!=null?stars(last.csat):(last.nps!=null?'NPS '+last.nps:'—')):'<span class="sub" style="margin:0">لسه</span>';
      return '<tr><td><b>'+esc(c.name)+'</b>'+(c.count>1?' <span class="st st-delivered">متكرر</span>':'')+'</td><td dir="ltr" style="text-align:right">'+c.phone+'</td><td>'+esc(c.gov)+'</td><td>'+c.count+'</td><td>'+money(c.spent)+' ج</td><td>'+lt+'</td><td><a class="btn wa sm" target="_blank" rel="noopener" href="'+waLink(c.phone,'أهلًا '+c.name.split(' ')[0]+'، معاك فريق ENZO.')+'">واتساب</a></td></tr>';
    }).join('');
  }
  $('#custSearch').oninput=renderCustomers;

  /* content + settings */
  function renderContent(){var c=db.content;$('#ann1').value=c.ann[0];$('#ann2').value=c.ann[1];$('#ann3').value=c.ann[2];$('#heroTitle').value=c.heroTitle;$('#heroBody').value=c.heroBody;$('#heroCta').value=c.heroCta;$('#freeShip').value=c.freeShip;$('#shipFee').value=c.shipFee||0;$('#waNum').value=c.whatsapp?('0'+String(c.whatsapp).replace(/^20/,'')):'';}
  $('#saveContent').onclick=function(){var w=$('#waNum').value.replace(/\D/g,'');api('PUT','/api/admin/content',{ann:[$('#ann1').value,$('#ann2').value,$('#ann3').value],heroTitle:$('#heroTitle').value,heroBody:$('#heroBody').value,heroCta:$('#heroCta').value,freeShip:Number($('#freeShip').value)||0,shipFee:Number($('#shipFee').value)||0,whatsapp:w?w.replace(/^0/,'20'):''}).then(loadState).then(function(){toast('اتحفظ وظاهر على الموقع');}).catch(fail);};
  var SKEYS=['d3','d7','d21','refill','msgD3','msgD7','msgD21','msgRefill','msgRecover'];
  function idFor(k){return '#set'+k.charAt(0).toUpperCase()+k.slice(1);}
  function renderSettings(){SKEYS.forEach(function(k){var el=k.indexOf('msg')===0?$('#'+k):$(idFor(k));if(el)el.value=db.settings[k];});}
  $('#saveSettings').onclick=function(){SKEYS.forEach(function(k){var el=k.indexOf('msg')===0?$('#'+k):$(idFor(k));if(el)db.settings[k]=k.indexOf('msg')===0?el.value:(el.value===''?'':Number(el.value));});api('PUT','/api/admin/settings',db.settings).then(loadState).then(function(){toast('الإعدادات اتحفظت');}).catch(fail);};

  function renderAll(){renderOverview();renderOrders();renderProducts();renderCustomers();renderFollowups();renderSatisfaction();renderContent();renderSettings();}
  api('GET','/api/me').then(function(){return enter();}).then(function(){var h=(location.hash||'').slice(1);if(h&&document.getElementById('v-'+h))go(h);}).catch(function(){showLogin();});
})();
