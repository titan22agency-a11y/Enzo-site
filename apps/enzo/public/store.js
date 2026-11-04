
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Announcement */
  var ann = window.__ann = ['Free shipping on orders over [EGP AMOUNT]','Pay by card, wallet or cash on delivery','New: 4D Hyaluronic Acid 5% Skin Serum'];
  var ai = 0, annEl = document.getElementById('annText');
  function showAnn(i){ ai = (i + ann.length) % ann.length; var s = document.createElement('span'); s.id='annText'; s.setAttribute('aria-live','polite'); s.textContent = ann[ai]; annEl.replaceWith(s); annEl = s; }
  document.getElementById('annPrev').onclick = function(){ showAnn(ai-1); };
  document.getElementById('annNext').onclick = function(){ showAnn(ai+1); };
  if(!reduce) setInterval(function(){ showAnn(ai+1); }, 4000);

  /* Hero */
  var slides = document.querySelectorAll('.slide'), dots = document.querySelectorAll('.dot'), si = 0, timer;
  function go(i){ si = (i + slides.length) % slides.length; slides.forEach(function(s,k){ s.classList.toggle('on', k===si); }); dots.forEach(function(d,k){ d.classList.toggle('on', k===si); }); }
  function auto(){ clearInterval(timer); if(!reduce) timer = setInterval(function(){ go(si+1); }, 6500); }
  document.getElementById('heroPrev').onclick = function(){ go(si-1); auto(); };
  document.getElementById('heroNext').onclick = function(){ go(si+1); auto(); };
  dots.forEach(function(d,k){ d.onclick = function(){ go(k); auto(); }; });
  auto();

  /* Marquee */
  var words = ['Hyaluronic Acid 5%','Niacinamide','Ceramides','Centella Asiatica','Green Tea Extract','Vitamin C'];
  var html = ''; for(var r=0;r<4;r++) words.forEach(function(w){ html += '<span>'+w+' <i>●</i></span>'; });
  document.getElementById('marq').innerHTML = html;

  /* Ingredients */
  var ings = [
    ['Hyaluronic Acid (4D)','Hydration','Four forms of different sizes hold water in the skin, for a plumper, smoother look.'],
    ['Niacinamide','Tone & barrier','Helps even out skin tone and supports a stronger moisture barrier.'],
    ['Ceramides','Barrier support','Lipids your skin already makes. They help lock moisture in.'],
    ['Centella Asiatica','Soothing','A plant extract known for calming and comforting the skin.'],
    ['Green Tea Extract','Antioxidant','Rich in antioxidants that help defend skin against daily stressors.'],
    ['Vitamin C','Radiance','An antioxidant that helps skin look brighter and more even.'],
    ['Peptides','Smoothness','Palmitoyl and acetyl peptides that help the look of fine lines.']
  ];
  var track = document.getElementById('track');
  track.innerHTML = ings.map(function(x,i){ return '<div class="ing"><span class="n">0'+(i+1)+'</span><h3>'+x[0]+'</h3><p class="role">'+x[1]+'</p><p class="t">'+x[2]+'</p></div>'; }).join('');
  document.getElementById('ingPrev').onclick = function(){ track.scrollBy({left:-320,behavior:'smooth'}); };
  document.getElementById('ingNext').onclick = function(){ track.scrollBy({left:320,behavior:'smooth'}); };

  /* FAQ */
  var faqs = [
    ['Who is the 4D Skin Serum for?','Anyone looking for deep hydration, smoother texture and a more radiant look. [Formulator to confirm skin-type guidance.]'],
    ['How do I use it?','Apply a few drops to clean, dry skin and massage gently until absorbed. Use morning and evening, before your moisturizer.'],
    ['Are there any cautions?','For external use only. Keep out of reach of children. Avoid contact with eyes. Stop using it if irritation occurs. Store below 30°C.'],
    ['How much is shipping and how long does it take?','[Shipping fees and delivery times by governorate.]'],
    ['What if the product does not suit me?','[Return and exchange policy.]']
  ];
  var fl = document.getElementById('faqList');
  fl.innerHTML = faqs.map(function(f,i){ return '<div class="faq-item'+(i===0?' open':'')+'"><button type="button" class="faq-q" aria-expanded="'+(i===0)+'"><span>'+f[0]+'</span><span class="pl" aria-hidden="true">+</span></button><div class="faq-a"><p>'+f[1]+'</p></div></div>'; }).join('');
  fl.querySelectorAll('.faq-item').forEach(function(item){
    item.querySelector('.faq-q').onclick = function(){
      var open = item.classList.contains('open');
      fl.querySelectorAll('.faq-item').forEach(function(o){ o.classList.remove('open'); o.querySelector('.faq-q').setAttribute('aria-expanded','false'); });
      if(!open){ item.classList.add('open'); this.setAttribute('aria-expanded','true'); }
    };
  });

  /* Cart + wishlist */
  var count = 0, toast = document.getElementById('toast'), tt;

  document.querySelectorAll('.wish').forEach(function(w){ w.onclick = function(){ var on = !w.classList.contains('on'); w.classList.toggle('on', on); w.setAttribute('aria-pressed', on); }; });

  /* Scroll reveal */
  var rvs = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, {threshold:.12, rootMargin:'0px 0px -40px 0px'});
    rvs.forEach(function(el){ io.observe(el); });
  } else { rvs.forEach(function(el){ el.classList.add('in'); }); }

  /* Wordmark glides into the header on scroll */
  var wm = document.getElementById('wordmark'), space = document.getElementById('bigspace');
  var ratio = 1141/290, ANN = 40, HEAD = 72, PAD = 28, SMALL = 28, ticking = false;
  function layout(){
    ticking = false;
    var vw = window.innerWidth, y = window.scrollY || document.documentElement.scrollTop || 0;
    var bigW = Math.min(980, vw - 48), bigH = bigW / ratio, smallW = SMALL * ratio;
    var spacerH = Math.round(bigH + PAD*2);
    space.style.height = spacerH + 'px';
    var raw = Math.max(0, Math.min(1, y / spacerH));
    var p = reduce ? (raw >= 1 ? 1 : (raw > 0 ? 1 : 0)) : (raw < .5 ? 2*raw*raw : 1 - Math.pow(-2*raw+2,2)/2);
    var headerTop = Math.max(0, ANN - y);
    var startTop = ANN + HEAD + PAD - y;
    var endTop = headerTop + (HEAD - SMALL)/2;
    wm.style.top = (startTop + (endTop - startTop)*p).toFixed(1) + 'px';
    wm.style.width = (bigW + (smallW - bigW)*p).toFixed(1) + 'px';
  }
  function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(layout); } }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll);
  layout();
})();


