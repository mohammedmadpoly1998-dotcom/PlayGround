(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  let width = 0, height = 0, dpr = 1, scale = 1, last = 0, accumulator = 0;
  let mode = 'menu', elapsed = 0, cameraX = 0, cameraShake = 0, toastTimer = 0;
  let keys = Object.create(null), stick = { x: 0, active: false }, audioCtx = null;
  let crystals = [], particles = [], projectiles = [], enemies = [], platforms = [], hazards = [], decor = [];
  let player, checkpointX = 80, checkpointActive = false, crystalTotal = 0;
  const LEVEL_END = 4490, fixedDt = 1 / 120;

  function resize() {
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); scale = width / 1000;
  }
  window.addEventListener('resize', resize, { passive: true }); resize();
  function makeLevel() {
    platforms = [
      {x:0,w:535,y:0,type:'solid'}, {x:625,w:520,y:0,type:'solid'}, {x:1225,w:455,y:0,type:'solid'},
      {x:1740,w:580,y:0,type:'solid'}, {x:2400,w:535,y:0,type:'solid'}, {x:3010,w:560,y:0,type:'solid'}, {x:3650,w:840,y:0,type:'solid'},
      {x:245,w:155,y:76,type:'solid'}, {x:474,w:105,y:124,type:'solid'}, {x:805,w:145,y:82,type:'solid'}, {x:1010,w:120,y:138,type:'solid'},
      {x:1390,w:130,y:92,type:'solid'}, {x:1580,w:125,y:158,type:'solid'}, {x:1885,w:150,y:95,type:'solid'}, {x:2110,w:125,y:152,type:'solid'},
      {x:2530,w:140,y:90,type:'solid'}, {x:2730,w:130,y:145,type:'solid'}, {x:3140,w:145,y:94,type:'solid'}, {x:3360,w:145,y:158,type:'solid'},
      {x:3820,w:145,y:95,type:'solid'}, {x:4050,w:125,y:155,type:'solid'},
      {x:650,w:120,y:74,type:'moving',start:650,range:105,speed:1.15,phase:0},
      {x:1780,w:130,y:78,type:'collapse',timer:0,triggered:false}, {x:3240,w:130,y:72,type:'collapse',timer:0,triggered:false}
    ];
    hazards = [{x:420,w:72,type:'spikes'},{x:955,w:85,type:'spikes'},{x:1515,w:75,type:'spikes'},{x:2055,w:78,type:'spikes'},{x:2630,w:84,type:'spikes'},{x:3450,w:86,type:'spikes'},{x:3900,w:75,type:'spikes'}];
    crystals = [];
    const rows = [[115,245,285,325,360,485,520],[680,755,820,860,905,1010,1055,1110],[1270,1325,1395,1450,1585,1630],[1780,1840,1905,1960,2115,2160,2250],[2445,2510,2555,2630,2735,2790,2890],[3060,3145,3200,3260,3365,3420,3525],[3710,3790,3835,3900,4055,4110,4200,4310,4400]];
    rows.forEach((xs, row) => xs.forEach((x, i) => { const p = platforms.find(q => q.type === 'solid' && x >= q.x && x <= q.x + q.w && q.y > 0); const y = p ? p.y + 34 : (i % 3 === 1 ? 52 : 42); crystals.push({x,y,got:false,phase:rand(0,TAU)}); }));
    enemies = [
      {type:'walker',x:350,y:0,min:290,max:390,dir:1,alive:true,speed:38}, {type:'flyer',x:740,y:105,base:105,phase:0,alive:true,speed:1.4},
      {type:'shooter',x:1085,y:0,dir:-1,alive:true,cool:1.5}, {type:'walker',x:1440,y:0,min:1320,max:1510,dir:-1,alive:true,speed:45},
      {type:'flyer',x:1940,y:112,base:112,phase:1.4,alive:true,speed:1.8}, {type:'shooter',x:2290,y:0,dir:-1,alive:true,cool:1},
      {type:'walker',x:2580,y:0,min:2440,max:2820,dir:1,alive:true,speed:53}, {type:'flyer',x:3190,y:124,base:124,phase:2.2,alive:true,speed:2},
      {type:'shooter',x:3585,y:0,dir:-1,alive:true,cool:.6}, {type:'walker',x:3930,y:0,min:3720,max:4140,dir:-1,alive:true,speed:58}
    ];
    decor = []; for (let x=0;x<LEVEL_END+500;x+=rand(105,220)) decor.push({x,h:rand(70,220),w:rand(28,85),tone:Math.floor(rand(0,3)),seed:rand(0,100)});
  }
  function resetGame() {
    makeLevel(); particles=[]; projectiles=[]; crystalTotal=0; elapsed=0; cameraX=0; cameraShake=0; checkpointX=80; checkpointActive=false;
    player={x:80,y:0,vx:0,vy:0,w:28,h:44,grounded:true,jumps:0,face:1,health:3,invuln:0,attack:0,attackCooldown:0,dead:false};
    updateHud();
  }
  resetGame();
  function showScreen(name) { Object.entries({start:$('startScreen'),pause:$('pauseScreen'),end:$('endScreen')}).forEach(([k,el])=>el.classList.toggle('hidden',k!==name)); }
  function hideScreens() { ['startScreen','pauseScreen','endScreen'].forEach(id=>$(id).classList.add('hidden')); }
  function begin() { resetGame(); mode='playing'; hideScreens(); $('mobileControls').style.display=''; }
  function setToast(text) { const el=$('toast'); el.textContent=text; el.classList.add('show'); toastTimer=1.5; }
  function updateHud() {
    $('crystalCount').textContent=String(crystalTotal).padStart(2,'0'); $('crystalMeter').style.width=`${Math.min(100,crystalTotal/20*100)}%`;
    $('healthText').textContent=`${String(player.health).padStart(2,'0')} / 03`;
    $('hearts').innerHTML=[0,1,2].map(i=>`<span class="${i>=player.health?'empty':''}">♥</span>`).join('');
    const progress=clamp(player.x/LEVEL_END*100,0,100); $('distanceMeter').style.width=`${progress}%`; $('distanceText').textContent=`${Math.floor(progress)}%`;
    const t=Math.floor(elapsed), m=String(Math.floor(t/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0'); $('runTime').textContent=`${m}:${s}`;
  }
  function sound(kind) {
    try { if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume();
      const now=audioCtx.currentTime, osc=audioCtx.createOscillator(), gain=audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination);
      const tones={jump:[360,570,.09,'sine'],pickup:[680,1080,.12,'sine'],hit:[170,75,.18,'sawtooth'],win:[440,880,.4,'triangle'],attack:[250,620,.1,'triangle']}; const [a,b,d,wave]=tones[kind]||tones.pickup;
      osc.type=wave; osc.frequency.setValueAtTime(a,now); osc.frequency.exponentialRampToValueAtTime(b,now+d); gain.gain.setValueAtTime(.055,now); gain.gain.exponentialRampToValueAtTime(.001,now+d); osc.start(now); osc.stop(now+d);
    } catch(_) {}
  }
  function inputAxis() { return (keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0) || stick.x; }
  function jump() {
    if(mode!=='playing')return;
    if(player.grounded || player.jumps<2) { player.vy=player.grounded?470:430; player.grounded=false; player.jumps++; sound('jump'); puff(player.x,player.y+3,'#5ef4ef',5); }
  }
  function attack() {
    if(mode!=='playing'||player.attackCooldown>0)return;
    player.attack=.23; player.attackCooldown=.36; sound('attack');
    enemies.forEach(e=>{ if(!e.alive)return; const dx=e.x-player.x, dy=(e.y+(e.type==='flyer'?12:20))-(player.y+player.h*.55); if(Math.abs(dx)<92 && Math.abs(dy)<58 && Math.sign(dx||1)===player.face){e.alive=false;puff(e.x,e.y+20,'#b38cff',12);setToast('SENTINEL DISABLED');} });
    projectiles=projectiles.filter(p=>Math.abs(p.x-player.x)>110 || Math.sign(p.x-player.x)===player.face);
  }
  function puff(x,y,color,count=8) { for(let i=0;i<count;i++)particles.push({x,y,vx:rand(-100,100),vy:rand(30,180),life:rand(.28,.65),max:.65,size:rand(2,5),color}); }
  function hurt(sourceX) {
    if(player.invuln>0||mode!=='playing')return;
    player.health--; player.invuln=1.45; player.vy=260; player.vx=(player.x<sourceX?-1:1)*180; cameraShake=10; sound('hit'); puff(player.x,player.y+20,'#ff738c',12); updateHud();
    if(player.health<=0){finish(false);return;}
    setToast('HULL BREACH · INTEGRITY LOST');
  }
  function finish(win) {
    mode=win?'won':'lost'; sound(win?'win':'hit'); $('endEyebrow').innerHTML=`<span></span> ${win?'RUN COMPLETE':'SIGNAL LOST'}`;
    $('endTitle').innerHTML=win?'YOU\'RE<br><em>THE SPARK.</em>':'SYSTEM<br><em>OFFLINE.</em>';
    $('endCopy').textContent=win?'The relay is alive again. Nice work, little bot.':(checkpointActive?'The sector got the better of you. One more run?':'The sector got the better of you. One more run?');
    $('resultCount').textContent=`${crystalTotal} / 20`; showScreen('end');
  }
  function update(dt) {
    if(mode!=='playing')return;
    elapsed+=dt; if(toastTimer>0 && (toastTimer-=dt)<=0)$('toast').classList.remove('show');
    player.invuln=Math.max(0,player.invuln-dt); player.attack=Math.max(0,player.attack-dt); player.attackCooldown=Math.max(0,player.attackCooldown-dt);
    const axis=inputAxis(); if(axis)player.face=Math.sign(axis);
    const accel=player.grounded?1800:1100; player.vx+=axis*accel*dt; if(!axis)player.vx*=Math.pow(player.grounded?.0001:.13,dt); player.vx=clamp(player.vx,-210,210);
    const oldY=player.y; player.vy-=1180*dt; player.y+=player.vy*dt; player.x+=player.vx*dt;
    player.x=clamp(player.x,0,LEVEL_END+40); player.grounded=false;
    for(const p of platforms){
      if(p.type==='moving'){p.x=p.start+Math.sin(elapsed*p.speed+p.phase)*p.range;}
      if(p.type==='collapse'&&p.triggered){p.timer+=dt;if(p.timer>1.15)p.falling=true;if(p.falling)p.y-=320*dt;if(p.timer>2.6){p.triggered=false;p.falling=false;p.timer=0;p.y=78;}}
      if(p.falling)continue;
      if(player.vy<=0 && oldY>=p.y-1 && player.y<=p.y && player.x+player.w*.4>p.x && player.x-player.w*.4<p.x+p.w){
        player.y=p.y;player.vy=0;player.grounded=true;player.jumps=0;
        if(p.type==='moving')player.x+=Math.cos(elapsed*p.speed+p.phase)*p.range*p.speed*dt;
        if(p.type==='collapse'&&!p.triggered){p.triggered=true;p.timer=.02;setToast('FLOOR UNSTABLE');}
      }
    }
    if(player.y<0){
      player.y=0;player.vy=0;player.grounded=true;player.jumps=0;
      const ground=platforms.find(p=>p.y===0&&player.x+12>p.x&&player.x-12<p.x+p.w);
      if(!ground){
        hurt(player.x);
        if(mode==='playing'){
          player.x=checkpointX;player.y=0;player.vx=0;player.vy=0;player.grounded=true;player.jumps=0;
        }
      }
    }
    player.x=clamp(player.x,0,LEVEL_END+40);
    for(const h of hazards){if(player.x+10>h.x&&player.x-10<h.x+h.w&&player.y<24)hurt(h.x+h.w/2);}
    for(const c of crystals){if(!c.got&&Math.abs(c.x-player.x)<24&&Math.abs(c.y-(player.y+22))<34){c.got=true;crystalTotal++;sound('pickup');puff(c.x,c.y,'#5ef4ef',10);updateHud();if(crystalTotal===20)setToast('20 CELLS ONLINE · FIND THE GATE');}}
    if(!checkpointActive&&player.x>2210){checkpointActive=true;checkpointX=2240;setToast('CHECKPOINT SYNCED');puff(checkpointX,22,'#ffb05f',18);}
    for(const e of enemies){if(!e.alive)continue;
      if(e.type==='walker'){e.x+=e.dir*e.speed*dt;if(e.x<e.min||e.x>e.max)e.dir*=-1;}
      else if(e.type==='flyer'){e.phase+=dt*e.speed;e.x+=Math.sin(e.phase*.53)*24*dt;e.y=e.base+Math.sin(e.phase*2)*22;}
      else {e.cool-=dt;if(e.cool<=0&&Math.abs(player.x-e.x)<500){e.cool=2.1;const dir=Math.sign(player.x-e.x);projectiles.push({x:e.x+dir*15,y:25,vx:dir*170,life:3});}}
      const ex=e.x, ey=e.y+(e.type==='flyer'?12:0); const within=Math.abs(player.x-ex)<25&&Math.abs((player.y)-(ey+25))<34;
      if(within){if(player.vy<0&&player.y>ey+16){e.alive=false;player.vy=330;puff(ex,ey+25,'#ff9b63',12);sound('hit');}else hurt(ex);}
    }
    for(const p of projectiles){p.x+=p.vx*dt;p.life-=dt;if(Math.abs(p.x-player.x)<17&&Math.abs(p.y-(player.y+20))<25){p.life=0;hurt(p.x);}}
    projectiles=projectiles.filter(p=>p.life>0&&p.x>-80&&p.x<LEVEL_END+80);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=350*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    cameraX=lerp(cameraX,clamp(player.x-width/scale*.42,0,LEVEL_END-width/scale+80),1-Math.exp(-4.2*dt));
    cameraShake=Math.max(0,cameraShake-32*dt);
    if(player.x>LEVEL_END-120){if(crystalTotal>=20)finish(true);else if(!window._gateToast){setToast('GATE LOCKED · RECOVER 20 CELLS');window._gateToast=true;setTimeout(()=>window._gateToast=false,2400);}}
    updateHud();
  }
  function sx(x){return (x-cameraX)*scale+width*.42;}
  function sy(y){return height*.72-y*scale;}
  function poly(points,fill,stroke=null,line=1){ctx.beginPath();points.forEach((p,i)=>{const x=sx(p[0]),y=sy(p[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
  function drawBackground(t){
    const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#101937');sky.addColorStop(.52,'#17234a');sky.addColorStop(1,'#111831');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    const glow=ctx.createRadialGradient(width*.73,height*.22,0,width*.73,height*.22,width*.52);glow.addColorStop(0,'#7c3d9b2b');glow.addColorStop(1,'#6732a100');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    for(let i=0;i<70;i++){let x=((i*173-cameraX*scale*.04)%(width+40)+width+40)%(width+40), y=(i*79%Math.floor(height*.57));ctx.globalAlpha=.2+(i%4)*.12;ctx.fillStyle=i%8===0?'#64f8f2':'#cbd7ff';ctx.fillRect(x,y,i%8===0?2:1,i%8===0?2:1);}ctx.globalAlpha=1;
    for(let layer=0;layer<3;layer++){
      const par=.08+layer*.09, base=height*(.58+layer*.07), step=120+layer*55, off=(cameraX*scale*par)%step;
      ctx.beginPath();ctx.moveTo(-step,base);
      for(let x=-step-off;x<width+step;x+=step){const h=45+((Math.floor((x+off+cameraX*scale*par)/step)*37+layer*23)%100);ctx.lineTo(x,base-h);ctx.lineTo(x+step*.48,base-h-randSeed(x+layer)*28);ctx.lineTo(x+step,base);}
      ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=['#121d3b','#111a35','#0d152c'][layer];ctx.fill();
      if(layer===1){ctx.save();ctx.globalAlpha=.42;ctx.strokeStyle='#516797';ctx.lineWidth=1;for(let i=0;i<18;i++){const x=((i*139-cameraX*scale*par)%(width+50)+width+50)%(width+50);const h=35+(i*31%100);ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-h);ctx.lineTo(x+18,base-h);ctx.stroke();}ctx.restore();}
    }
    ctx.save();ctx.globalAlpha=.2;ctx.strokeStyle='#4cf3ed';ctx.lineWidth=1;for(let i=0;i<7;i++){const yy=height*.64+i*i*7;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(width,yy);ctx.stroke();}ctx.restore();
  }
  function randSeed(n){const z=Math.sin(n*12.9898)*43758.5453;return z-Math.floor(z);}
  function drawStructures(){
    decor.forEach(d=>{const x=sx(d.x);if(x<-140||x>width+120)return;const y=sy(0), w=d.w*scale,h=d.h*scale;let col=['#172347','#1c2049','#15294a'][d.tone];
      ctx.fillStyle=col;ctx.fillRect(x,y-h,w,h);ctx.fillStyle='#283666';ctx.fillRect(x+w*.82,y-h-5*scale,w*.18,h+5*scale);
      ctx.fillStyle=d.tone===1?'#a883ff66':'#5ef4ef66';for(let j=0;j<Math.floor(h/20);j++){const wy=y-h+12*scale+j*20*scale;ctx.fillRect(x+6*scale,wy,3*scale,5*scale);if(w>50*scale)ctx.fillRect(x+w*.55,wy,3*scale,5*scale);}
      ctx.strokeStyle='#5ef4ef25';ctx.lineWidth=1;ctx.strokeRect(x,y-h,w,h);
    });
    // thin overhead cables stitch the distant towers together
    ctx.save();ctx.strokeStyle='#7d91ca38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height*.31);ctx.bezierCurveTo(width*.35,height*.44,width*.58,height*.16,width,height*.33);ctx.stroke();ctx.restore();
  }
  function drawPlatforms(){
    for(const p of platforms){if(p.x+p.w<cameraX-100||p.x>cameraX+width/scale+100)continue;const x=sx(p.x), y=sy(p.y), w=p.w*scale, d=14*scale;
      const active=p.type==='collapse'&&p.triggered;const surface=p.type==='moving'?'#25445d':active?'#442d52':'#202b4a';const side=p.type==='collapse'?'#151d37':'#111a31';
      ctx.fillStyle=side;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+d);ctx.lineTo(x,y+d);ctx.closePath();ctx.fill();
      ctx.fillStyle=surface;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w+7*scale,y-8*scale);ctx.lineTo(x+6*scale,y-8*scale);ctx.closePath();ctx.fill();
      ctx.strokeStyle=p.type==='moving'?'#5ef4ef':p.type==='collapse'?'#ff9a58':'#4c6789';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x+6*scale,y-7*scale);ctx.lineTo(x+w+5*scale,y-7*scale);ctx.stroke();
      ctx.strokeStyle='#344263';ctx.lineWidth=1;for(let k=1;k<Math.floor(w/(45*scale));k++){ctx.beginPath();ctx.moveTo(x+k*45*scale,y+3*scale);ctx.lineTo(x+k*45*scale,y+d-2*scale);ctx.stroke();}
      ctx.fillStyle=p.type==='moving'?'#5ef4ef':p.type==='collapse'?'#ff9a58':'#5b6d91';ctx.fillRect(x+10*scale,y+d+3*scale,5*scale,2*scale);ctx.fillRect(x+w-16*scale,y+d+3*scale,5*scale,2*scale);
    }
  }
  function drawHazards(){
    hazards.forEach(h=>{if(h.x+h.w<cameraX||h.x>cameraX+width/scale)return;const count=Math.ceil(h.w/18);for(let i=0;i<count;i++){const x=h.x+i*h.w/count, w=h.w/count;poly([[x,0],[x+w*.5,27],[x+w,0]],'#a33e65','#ff7a91',1);poly([[x+w*.36,4],[x+w*.5,24],[x+w*.65,4]],'#ff789266');}ctx.save();ctx.globalAlpha=.25;ctx.shadowColor='#ff5279';ctx.shadowBlur=15;ctx.strokeStyle='#ff5279';ctx.beginPath();ctx.moveTo(sx(h.x),sy(0));ctx.lineTo(sx(h.x+h.w),sy(0));ctx.stroke();ctx.restore();});
  }
  function drawCrystal(c,t){if(c.got)return;const x=sx(c.x), y=sy(c.y+Math.sin(t*2+c.phase)*5), r=10*scale;if(x<-30||x>width+30)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t+c.phase)*.12);ctx.shadowColor='#5ef4ef';ctx.shadowBlur=18*scale;ctx.fillStyle='#57f3eb';ctx.beginPath();ctx.moveTo(0,-r*1.35);ctx.lineTo(r*.78,-r*.25);ctx.lineTo(r*.52,r);ctx.lineTo(-r*.52,r);ctx.lineTo(-r*.78,-r*.25);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#d9ffff';ctx.beginPath();ctx.moveTo(0,-r*1.06);ctx.lineTo(r*.23,-r*.18);ctx.lineTo(0,r*.68);ctx.lineTo(-r*.25,-r*.18);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawPlayer(t){
    const p=player, x=sx(p.x), foot=sy(p.y), w=p.w*scale, h=p.h*scale; if(p.invuln>0&&Math.floor(t*16)%2===0)return;
    const bob=p.grounded?Math.sin(t*11)*1.2*scale:0, run=Math.abs(p.vx)>12&&p.grounded?Math.sin(t*17)*3*scale:0;const top=foot-h+bob;
    ctx.save();ctx.translate(x,top);ctx.scale(p.face,1);
    // soft foot shadow remains attached to the floor while airborne
    ctx.restore();ctx.save();ctx.globalAlpha=clamp(1-Math.max(0,p.y)/220,.15,.4);ctx.fillStyle='#020611';ctx.beginPath();ctx.ellipse(x,sy(0)+7*scale,17*scale,4*scale,0,0,TAU);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(x,top);ctx.scale(p.face,1);
    ctx.fillStyle='#141e38';ctx.fillRect(-w*.36, h*.65+run, w*.28,h*.28);ctx.fillRect(w*.08,h*.65-run,w*.28,h*.28);
    ctx.fillStyle='#59eae7';ctx.fillRect(-w*.39,h*.87+run,w*.34,h*.09);ctx.fillRect(w*.04,h*.87-run,w*.34,h*.09);
    ctx.fillStyle='#7d75fa';ctx.beginPath();ctx.moveTo(-w*.38,h*.38);ctx.lineTo(w*.37,h*.38);ctx.lineTo(w*.31,h*.72);ctx.lineTo(-w*.31,h*.72);ctx.closePath();ctx.fill();
    ctx.fillStyle='#a8fbf2';ctx.fillRect(-w*.29,h*.4,w*.58,h*.08);ctx.fillStyle='#56ddd9';ctx.fillRect(-w*.31,h*.49,w*.62,h*.19);
    ctx.fillStyle='#384878';ctx.fillRect(-w*.44,h*.48,w*.15,h*.16);ctx.fillRect(w*.29,h*.48,w*.15,h*.16);
    ctx.fillStyle='#d9ffff';ctx.fillRect(-w*.19,h*.13,w*.38,h*.3);ctx.fillStyle='#26395e';ctx.fillRect(-w*.24,h*.09,w*.48,h*.08);
    ctx.shadowColor='#58f8ef';ctx.shadowBlur=9*scale;ctx.fillStyle='#5ef4ef';ctx.fillRect(-w*.1,h*.22,w*.2,h*.075);ctx.shadowBlur=0;
    ctx.fillStyle='#ffae73';ctx.fillRect(-w*.34,h*.59,w*.12,h*.08);ctx.fillRect(w*.23,h*.59,w*.12,h*.08);
    // tiny antenna
    ctx.strokeStyle='#a5a8ff';ctx.lineWidth=1.5*scale;ctx.beginPath();ctx.moveTo(0,h*.12);ctx.lineTo(w*.22,h*.01);ctx.stroke();ctx.fillStyle='#ff9a58';ctx.beginPath();ctx.arc(w*.22,h*.01,2.2*scale,0,TAU);ctx.fill();
    if(p.attack>0){ctx.save();ctx.globalAlpha=p.attack/.23;ctx.strokeStyle='#b993ff';ctx.shadowColor='#a883ff';ctx.shadowBlur=18*scale;ctx.lineWidth=3*scale;ctx.beginPath();ctx.arc(w*.52,h*.43,27*scale,-.9,.9);ctx.stroke();ctx.restore();}
    ctx.restore();
  }
  function drawEnemy(e,t){if(!e.alive)return;const x=sx(e.x), y=sy(e.y+(e.type==='flyer'?12:0));if(x<-60||x>width+60)return;ctx.save();
    if(e.type==='walker'){
      const bob=Math.sin(t*9+e.x)*2*scale;ctx.translate(x,y-bob);ctx.fillStyle='#f07f55';ctx.shadowColor='#ff8055';ctx.shadowBlur=13*scale;
      ctx.beginPath();ctx.moveTo(-15*scale,-27*scale);ctx.lineTo(-11*scale,-42*scale);ctx.lineTo(-4*scale,-32*scale);ctx.lineTo(3*scale,-43*scale);ctx.lineTo(14*scale,-32*scale);ctx.lineTo(17*scale,-9*scale);ctx.lineTo(10*scale,0);ctx.lineTo(-11*scale,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#431f3d';ctx.fillRect(-9*scale,-24*scale,18*scale,7*scale);ctx.fillStyle='#fff0c4';ctx.fillRect(-5*scale,-22*scale,4*scale,3*scale);ctx.fillRect(3*scale,-22*scale,4*scale,3*scale);ctx.fillStyle='#873b50';ctx.fillRect(-9*scale,-1*scale,6*scale,6*scale);ctx.fillRect(6*scale,-1*scale,6*scale,6*scale);
    }else if(e.type==='flyer'){
      ctx.translate(x,y+Math.sin(t*7+e.phase)*2*scale);ctx.fillStyle='#b78dff';ctx.shadowColor='#a883ff';ctx.shadowBlur=14*scale;ctx.beginPath();ctx.ellipse(0,0,15*scale,11*scale,0,0,TAU);ctx.fill();ctx.shadowBlur=0;
      const wing=Math.sin(t*16+e.phase)*8*scale;ctx.fillStyle='#825ee3';ctx.beginPath();ctx.moveTo(-7*scale,0);ctx.lineTo(-20*scale,-wing-5*scale);ctx.lineTo(-17*scale,wing+4*scale);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(7*scale,0);ctx.lineTo(20*scale,-wing-5*scale);ctx.lineTo(17*scale,wing+4*scale);ctx.closePath();ctx.fill();ctx.fillStyle='#271f55';ctx.fillRect(-5*scale,-3*scale,10*scale,4*scale);ctx.fillStyle='#f3e7ff';ctx.fillRect(-3*scale,-2*scale,2*scale,2*scale);ctx.fillRect(2*scale,-2*scale,2*scale,2*scale);
    }else{
      ctx.translate(x,y);ctx.fillStyle='#ff9d59';ctx.shadowColor='#ff8c56';ctx.shadowBlur=14*scale;ctx.fillRect(-13*scale,-35*scale,26*scale,35*scale);ctx.shadowBlur=0;ctx.fillStyle='#482e52';ctx.fillRect(-9*scale,-28*scale,18*scale,10*scale);ctx.fillStyle='#ffe2a5';ctx.fillRect(-5*scale,-25*scale,10*scale,4*scale);ctx.fillStyle='#703f54';ctx.fillRect(-19*scale,-11*scale,6*scale,15*scale);ctx.fillRect(13*scale,-11*scale,6*scale,15*scale);ctx.fillStyle='#a84f58';ctx.fillRect(-7*scale,-3*scale,14*scale,4*scale);
    }ctx.restore();
  }
  function drawGoal(t){const x=sx(LEVEL_END-25),base=sy(0),top=sy(225);ctx.save();ctx.strokeStyle='#a883ff';ctx.lineWidth=5*scale;ctx.shadowColor='#9b75ff';ctx.shadowBlur=22*scale;ctx.strokeRect(x-31*scale,top,62*scale,base-top);ctx.shadowBlur=0;ctx.fillStyle='#141b39';ctx.fillRect(x-23*scale,top+9*scale,46*scale,base-top-9*scale);
    const open=crystalTotal>=20;ctx.fillStyle=open?'#5ef4ef':'#754e7d';ctx.globalAlpha=open?.6:.36;ctx.fillRect(x-18*scale,top+17*scale,36*scale,base-top-17*scale);ctx.globalAlpha=1;
    ctx.strokeStyle=open?'#5ef4ef':'#ff9a58';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,top+10*scale);ctx.lineTo(x,base-4*scale);ctx.stroke();ctx.fillStyle=open?'#5ef4ef':'#ff9a58';ctx.font=`${10*scale}px Courier New`;ctx.textAlign='center';ctx.fillText(open?'GATE OPEN':`${Math.max(0,20-crystalTotal)} CELLS`,x,top-12*scale);ctx.restore();
  }
  function drawCheckpoint(t){const x=sx(2240),base=sy(0),top=sy(148);ctx.save();ctx.strokeStyle=checkpointActive?'#ffbf6b':'#65738e';ctx.lineWidth=3*scale;ctx.shadowColor='#ffae57';ctx.shadowBlur=checkpointActive?18:0;ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,top);ctx.stroke();ctx.fillStyle=checkpointActive?'#ffbc5f':'#7888a4';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+24*scale,top+8*scale);ctx.lineTo(x,top+18*scale);ctx.closePath();ctx.fill();ctx.restore();}
  function drawWorld(t){
    const shake=cameraShake?rand(-cameraShake,cameraShake):0;ctx.save();ctx.translate(shake,0);
    drawBackground(t);drawStructures();
    // glinting lane markers add a sense of motion to the floor plane
    ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#5ef4ef';ctx.lineWidth=1;for(let i=0;i<24;i++){let wx=cameraX+(i*95-cameraX%95);let x=sx(wx);ctx.beginPath();ctx.moveTo(x,sy(0)+18*scale);ctx.lineTo(x-25*scale,sy(0)+42*scale);ctx.stroke();}ctx.restore();
    drawPlatforms();drawHazards();drawCheckpoint(t);crystals.forEach(c=>drawCrystal(c,t));drawGoal(t);
    enemies.forEach(e=>drawEnemy(e,t));
    projectiles.forEach(p=>{const x=sx(p.x),y=sy(p.y);ctx.save();ctx.shadowColor='#ff9260';ctx.shadowBlur=12;ctx.fillStyle='#ffae69';ctx.beginPath();ctx.arc(x,y,5*scale,0,TAU);ctx.fill();ctx.restore();});
    particles.forEach(p=>{const x=sx(p.x),y=sy(p.y);ctx.save();ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.fillRect(x,y,p.size*scale,p.size*scale);ctx.restore();});
    drawPlayer(t);ctx.restore();
    // sector label in the playfield
    ctx.save();ctx.globalAlpha=.58;ctx.fillStyle='#d8e6ff';ctx.font=`500 ${Math.max(9,10*scale)}px Courier New`;ctx.letterSpacing='2px';ctx.fillText('NEON FRONTIER  /  SECTOR 07',width-218,height-21);ctx.restore();
  }
  function render(t){drawWorld(t);}
  function frame(now){if(!last)last=now;let dt=Math.min(.05,(now-last)/1000);last=now;accumulator+=dt;while(accumulator>=fixedDt){update(fixedDt);accumulator-=fixedDt;}render(now/1000);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);

  function pause(){if(mode==='playing'){mode='paused';showScreen('pause');}else if(mode==='paused'){mode='playing';hideScreens();}}
  $('startButton').addEventListener('click',begin);$('resumeButton').addEventListener('click',pause);$('pauseButton').addEventListener('click',pause);
  $('pauseRestart').addEventListener('click',begin);$('restartButton').addEventListener('click',begin);
  window.addEventListener('keydown',e=>{
    const k=e.code;if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(k))e.preventDefault();
    if(k==='Escape'||k==='KeyP'){if(mode==='playing'||mode==='paused')pause();return;}
    keys[k]=true;if((k==='Space'||k==='ArrowUp'||k==='KeyW')&&!e.repeat)jump();if((k==='KeyJ'||k==='KeyK'||k==='KeyX')&&!e.repeat)attack();
  });
  window.addEventListener('keyup',e=>{keys[e.code]=false;});window.addEventListener('blur',()=>{keys=Object.create(null);if(mode==='playing')pause();});
  const zone=$('stickZone'), knob=$('stickKnob');let pointerId=null;
  zone.addEventListener('pointerdown',e=>{e.preventDefault();pointerId=e.pointerId;zone.setPointerCapture(pointerId);stick.active=true;moveStick(e);});
  zone.addEventListener('pointermove',e=>{if(e.pointerId===pointerId)moveStick(e);});
  function moveStick(e){const rect=zone.getBoundingClientRect(),dx=e.clientX-(rect.left+rect.width/2),max=38;stick.x=clamp(dx/max,-1,1);knob.style.transform=`translate(${clamp(dx,-max,max)}px, ${clamp(e.clientY-(rect.top+rect.height/2),-max,max)}px)`;}
  function releaseStick(e){if(pointerId===null||e.pointerId!==pointerId)return;pointerId=null;stick.active=false;stick.x=0;knob.style.transform='translate(0,0)';}
  zone.addEventListener('pointerup',releaseStick);zone.addEventListener('pointercancel',releaseStick);zone.addEventListener('lostpointercapture',releaseStick);
  function bindTouch(id,fn){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();el.classList.add('pressed');el.setPointerCapture(e.pointerId);fn();});const up=()=>el.classList.remove('pressed');el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);}
  bindTouch('jumpButton',jump);bindTouch('attackButton',attack);
  document.addEventListener('contextmenu',e=>e.preventDefault());
})();
