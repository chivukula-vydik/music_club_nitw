// Rain-on-glass background (WebGL2). Renders an image behind fogged glass with refracting drops.
// mountRainGlass(canvas, { src, rain, fog, refraction, speed }) -> destroy()

const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSharp, uBlur;
uniform vec2 uRes, uImg;
uniform float uTime, uRain, uFog, uRefr;

float ss(float a, float b, float x){ float t = clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
vec3 h31(float p){
  vec3 q = fract(vec3(p)*vec3(.1031,.11369,.13787));
  q += dot(q, q.yzx+19.19);
  return fract(vec3((q.x+q.y)*q.z,(q.x+q.z)*q.y,(q.y+q.z)*q.x));
}
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

// condensation beads that form and evaporate
float beads(vec2 uv, float t){
  uv *= 34.;
  vec2 id = floor(uv), q = fract(uv)-.5;
  vec3 n = h31(id.x*107.45 + id.y*3543.65);
  vec2 c = (n.xy-.5)*.6;
  float life = fract(t*.05 + n.z);
  float fade = ss(0.,.12,life) * (1.-ss(.65,1.,life));
  float r = mix(.06,.3,n.x*n.y) * fade + .001;
  return 1. - ss(0., r, length(q-c));
}

// drops sliding down in jerky steps; returns (height, cleared trail)
vec2 slide(vec2 uv, float t, float seed){
  const vec2 G = vec2(10., 1.6);
  const float K = G.x/G.y;
  vec2 st = uv*G;
  float col = floor(st.x);
  float v = .22 + .12*h21(vec2(col, seed+7.));          // column fall speed, cells/s
  st.y += t*v + h21(vec2(col, seed));
  vec2 id = floor(st), q = fract(st)-.5;
  vec3 n = h31(id.x*35.2 + id.y*2376.1 + seed*91.7);
  if (n.z > .75) return vec2(0.);                       // some cells stay empty
  // stick-slip: drop creeps while stuck, then slides. y never rises faster than v, so it never moves up.
  const float S = .72;
  float P = 2. + 2.5*n.y;
  float ph = fract(t/P + n.z);
  float A = min(v*P*S*.85, .6);
  float y = ph < S ? -A*.5 + A*ph/S : A*.5 - A*ss(S, 1., ph);
  float x0 = (n.x-.5)*.55;
  float px = x0 + .06*sin(q.y*9. + n.y*6.28);           // wobbly path
  float dx = x0 + .06*sin(y*9. + n.y*6.28);
  float r = mix(.16,.26,n.y);
  vec2 dq = vec2(q.x-dx, (q.y-y)*K*.85);
  float drop = 1. - ss(0., r, length(dq));
  float above = ss(y-.02, y+.04, q.y);
  float tl = above * (1. - ss(0., .7, q.y-y));
  float trail = (1. - ss(0., r*.75, abs(q.x-px))) * tl;
  float row = floor(q.y*8.);
  float m = (fract(q.y*8.)-.5)/8.;
  float dot_ = (1. - ss(0., .07, length(vec2(q.x-px, m*K)))) * tl
             * step(.35, h21(vec2(id.x+row, id.y*13.+seed)));
  return vec2(max(drop, dot_), trail);
}

float field(vec2 uv, float t, out float trail){
  vec2 a = slide(uv, t, 1.);
  vec2 b = slide(uv*1.7 + vec2(3.7,1.3), t*1.15, 2.);
  trail = clamp(max(a.y, b.y)*uRain, 0., 1.);
  float bd = beads(uv, t) * (1.-trail) * .8;
  return max(bd, max(a.x, b.x)*uRain);
}

vec2 cover(vec2 uv){
  float rs = uRes.x/uRes.y, ri = uImg.x/uImg.y;
  vec2 s = rs > ri ? vec2(1., ri/rs) : vec2(rs/ri, 1.);
  return (uv-.5)*s + .5;
}

void main(){
  vec2 uv = vUv*uRes/uRes.y;
  float t = uTime, tr, tmp;
  float e = 1.5/uRes.y;
  float h  = field(uv, t, tr);
  float hx = field(uv+vec2(e,0.), t, tmp);
  float hy = field(uv+vec2(0.,e), t, tmp);
  vec2 n = vec2(hx-h, hy-h);

  vec2 tuv = cover(vUv);
  vec2 ruv = tuv - n*uRefr*.35;                          // lens: drops show a flipped, offset view
  float wet = ss(.05, .3, h);
  float clear = max(wet, tr*.85);
  vec3 sharp = texture(uSharp, ruv).rgb;
  vec3 fogged = texture(uBlur, tuv).rgb;
  float focus = mix(1.-uFog, 1., clear);
  vec3 col = mix(fogged, sharp, focus);

  float lum = dot(fogged, vec3(.3,.59,.11));
  col = mix(col, vec3(lum)*1.1 + .012, .22*uFog*(1.-clear));   // milky condensation
  col *= 1. - .22*ss(.0,.2,h)*(1.-ss(.2,.55,h));               // dark drop rims
  vec3 nn = normalize(vec3(-n*18., 1.));
  col += pow(max(dot(nn, normalize(vec3(-.4,.6,.7))), 0.), 40.) * .5 * wet;
  o = vec4(col, 1.);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function texture(gl, source) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  return t;
}

// soft copy of the image for the fogged areas
function blurred(img, w, h) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(1px)';
  const native = ctx.filter === 'blur(1px)';
  if (native) {
    c.width = Math.round(w / 4); c.height = Math.round(h / 4);
    ctx.filter = 'blur(7px)';
    ctx.drawImage(img, -20, -20, c.width + 40, c.height + 40);
  } else {
    c.width = 48; c.height = Math.max(1, Math.round(48 * h / w));
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }
  return c;
}

