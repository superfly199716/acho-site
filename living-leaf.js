/* Photographic 2.5D: local flexion and independently flowing refraction.
 * The camera and page stay fixed. This does not reconstruct a hidden 3D surface.
 * Data-URI texture also works when the site is opened directly from Finder.
 */
(() => {
  'use strict';
  const canvas = document.querySelector('#living-leaf');
  const hero = document.querySelector('.hero');
  if (!canvas || !hero) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let gl, program, texture, buffer, image;
  let ready = false, failed = false, visible = true, frame = 0;
  let time = 0, last = 0, drawn = 0;
  let pointer = [0, 0], target = [0, 0], uniforms;
  const stopped = () => document.body.classList.contains('motion-paused');
  const runnable = () => ready && !failed && visible && !document.hidden && !stopped();

  const vertex = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = vec2(aPosition.x * .5 + .5, .5 - aPosition.y * .5);
      gl_Position = vec4(aPosition, 0., 1.);
    }
  `;
  const fragment = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uPhoto;
    uniform vec2 uCover, uPointer;
    uniform float uTime;

    float lobe(vec2 p, vec2 center, vec2 radius) {
      vec2 q = (p - center) / radius;
      return exp(-2.5 * dot(q, q));
    }
    float green(vec3 c) {
      return smoothstep(.004, .09, c.g - c.r * .985)
        * smoothstep(.015, .16, c.g - c.b);
    }
    // Three local bending fields follow the original leaf's folds. The large
    // negative space is pinned; no translating, zooming or rotating the photo.
    vec2 flex(vec2 p, float t) {
      float upper = lobe(p, vec2(.87,.27), vec2(.30,.35));
      float curl = lobe(p, vec2(.73,.61), vec2(.29,.25));
      float foreground = lobe(p, vec2(.49,.90), vec2(.45,.23));
      float a = sin(t * .70), b = sin(t * .53), c = sin(t * .61);
      vec2 d = upper * vec2(.027*a, .013*sin(t*.70+.7)-.013*sin(.7));
      d += curl * vec2(-.021*b, .023*sin(t*.53-.4)+.023*sin(.4));
      d += foreground * vec2(.012*c, -.021*c);
      d += (upper + curl*.6) * uPointer * vec2(.005, .003);
      return d * smoothstep(.20,.52,p.x+p.y*.15);
    }
    // Interfering wave directions produce moving light paths, not a flat glow.
    float water(vec2 p, float t) {
      vec2 q = p * vec2(20., 27.);
      q += vec2(sin(q.y*.73+t*.32), cos(q.x*.61-t*.27)) * .8;
      float a = sin(q.x+q.y*.42+t*.57);
      float b = sin(q.x*.48-q.y+t*.43);
      float c = sin(q.x*.8+q.y*.73-t*.38);
      return pow(max(0.,1.-abs((a+b+c)*.48)),10.);
    }
    void main() {
      vec2 p = (vUv-.5)*uCover+.5;
      // Inverse deformation keeps the photographic surface continuous.
      vec2 q = p - flex(p,uTime);
      q = p - flex(q,uTime);
      vec3 base = texture2D(uPhoto,q).rgb;
      float leaf = green(base);
      float environment = smoothstep(.36,.78,p.y) * (1.-leaf);
      float active = max(leaf, environment*.65);
      float t = uTime;
      vec2 refraction = vec2(
        sin(q.y*34.+sin(q.x*15.-t*.43)+t*.67),
        cos(q.x*31.+sin(q.y*18.+t*.37)-t*.54)
      );
      // Fine surface reflections move across the material. Keep edge details
      // crisp by limiting refraction to a few pixels, inside green surfaces.
      vec2 optical = refraction * .0026 * leaf * min(t*.45,1.);
      vec3 col = texture2D(uPhoto,q+optical).rgb;
      float lighting = water(q,t) - water(q,0.);
      col += lighting * active * vec3(.092,.087,.055);
      float sheen = sin(q.x*15.+q.y*10.-t*.9)-sin(q.x*15.+q.y*10.);
      col += sheen * leaf * vec3(.029,.032,.020);
      gl_FragColor = vec4(clamp(col,0.,1.),1.);
    }
  `;

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error);
    }
    return s;
  }
  function fallback() {
    failed = true; ready = false;
    cancelAnimationFrame(frame); frame = 0;
    canvas.classList.remove('is-ready');
    canvas.dataset.state = 'fallback';
  }
  function resize() {
    if (!ready || failed) return;
    const rect = hero.getBoundingClientRect();
    // Limit fill rate, especially on Retina/mobile. Retain the full source image.
    const ratio = Math.min(devicePixelRatio || 1, 1.5, 1800 / Math.max(rect.width,rect.height));
    canvas.width = Math.round(rect.width*ratio);
    canvas.height = Math.round(rect.height*ratio);
    gl.viewport(0,0,canvas.width,canvas.height);
    const aspect = rect.width/rect.height, source = image.width/image.height;
    gl.uniform2f(uniforms.cover, Math.min(1,aspect/source)*.9, Math.min(1,source/aspect)*.9);
    render();
  }
  function render() {
    if (!ready || failed) return;
    gl.uniform1f(uniforms.time,time);
    gl.uniform2f(uniforms.pointer,pointer[0],pointer[1]);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function tick(now) {
    frame = 0;
    if (!runnable()) {last = 0; return;}
    if (!last) last = now;
    if (now-drawn >= 1000/30) {
      const dt = Math.min((now-last)/1000,.08);
      time += dt; last = now; drawn = now;
      const ease = 1-Math.exp(-dt*3);
      pointer[0] += (target[0]-pointer[0])*ease;
      pointer[1] += (target[1]-pointer[1])*ease;
      render();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    // Reduced motion starts with the original still and no GPU allocation.
    if (!ready && !failed && !stopped()) initialize();
    if (runnable() && !frame) {last = 0; frame = requestAnimationFrame(tick);}
    else if (!runnable()) {cancelAnimationFrame(frame);frame = 0;last = 0;}
  }
  let initializing = false;
  function initialize() {
    if (initializing || ready || failed) return;
    initializing = true;
    try {
      gl = canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
      if (!gl) throw new Error('WebGL unavailable');
      const vs = shader(gl.VERTEX_SHADER,vertex), fs = shader(gl.FRAGMENT_SHADER,fragment);
      program = gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Shader linking failed');
      gl.useProgram(program);
      buffer = gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      uniforms = {time:gl.getUniformLocation(program,'uTime'),cover:gl.getUniformLocation(program,'uCover'),pointer:gl.getUniformLocation(program,'uPointer')};
      texture = gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      image = new Image();
      image.onload = () => {
        if (failed) return;
        try {
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture upload failed');
          ready = true;resize();
          canvas.classList.add('is-ready');canvas.dataset.state = 'ready';
          sync();
        } catch (_) {fallback();}
      };
      image.onerror = fallback;
      image.src = window.ACHO_HERO_TEXTURE || document.querySelector('#hero-image').src;
    } catch (_) {fallback();}
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0}).observe(hero);
  new ResizeObserver(resize).observe(hero);
  hero.addEventListener('pointermove',e=>{
    if (e.pointerType !== 'mouse' || stopped()) return;
    const rect=hero.getBoundingClientRect();
    target=[(e.clientX-rect.left)/rect.width-.5,(e.clientY-rect.top)/rect.height-.5];
  },{passive:true});
  hero.addEventListener('pointerleave',()=>{target=[0,0];},{passive:true});
  document.addEventListener('motionchange',sync);
  document.addEventListener('visibilitychange',sync);
  // main.js owns the single motion control, shared by hero and portfolio media.
  if (!reduce.matches) sync();
})();
