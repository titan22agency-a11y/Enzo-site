
(function(){
  var params=new URLSearchParams(location.search);
  var orderId=(params.get('o')||'').slice(0,20).replace(/[^A-Za-z0-9-]/g,'');
  var type=params.get('t')==='d21'?'d21':'d7';
  var key=(params.get('k')||'').slice(0,40); // signed token from the link, checked by the server
  var REASONS=['التوصيل','التغليف','النتيجة','سهولة الاستخدام','الريحة أو القوام','السعر','خدمة العملاء'];
  var state={csat:null,result:null,nps:null,reasons:[]};
  function $(s){return document.querySelector(s);}
  function show(el,on){el.classList.toggle('hidden',!on);}

  if(type==='d21'){
    $('#title').textContent='3 أسابيع مع سيرم ENZO. إيه النتيجة؟';
    show($('#qCsat'),false);show($('#qResult'),true);show($('#qNps'),true);show($('#consentWrap'),true);
  }
  $('#foot').textContent=orderId?('أوردر رقم '+orderId):'';

  function starRow(el,key){
    for(var i=1;i<=5;i++)(function(v){
      var b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.setAttribute('aria-label',v+' من 5');b.textContent='★';
      b.onclick=function(){state[key]=v;Array.prototype.forEach.call(el.children,function(c,k){c.classList.toggle('on',k<v);c.setAttribute('aria-checked',k===v-1?'true':'false');});update();};
      el.appendChild(b);
    })(i);
  }
  starRow($('#csatStars'),'csat');starRow($('#resultStars'),'result');
  for(var n=0;n<=10;n++)(function(v){
    var b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.textContent=v;
    b.onclick=function(){state.nps=v;Array.prototype.forEach.call($('#npsRow').children,function(c,k){c.classList.toggle('on',k===v);c.setAttribute('aria-checked',k===v?'true':'false');});update();};
    $('#npsRow').appendChild(b);
  })(n);
  REASONS.forEach(function(r){
    var b=document.createElement('button');b.type='button';b.className='chip';b.textContent=r;b.setAttribute('aria-pressed','false');
    b.onclick=function(){var i=state.reasons.indexOf(r);if(i>-1)state.reasons.splice(i,1);else state.reasons.push(r);b.classList.toggle('on',i===-1);b.setAttribute('aria-pressed',i===-1?'true':'false');};
    $('#reasonChips').appendChild(b);
  });
  function low(){return type==='d7'?(state.csat!=null&&state.csat<=3):((state.result!=null&&state.result<=3)||(state.nps!=null&&state.nps<=6));}
  function update(){show($('#qReasons'),low());show($('#err'),false);}

  $('#form').addEventListener('submit',function(e){
    e.preventDefault();
    var ok=type==='d7'?state.csat!=null:(state.result!=null&&state.nps!=null);
    if(!ok){$('#err').textContent=type==='d7'?'اختاري التقييم الأول عشان نقدر نسجّل رأيك.':'جاوبي على السؤالين الأولانيين عشان نقدر نسجّل رأيك.';show($('#err'),true);return;}
    var entry={orderId:orderId,k:key,type:type,csat:type==='d7'?state.csat:null,result:type==='d21'?state.result:null,nps:type==='d21'?state.nps:null,reasons:low()?state.reasons.slice():[],comment:$('#comment').value.trim().slice(0,600),consent:type==='d21'&&$('#consent').checked,at:new Date().toISOString()};
    var btn=$('#submit');btn.disabled=true;
    var done=function(){$('#doneMsg').textContent=low()?'آسفين إن التجربة مكانتش زي ما تستاهلي. فريقنا هيتواصل معاكي قريب عشان نفهم حصل إيه.':'ردّك وصل لفريقنا وبيساعدنا نطوّر كل حاجة بنعملها.';show($('#form'),false);show($('#done'),true);window.scrollTo(0,0);};
    if(orderId==='PREVIEW'){done();return;}
    fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'حصل خطأ');});})
      .then(done).catch(function(x){btn.disabled=false;$('#err').textContent=x.message;show($('#err'),true);});
  });
})();