export function mountRainGlass(canvas, opts = {}) {
  const o = { rain: 1, fog: 0.85, refraction: 1, speed: 1, scale: Math.min(window.devicePixelRatio || 1, 1), ...opts };
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) { const noop = () => {}; noop.set = noop; return noop; }   // no WebGL2: CSS background shows through

  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const u = { res: U('uRes'), img: U('uImg'), time: U('uTime'), rain: U('uRain'), fog: U('uFog'), refr: U('uRefr') };
  gl.uniform1i(U('uSharp'), 0);
  gl.uniform1i(U('uBlur'), 1);

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false, raf = 0, dead = false, clock = 12, last = performance.now();

  const draw = () => {
    if (dead) return;
    const w = Math.round(canvas.clientWidth * o.scale), h = Math.round(canvas.clientHeight * o.scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
    const now = performance.now();
    if (!still) clock += Math.min(now - last, 100) / 1000 * o.speed;   // accumulate so time never runs backward
    last = now;
    gl.uniform1f(u.time, clock);
    gl.uniform1f(u.rain, o.rain);
    gl.uniform1f(u.fog, o.fog);
    gl.uniform1f(u.refr, o.refraction);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!still) raf = requestAnimationFrame(draw);
  };

  const start = img => {
    if (dead) return;
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    gl.activeTexture(gl.TEXTURE0); texture(gl, img);
    gl.activeTexture(gl.TEXTURE1); texture(gl, blurred(img, w, h));
    gl.uniform2f(u.img, w, h);
    ready = true;
    draw();
  };

  if (typeof o.src === 'string') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => start(img);
    img.src = o.src;
  } else if (o.src) start(o.src);

  const ro = new ResizeObserver(() => { if (ready && still) draw(); });
  ro.observe(canvas);

  const destroy = () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  destroy.set = p => { Object.assign(o, p); if (ready && still) draw(); };   // live-tune rain/fog/refraction/speed
  return destroy;
}