(function(){
  var DATA={products:[],content:{},govs:[]}, cart=[], loaded=false;
  function $(id){return document.getElementById(id);}
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function egp(n){return 'EGP '+Number(n||0).toLocaleString('en-US');}
  function prod(id){return DATA.products.find(function(p){return p.id===id;});}
  function toast(t){var el=$('toast');$('toastText').textContent=t;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('show');},2600);}
  try{cart=JSON.parse(localStorage.getItem('enzo_cart')||'[]')||[];}catch(e){cart=[];}
  function saveCart(){try{localStorage.setItem('enzo_cart',JSON.stringify(cart));}catch(e){}var n=cart.reduce(function(a,l){return a+l.qty;},0);$('cartCount').textContent=n;$('cartBtn').setAttribute('aria-label','Cart, '+n+' items');}
  function apply(){
    var c=DATA.content||{};
    if(c.ann&&c.ann.length){var a=window.__ann;a.length=0;c.ann.filter(function(x){return x;}).forEach(function(x){a.push(x);});var cur=document.getElementById('annText');if(cur&&a[0])cur.textContent=a[0];}
    if(c.heroTitle)$('heroTitle').textContent=c.heroTitle;
    if(c.heroBody)$('heroBody').textContent=c.heroBody;
    if(c.heroCta)$('heroCta').textContent=c.heroCta;
    if(c.whatsapp){var wa='https://wa.me/'+c.whatsapp;$('waFloat').href=wa;$('notifyBtn').href=wa+'?text='+encodeURIComponent('عايزة أعرف أول ما سيرم الشعر ينزل');$('notifyBtn').target='_blank';}
    var p=prod('p1'), btn=$('p1Add');
    if(p&&p.active&&p.price>0){$('p1Price').textContent=egp(p.price);
      if(p.inStock){btn.disabled=false;btn.style.opacity='';btn.style.cursor='';btn.textContent='Add to cart';}else{btn.disabled=true;btn.textContent='Out of stock';}}
    var rv=DATA.reviews||[];
    if(rv.length){$('reviews').hidden=false;$('revRow').innerHTML=rv.slice(0,6).map(function(r){return '<div class="rev"><p style="font-size:15px;line-height:1.6;color:var(--body)">“'+esc(r.comment)+'”</p><p style="font-size:13px;color:var(--muted)">'+esc(r.name)+' · Verified purchase</p></div>';}).join('');}
    cart=cart.filter(function(l){var q=prod(l.pid);return q&&q.active&&q.price>0;});saveCart();
    if(!$('cartDrawer').hidden)render(); // the drawer may have been opened while we were loading
  }
  function load(){return fetch('/api/public').then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){DATA=d;loaded=true;apply();});}
  load().catch(function(){if(!$('cartDrawer').hidden)$('cartBody').innerHTML='<p class="cd-err">Could not load the shop. Check your connection and reload the page.</p>';});

  $('p1Add').addEventListener('click',function(){var l=cart.find(function(x){return x.pid==='p1';});if(l)l.qty=Math.min(10,l.qty+1);else cart.push({pid:'p1',qty:1});saveCart();toast('Added to your cart');});
  function totals(){var sub=cart.reduce(function(a,l){var p=prod(l.pid);return a+(p?p.price*l.qty:0);},0),c=DATA.content||{};var ship=sub===0?0:(c.freeShip>0&&sub>=c.freeShip?0:(Number(c.shipFee)||0));return {sub:sub,ship:ship,total:sub+ship};}
  function render(){
    var body=$('cartBody');
    // Until /api/public answers we don't know product names or prices; show a message instead of crashing.
    if(!loaded&&cart.length){body.innerHTML='<p style="color:var(--muted)">Loading your cart…</p>';return;}
    if(!cart.length){body.innerHTML='<p style="color:var(--muted)">Your cart is empty.</p><a class="btn" href="#shop" id="goShop">Shop the serum</a>';$('goShop').onclick=close;return;}
    var t=totals(),c=DATA.content||{};
    body.innerHTML=cart.map(function(l,i){var p=prod(l.pid);return '<div class="cd-line"><img src="box.jpg" alt=""><div style="flex:1;min-width:0"><p style="font-weight:600">'+esc(p.name)+'</p><p style="font-size:13px;color:var(--muted)">'+esc(p.size)+' · '+egp(p.price)+'</p></div><div class="qty"><button type="button" data-i="'+i+'" data-d="-1" aria-label="Less">−</button><span>'+l.qty+'</span><button type="button" data-i="'+i+'" data-d="1" aria-label="More">+</button></div></div>';}).join('')+
      '<div style="border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:8px"><div class="sumrow"><span>Subtotal</span><span>'+egp(t.sub)+'</span></div><div class="sumrow"><span>Shipping</span><span>'+(t.ship?egp(t.ship):'Free')+'</span></div>'+(c.freeShip>0&&t.sub<c.freeShip?'<p style="font-size:13px;color:var(--red)">Add '+egp(c.freeShip-t.sub)+' for free shipping</p>':'')+'<div class="sumrow" style="font-weight:600;font-size:17px"><span>Total</span><span>'+egp(t.total)+'</span></div></div>'+
      '<form id="coForm" style="display:flex;flex-direction:column;gap:12px" novalidate><h3 style="font-size:20px;font-weight:400">Delivery details</h3>'+
      '<div class="field"><label for="coName">Full name</label><input id="coName" autocomplete="name" required></div>'+
      '<div class="field"><label for="coPhone">Mobile number</label><input id="coPhone" type="tel" inputmode="numeric" placeholder="01X XXXX XXXX" autocomplete="tel" required></div>'+
      '<div class="field"><label for="coGov">Governorate</label><select id="coGov" required><option value="">Choose…</option>'+(DATA.govs||[]).map(function(g){return '<option>'+esc(g)+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label for="coAddr">Address</label><textarea id="coAddr" autocomplete="street-address" placeholder="Area, street, building, floor" required></textarea></div>'+
      '<div class="field"><label for="coNotes">Notes (optional)</label><input id="coNotes"></div>'+
      '<p style="font-size:14px;color:var(--muted)">Payment: cash on delivery. Our team will call or WhatsApp you to confirm.</p>'+
      '<p class="cd-err" id="coErr" role="alert"></p><button class="btn" type="submit" id="coBtn">Place order · '+egp(t.total)+'</button></form>';
    body.querySelectorAll('.qty button').forEach(function(b){b.onclick=function(){var l=cart[+b.dataset.i];l.qty+=+b.dataset.d;if(l.qty<1)cart.splice(+b.dataset.i,1);if(l.qty>10)l.qty=10;saveCart();render();};});
    $('coForm').onsubmit=function(e){e.preventDefault();var err=$('coErr');err.textContent='';var btn=$('coBtn');btn.disabled=true;btn.textContent='Placing your order…';
      fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('coName').value,phone:$('coPhone').value,gov:$('coGov').value,address:$('coAddr').value,notes:$('coNotes').value,items:cart})})
        .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Something went wrong');return j;});})
        .then(function(j){cart=[];saveCart();body.innerHTML='<div style="text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;padding-top:30px"><span class="ok" style="width:64px;height:64px;border-radius:999px;background:var(--red);display:flex;align-items:center;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span><h3 style="font-size:24px;font-weight:400">Thank you!</h3><p>Your order number is <b>'+esc(j.id)+'</b>.</p><p style="color:var(--muted)">Total '+egp(j.total)+', cash on delivery. We will contact you shortly to confirm.</p><p style="font-size:13px;color:var(--muted)">Keep your order number to track it on this page.</p></div>';load().catch(function(){});})
        .catch(function(x){err.textContent=x.message;btn.disabled=false;btn.textContent='Place order · '+egp(totals().total);});
    };
  }
  function open(){render();$('cartScrim').hidden=false;$('cartDrawer').hidden=false;document.body.style.overflow='hidden';}
  function close(){$('cartScrim').hidden=true;$('cartDrawer').hidden=true;document.body.style.overflow='';}
  $('cartBtn').addEventListener('click',open);$('cartClose').onclick=close;$('cartScrim').onclick=close;
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('cartDrawer').hidden)close();});
  $('trackForm').addEventListener('submit',function(e){e.preventDefault();var m=$('trkMsg');m.style.color='var(--body)';m.textContent='Checking…';
    fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:$('trkPhone').value,order:$('trkOrder').value})})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error);return j;});})
      .then(function(j){m.textContent='Order '+j.id+': '+j.status;}).catch(function(x){m.style.color='var(--red)';m.textContent=x.message||'Not found';});});
  saveCart();
  // The newsletter isn't connected yet; stop the form from reloading the page.
  // (This used to be onsubmit="return false" in the HTML, which a strict CSP blocks.)
  $('newsletterForm').addEventListener('submit',function(e){e.preventDefault();});
})();
