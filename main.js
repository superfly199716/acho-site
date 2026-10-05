(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let stage = 0;
  let scrollY = window.scrollY;
  let labInView = false;
  let labDraw = null;
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target);}
  }), {threshold: .08});
  $$('.reveal').forEach(el => revealObserver.observe(el));
  const visibilityObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    labInView = entry.isIntersecting;
  }), {rootMargin: '100px'});
  visibilityObserver.observe($('.lab-visual'));
  function progress() {
    scrollY = window.scrollY;
    const range = document.documentElement.scrollHeight - innerHeight;
    $('.read-progress').style.transform = `scaleX(${range > 0 ? scrollY / range : 0})`;
  }
  window.addEventListener('scroll', progress, {passive:true});
  window.addEventListener('resize', progress, {passive:true});
  progress();

  const motionButton = $('.motion-toggle');
  function motionUI() {
    document.body.classList.toggle('motion-paused', paused);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? 'アニメーションを再開' : 'アニメーションを停止');
    motionButton.textContent = paused ? '▷' : 'Ⅱ';
    $('.motion-status').textContent = paused ? '動きを停止中' : 'ゆるやかに、動く。';
    document.dispatchEvent(new Event('motionchange'));
  }
  motionButton.addEventListener('click', () => {paused = !paused; motionUI();});
  reduced.addEventListener('change', e => {paused = e.matches; motionUI();});
  motionUI();

  // A small, time-based glide for desktop wheels; touch keeps native momentum.
  const desktopWheel = matchMedia('(hover: hover) and (pointer: fine)');
  let glideFrame = 0, glideTarget = window.scrollY, glidePosition = window.scrollY, glideTime = 0;
  const scrollLimit = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  function stopGlide() {
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
    glideTarget = window.scrollY;
  }
  function glide(now) {
    if (paused || reduced.matches || document.hidden || document.body.matches('.dialog-open, .menu-open')) {
      stopGlide(); return;
    }
    const dt = Math.min((now - glideTime) / 1000, .05);
    glideTime = now;
    glideTarget = Math.max(0, Math.min(scrollLimit(), glideTarget));
    const distance = glideTarget - glidePosition;
    if (Math.abs(distance) < 1) {
      window.scrollTo({top: glideTarget, behavior: 'instant'});
      stopGlide(); return;
    }
    // 140 ms damping gives weight without a long, sluggish tail.
    glidePosition += distance * (1 - Math.exp(-dt / .14));
    window.scrollTo({top: glidePosition, behavior: 'instant'});
    glideFrame = requestAnimationFrame(glide);
  }
  window.addEventListener('wheel', event => {
    if (!desktopWheel.matches || reduced.matches || paused || event.defaultPrevented || !event.cancelable ||
        event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        document.body.matches('.dialog-open, .menu-open')) { stopGlide(); return; }
    // Never take over a modal, form field, or independently scrolling panel.
    for (let node = event.target instanceof Element ? event.target : null; node && node !== document.body; node = node.parentElement) {
      if (node.matches('dialog, input, textarea, select, [contenteditable="true"]') ||
          (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1)) {
        stopGlide(); return;
      }
    }
    if (!event.deltaY) return;
    event.preventDefault();
    if (!glideFrame) glideTarget = glidePosition = window.scrollY;
    if (event.deltaY * (glideTarget - window.scrollY) < 0) glideTarget = window.scrollY;
    const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? innerHeight : 1;
    glideTarget = Math.max(0, Math.min(scrollLimit(), glideTarget + event.deltaY * unit));
    if (!glideFrame) { glideTime = performance.now(); glideFrame = requestAnimationFrame(glide); }
  }, {passive: false});
  // An explicit navigation action takes precedence over remaining momentum.
  window.addEventListener('pointerdown', stopGlide, {passive: true});
  window.addEventListener('touchstart', stopGlide, {passive: true});
  window.addEventListener('keydown', stopGlide);
  document.addEventListener('click', stopGlide, true);
  window.addEventListener('resize', stopGlide, {passive: true});
  document.addEventListener('motionchange', stopGlide);
  document.addEventListener('visibilitychange', stopGlide);
  desktopWheel.addEventListener('change', stopGlide);

  const menuButton = $('.menu-toggle'), menu = $('#mobile-menu');
  function setMenu(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    document.body.classList.toggle('menu-open', open);
    if (open) $('a', menu).focus();
  }
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach(a => a.addEventListener('click', () => {
    setMenu(false);
    const target = $(a.getAttribute('href'));
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll:true});
  }));
  document.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'Escape') {setMenu(false); menuButton.focus();}
    if (e.key === 'Tab') {
      const controls = [menuButton, ...$$('a', menu)];
      const idx = controls.indexOf(document.activeElement);
      e.preventDefault();
      controls[(idx + (e.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    }
  });
  matchMedia('(min-width:761px)').addEventListener('change', e => {if (e.matches) setMenu(false);});

  const stageNames = ['ヒアリング・設計', 'デザイン・表現', '開発・確認・公開', '運用・改善'];
  $$('.process').forEach((article, index) => {
    $('button', article).addEventListener('click', () => {
      stage = index;
      $$('.process').forEach((item, i) => {
        const active = i === index;
        item.classList.toggle('is-active', active);
        $('button', item).setAttribute('aria-expanded', String(active));
        $('.process-body', item).hidden = !active;
        $('h3 b', item).textContent = active ? '−' : '+';
      });
      $('#lab-caption').textContent = `0${stage + 1} / ${stageNames[stage]}`;
      $('#lab-index').textContent = `0${stage + 1}—04`;
    });
  });

  // Load the actual captured site only when it approaches the viewport.
  const video = $('#nacos-video'), videoButton = $('#video-toggle');
  let videoVisible = false, videoUserPaused = false;
  video.muted = true;
  function videoUI() {
    const playing = !video.paused && !video.ended;
    videoButton.textContent = playing ? '一時停止 Ⅱ' : '再生 ▷';
    videoButton.setAttribute('aria-label', playing ? 'NACOSの動画を一時停止' : 'NACOSの動画を再生');
    videoButton.setAttribute('aria-pressed', String(playing));
    $('#video-status').textContent = playing ? '実際の3Dアニメーションを再生中' : '3Dアニメーションのプレビュー';
  }
  function playVideo() {
    video.play().then(videoUI).catch(() => { videoUI(); });
  }
  function syncVideo() {
    if (videoVisible && !videoUserPaused && !paused && !document.hidden && !$('#preview-dialog').open) playVideo();
    else video.pause();
  }
  new IntersectionObserver(entries => {
    videoVisible = entries[0].isIntersecting;
    syncVideo();
  }, {threshold: .12}).observe(video);
  videoButton.addEventListener('click', () => {
    videoUserPaused = !video.paused;
    if (videoUserPaused) video.pause(); else playVideo();
  });
  ['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, videoUI));
  function videoError() { $('#video-error').hidden = false; videoUI(); }
  video.addEventListener('error', videoError);
  $('source', video).addEventListener('error', videoError);
  document.addEventListener('motionchange', syncVideo);
  document.addEventListener('visibilitychange', syncVideo);
  const dialog = $('#preview-dialog');
  $$('.case-preview[data-preview], button[data-preview]').forEach(button => button.addEventListener('click', () => {
    const nacos = button.dataset.preview === 'nacos';
    $('#preview-title').textContent = nacos ? 'NACOS — 動くTOPページ' : 'PORTA — トップページ';
    const media = document.createElement(nacos ? 'video' : 'img');
    if (nacos) {
      media.src = $('source', video).src;
      media.poster = video.poster;
      media.controls = true;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.setAttribute('aria-label', 'NACOSの3Dアニメーション');
    } else {
      media.src = $('.porta-preview img').src;
      media.alt = $('.porta-preview img').alt;
    }
    $('#preview-content').replaceChildren(media);
    video.pause();
    dialog.showModal();
    document.body.classList.add('dialog-open');
    if (nacos && !paused) media.play().catch(() => {});
  }));
  $('#preview-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const media = $('video', dialog);
    if (media) media.pause();
    $('#preview-content').replaceChildren();
    document.body.classList.remove('dialog-open');
    syncVideo();
  });

  if (!window.THREE) return;
  const T = window.THREE;
  const resources = [];
  function makeRenderer(canvas, alpha) {
    const renderer = new T.WebGLRenderer({canvas, alpha, antialias:true, powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 1.75));
    resources.push(renderer);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      canvas.style.display = 'none';
      canvas.parentElement.classList.remove('is-ready');
      labDraw = null;
    });
    return renderer;
  }

  // Independent optical plates assemble into four distinct spatial arrangements.
  function initLab() {
    const canvas = $('#lab-canvas');
    const renderer = makeRenderer(canvas,true);
    renderer.setClearColor(0x1d342c,0);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36,1,.1,100);
    camera.position.set(0,0,7.5);
    const group = new T.Group(); scene.add(group);
    const geometry = new T.BoxGeometry(2.5,.04,1.8,40,1,28);
    const uniforms = {uTime:{value:0},uStage:{value:0},uPhase:{value:0}};
    const vertex = `
      varying vec3 vNormal, vPosition;
      uniform float uTime,uStage,uPhase;
      void main(){
        vec3 p=position;
        float a=.11+uStage*.035;
        float phase=p.x*1.75+p.z*.85+uTime*.4+uPhase;
        float secondary=p.z*2.-uTime*.24+uPhase*.6;
        p.y+=sin(phase)*a+cos(secondary)*.05;
        float dx=cos(phase)*a*1.75;
        float dz=cos(phase)*a*.85-sin(secondary)*.1;
        vec3 bentNormal=vec3(normal.x-dx*normal.y,normal.y,normal.z-dz*normal.y);
        vNormal=normalize(normalMatrix*bentNormal);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vPosition=mv.xyz;
        gl_Position=projectionMatrix*mv;
      }`;
    const material = new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:`
      precision highp float;
      varying vec3 vNormal,vPosition;
      uniform float uTime,uStage;
      void main(){
        vec3 n=normalize(vNormal),v=normalize(-vPosition);
        float fresnel=pow(1.-max(dot(n,v),0.),2.3);
        vec3 light=normalize(vec3(-1.,1.5,2.));
        float diffuse=max(dot(n,light),0.);
        float shine=pow(max(dot(reflect(-light,n),v),0.),55.);
        float soft=pow(max(dot(reflect(-normalize(vec3(2.,-.2,1.)),n),v),0.),9.);
        vec3 green=mix(vec3(.11,.24,.17),vec3(.37,.52,.27),uStage/3.);
        vec3 gold=vec3(.84,.85,.55);
        vec3 col=green*(.35+diffuse*.8)+gold*fresnel*.65+vec3(.94,1.,.81)*shine*.8;
        col+=vec3(.32,.51,.33)*soft*.38;
        gl_FragColor=vec4(col,.53+fresnel*.32);
      }`,side:T.DoubleSide,transparent:true,depthWrite:false});
    const plates=[];
    const edgeGeometry=new T.EdgesGeometry(geometry);
    for(let i=0;i<9;i++){
      const plate=new T.Group();
      const layerMaterial=material.clone();
      layerMaterial.uniforms={...uniforms,uPhase:{value:i*.22}};
      const surface=new T.Mesh(geometry,layerMaterial);
      const edgeMaterial=new T.ShaderMaterial({uniforms:layerMaterial.uniforms,vertexShader:vertex,
        fragmentShader:'void main(){gl_FragColor=vec4(.82,.92,.69,.48);}',
        transparent:true,depthWrite:false});
      const edges=new T.LineSegments(edgeGeometry,edgeMaterial);
      plate.add(surface,edges);
      plate.position.y=(i-4)*.27;
      group.add(plate);plates.push(plate);
    }
    const positions=[];
    for(let i=0;i<200;i++){
      const a=i*2.399963,b=Math.acos(1-2*(i+.5)/200),r=2.1+(i%5)*.055;
      positions.push(Math.sin(b)*Math.cos(a)*r,Math.sin(b)*Math.sin(a)*r,Math.cos(b)*r);
    }
    const pg = new T.BufferGeometry(); pg.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const points = new T.Points(pg,new T.PointsMaterial({color:0xb5d695,size:.015,transparent:true,opacity:.45}));scene.add(points);
    let dragX=.38,dragY=-.4,targetX=.38,targetY=-.4,down=false,lastX=0,lastY=0;
    canvas.addEventListener('pointerdown',e=>{down=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{
      if(!down)return;
      targetY+=(e.clientX-lastX)*.008;
      targetX+=(e.clientY-lastY)*.006;
      targetX=Math.max(-1.4,Math.min(1.4,targetX));
      lastX=e.clientX;lastY=e.clientY;
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>{down=false;}));
    canvas.tabIndex=0;
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','浮遊するガラスの層。ドラッグまたは矢印キーで回転。制作工程を選ぶと整列・扇形・積層・波形へ変わります。');
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();
      if(e.key==='ArrowLeft')targetY-=.2;
      if(e.key==='ArrowRight')targetY+=.2;
      if(e.key==='ArrowUp')targetX-=.2;
      if(e.key==='ArrowDown')targetX+=.2;
    });
    const ro=new ResizeObserver(()=>{
      const rect=canvas.parentElement.getBoundingClientRect();
      renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
    });ro.observe(canvas.parentElement);
    let currentStage=0;
    labDraw=(time,dt)=>{
      const lerp=1-Math.exp(-dt*2.4);
      dragX+=(targetX-dragX)*lerp;dragY+=(targetY-dragY)*lerp;
      currentStage+=(stage-currentStage)*(paused?1:lerp);
      uniforms.uStage.value=currentStage;uniforms.uTime.value=time;
      group.rotation.set(dragX+Math.sin(time*.15)*.05,dragY+Math.sin(time*.12)*.12,-.12);
      group.scale.setScalar(1+Math.sin(time*.5)*.018);
      plates.forEach((plate,i)=>{
        const n=i-4;
        const layouts=[
          {x:Math.sin(time*.24+n*.2)*.08,y:n*.29,z:0,r:Math.sin(time*.18+n*.12)*.025},
          {x:Math.sin(n*.22)*.38,y:n*.25,z:0,r:n*.14},
          {x:0,y:n*.11,z:0,r:0},
          {x:Math.sin(n*.55+time*.35)*.42,y:n*.28,z:Math.cos(n*.5+time*.35)*.12,r:Math.sin(n*.4+time*.25)*.22}
        ];
        const target=layouts[stage];
        const speed=paused?1:lerp;
        plate.position.x+=(target.x-plate.position.x)*speed;
        plate.position.y+=(target.y-plate.position.y)*speed;
        plate.position.z+=(target.z-plate.position.z)*speed;
        plate.rotation.y+=(target.r-plate.rotation.y)*speed;
      });
      points.rotation.y=-time*.03;
      renderer.render(scene,camera);
    };
    labDraw(0,.016);
    canvas.parentElement.classList.add('is-ready');
  }
  try {initLab();} catch (_) {$('#lab-canvas').style.display='none';}

  let previous=performance.now(),time=0,lastPaint=0;
  function frame(now) {
    requestAnimationFrame(frame);
    if(document.hidden){previous=now;return;}
    if(now-lastPaint < 30)return;
    lastPaint=now;
    const dt=Math.min((now-previous)/1000,.06);previous=now;
    if(!paused)time+=dt;
    if(labInView && labDraw)labDraw(time,dt);
  }
  requestAnimationFrame(frame);
})();
