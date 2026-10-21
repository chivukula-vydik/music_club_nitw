// inner pages: mobile menu + the background beat (same behaviour as home: starts on the first tap or key, toggle to mute)
(function(){
  const $=id=>document.getElementById(id);
  const burger=$('burger'), menu=$('menu');
  burger.onclick=()=>{ const o=menu.classList.toggle('open'); burger.setAttribute('aria-expanded',o); burger.textContent=o?'CLOSE':'MENU'; };

  const audio=new Audio('oblivion/assets/theme.m4a'); audio.loop=true; audio.volume=.35; audio.preload='auto';
  // mute is remembered per visitor (localStorage); the old site's saved mute is wiped once so everyone hears the Oblivion track
  const ls={ get:k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set:(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} } };
  if(!ls.get('mc-mute-reset-oblivion')){ ls.set('mc-beat-muted',null); ls.set('mc-beat-unlocked',null); ls.set('mc-mute-reset-oblivion','1'); }
  let muted=ls.get('mc-beat-muted')==='1';
  const btn=$('beatBtn'); let playing=false, unlocked=false;
  const set=on=>{ playing=on; btn.classList.toggle('on',on); btn.setAttribute('aria-pressed',on); };
  const start=()=>audio.play().then(()=>set(true)).catch(()=>{});
  audio.addEventListener('error',()=>{ btn.hidden=true; });
  btn.addEventListener('click',e=>{ e.stopPropagation(); unlocked=true;
    if(playing){ audio.pause(); set(false); muted=true; ls.set('mc-beat-muted','1'); } else { muted=false; ls.set('mc-beat-muted',null); start(); } });
  const unlock=()=>{ if(unlocked||muted) return; unlocked=true; start(); };
  ['pointerdown','keydown'].forEach(t=>addEventListener(t,unlock));
})();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js");
