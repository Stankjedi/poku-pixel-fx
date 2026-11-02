import { encodeAnimatedWebP } from './animated-webp.js';
const main = document.querySelector('#grid');
const query = document.querySelector('#q');
const count = document.querySelector('#count');
const total = document.querySelector('#total-count');
const chips = document.querySelector('#chips');
const status = document.querySelector('#community-status');
const dialog = document.querySelector('#shared-detail');
const detailCanvas = document.querySelector('#shared-player');
const grid = document.createElement('div'); grid.className = 'grid unified-grid';
// Preserve the existing tile nodes and their player/observer bindings while removing category headings.
const existing = [...main.querySelectorAll('figure.tile')];
// Existing tiles retain their player, event and observer bindings during sorting.
main.querySelectorAll('section').forEach(s => s.classList.add('library-category-shell'));
main.prepend(grid); grid.append(...existing);
const originalOrder = new Map(existing.map((tile, index) => [tile, index]));
const builtinDates = new Map();
const sortDateStatus = document.createElement('p');
sortDateStatus.className = 'community-status'; sortDateStatus.setAttribute('role','status'); sortDateStatus.setAttribute('aria-live','polite'); sortDateStatus.hidden=true;
document.querySelector('.bar')?.append(sortDateStatus);
let ratings = new Map(), ratingsLoaded = false, ratingsFailed = false;
let items = [], category = 'all', mode = 'latest', loading = false, players = [];
const norm = s => s.normalize('NFC').toLocaleLowerCase('ko-KR');
const searchText = s => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const searchTokens = s => searchText(s).split(/\s+/u).filter(Boolean);
const sort = document.createElement('button'); sort.type='button'; sort.className='chip latest-sort'; sort.textContent='최신순'; sort.setAttribute('aria-pressed','true'); sort.title='기록된 추가일과 게시일을 기준으로 정렬하며, 날짜가 없는 작품은 뒤에 표시합니다';
const allButton = chips.querySelector('[data-cat=all]'); if (allButton) allButton.after(sort);
sort.addEventListener('click', () => window.dispatchEvent(new CustomEvent('poku-sort-change', {detail:{mode:'latest'}})));
chips.addEventListener('click', e => { const button=e.target.closest('[data-cat]'); if(!button)return; category=button.dataset.cat; render(); window.dispatchEvent(new CustomEvent('poku-sort-change', {detail:{mode}})); });
window.addEventListener('poku-sort-change', e => {
 if(e.detail?.mode !== 'latest' && e.detail?.mode !== 'rating') return;
 mode=e.detail.mode; sort.setAttribute('aria-pressed',String(mode==='latest')); sortGrid();
});
window.addEventListener('poku-ratings-updated', e => {
 const data=e.detail; if(!data || !Array.isArray(data.ratings)) return;
 ratings=new Map(data.ratings.map(item=>[item.id,item])); ratingsLoaded=!!data.loaded; ratingsFailed=!!data.failed;
 if(mode==='rating') sortGrid();
});
function dateOf(tile) {
 const text=tile.dataset.addedAt || builtinDates.get(tile.dataset.effectId) || '';
 const time=Date.parse(text); return Number.isFinite(time) ? time : -Infinity;
}
function sortGrid() {
 const before=[...grid.querySelectorAll(':scope > figure.tile')], nodes=[...before];
 const prior=new Map(nodes.map((tile,index)=>[tile, originalOrder.get(tile) ?? existing.length+index]));
 nodes.sort((a,b)=>{
   if(mode==='rating' && ratingsLoaded && !ratingsFailed) {
     const ar=ratings.get(a.dataset.ratingId || ('builtin:'+a.dataset.effectId));
     const br=ratings.get(b.dataset.ratingId || ('builtin:'+b.dataset.effectId));
     const ac=Number(ar?.count)||0, bc=Number(br?.count)||0;
     if(!!ac !== !!bc) return ac ? -1 : 1;
     if(ac && bc) { const difference=(Number(br.average)||0)-(Number(ar.average)||0); if(difference) return difference; }
   }
   const ad=dateOf(a),bd=dateOf(b); if(ad!==bd) return bd>ad ? 1 : -1;
   return prior.get(a)-prior.get(b);
 });
 if(nodes.every((tile,index)=>tile===before[index])) return;
 const focused=document.activeElement instanceof HTMLElement && grid.contains(document.activeElement) ? document.activeElement : null;
 grid.append(...nodes);
 if(focused?.isConnected) focused.focus({preventScroll:true});
}
// Metadata is optional: undated legacy effects retain their established order.
fetch('/effects/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok) throw new Error();return r.json();}).then(catalog=>{
 if(!Array.isArray(catalog.effects)) throw new Error();
 for(const item of catalog.effects) if(typeof item.id==='string' && typeof item.addedAt==='string' && Number.isFinite(Date.parse(item.addedAt))) builtinDates.set(item.id,item.addedAt);
 sortGrid();
}).catch(()=>{sortDateStatus.textContent='기본 이펙트의 추가 시각을 불러오지 못해 일부 최신순이 정확하지 않을 수 있습니다.';sortDateStatus.hidden=false;});
function animate(canvas,img,animation,time) {
  if(!img.complete || !img.naturalWidth || !animation) return;
  const {frameWidth:w, frameHeight:h, frameCount:n, fps}=animation, cols=Math.floor(img.naturalWidth/w);
  if(!w||!h||!n||!fps||!cols)return;
  const ctx=canvas.getContext('2d'); if (!ctx) return;
  const frame=Math.floor(time*fps/1000)%n; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=false;
  const scale=Math.min(canvas.width/w, canvas.height/h), dw=Math.floor(w*scale), dh=Math.floor(h*scale);
  ctx.drawImage(img,(frame%cols)*w,Math.floor(frame/cols)*h,w,h,Math.floor((canvas.width-dw)/2),Math.floor((canvas.height-dh)/2),dw,dh);
}
function render() {
 const terms=searchTokens(query.value);
 const label = category==='all' ? '' : (chips.querySelector(`[data-cat="${CSS.escape(category)}"]`)?.firstChild?.textContent || '').trim();
 const matches=items.filter(i => (!label||(i.tags||[]).some(t=>norm(t)===norm(label))) && terms.every(t => searchText([i.title,...(i.tags||[])].join(' ')).includes(t)));
 document.body.classList.toggle('has-community-results',matches.length>0);
 grid.querySelectorAll('.shared-tile').forEach(x=>x.remove()); players=[];
 const fragment=document.createDocumentFragment();
 for(const item of matches) {
   const fig=document.createElement('figure'); fig.className='tile shared-tile'; fig.dataset.ratingId='shared:'+item.id; fig.dataset.creatorModel=item.model||''; fig.dataset.addedAt=item.created||''; fig.tabIndex=0; fig.setAttribute('role','button'); fig.setAttribute('aria-label',item.title+' 상세 보기');
   const stage=document.createElement('div'); stage.className='stage';
   const canvas=document.createElement('canvas'); canvas.width=240; canvas.height=200; canvas.setAttribute('aria-label',item.title); stage.append(canvas);
   const img=new Image(); img.src='/api/share?id='+encodeURIComponent(item.id); img.decoding='async';
   if(item.animation) { const player={canvas,img,animation:item.animation}; players.push(player); img.onload=()=>animate(canvas,img,item.animation,0); }
   else { img.onload=()=> {const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false; const scale=Math.min(canvas.width/img.width,canvas.height/img.height); ctx.drawImage(img,0,0,img.width,img.height,0,0,img.width*scale,img.height*scale);}; }
   const caption=document.createElement('figcaption'); const title=document.createElement('b'); title.textContent=item.title; const detail=document.createElement('small'); detail.textContent=item.animation ? (item.animation.loop ? '반복' : `${+(item.animation.frameCount / item.animation.fps).toFixed(2)}초`) : '재생 정보 필요'; caption.append(title,detail); fig.append(stage,caption);
   const open=()=>{document.querySelector('#shared-title').textContent=item.title; document.querySelector('#shared-details').textContent=item.animation ? `${item.animation.frameCount}프레임 · ${item.animation.fps}fps · ${(item.tags||[]).map(t=>'#'+t).join(' ')}` : '재생 정보가 없는 기존 작품입니다. 작성자가 공유 갤러리에서 프레임 정보를 추가할 수 있습니다.'; document.querySelector('#shared-original').href=img.src; const png=document.querySelector('#shared-png'); png.href=img.src; png.download=item.id; document.querySelector('#shared-download-status').textContent=''; document.querySelector('#shared-webp').disabled=!item.animation; dialog._downloadName=item.id.replace(/\.png$/i,''); dialog.showModal(); dialog._player={img,animation:item.animation,started:performance.now(),paused:false,elapsed:0}; document.querySelector('#shared-play').textContent='일시 정지'; document.querySelector('.shared-controls').hidden=!item.animation;};
   fig.addEventListener('click',open); fig.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}}); fragment.append(fig);
 }
 grid.append(fragment); sortGrid(); status.textContent=items.length?'':'아직 공유 작품이 없습니다.';
}
document.querySelector('#shared-webp').onclick=async()=>{
  const button=document.querySelector('#shared-webp'), status=document.querySelector('#shared-download-status');
  const player=dialog._player, img=player?.img, animation=player?.animation;
  if(!animation) { status.textContent='애니메이션 정보가 없어 움직이는 WebP를 만들 수 없습니다. 작성자가 재생 정보를 추가해야 합니다.'; return; }
  if(!img?.complete || !img.naturalWidth || !img.naturalHeight) { status.textContent='원본 이미지를 불러온 후 다시 시도해 주세요.'; return; }
  const {frameWidth:w,frameHeight:h,frameCount:n,fps,loop}=animation;
  const cols=Math.floor(img.naturalWidth/w), rows=Math.floor(img.naturalHeight/h);
  if(!Number.isInteger(w)||!Number.isInteger(h)||!Number.isInteger(n)||!Number.isInteger(fps)||w<1||h<1||n<2||fps<1||!cols||!rows||n>cols*rows) { status.textContent='올바른 애니메이션 정보를 확인할 수 없습니다.'; return; }
  const name=dialog._downloadName||'effect';
  button.disabled=true; status.textContent='움직이는 WebP를 만드는 중…';
  try {
    const blob=await encodeAnimatedWebP({width:w,height:h,frameCount:n,fps,loop,drawFrame(index,canvas,ctx){
      if(!dialog.open||dialog._player!==player) throw new Error('cancelled');
      ctx.clearRect(0,0,w,h); ctx.imageSmoothingEnabled=false;
      ctx.drawImage(img,(index%cols)*w,Math.floor(index/cols)*h,w,h,0,0,w,h);
    },onProgress(done,total){if(dialog.open&&dialog._player===player)status.textContent=`움직이는 WebP 생성 중… ${done}/${total}`;}});
    if(!dialog.open||dialog._player!==player) return;
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name+'.webp';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='움직이는 WebP 다운로드가 시작되었습니다.';
  } catch {
    if(dialog.open&&dialog._player===player) status.textContent='움직이는 WebP를 만들지 못했습니다. 브라우저 지원 여부와 재생 정보를 확인하거나 PNG 시트를 이용해 주세요.';
  } finally { if(dialog._player===player)button.disabled=false; }
};
document.querySelector('#shared-close').onclick=()=>dialog.close();
document.querySelector('#shared-play').onclick=()=>{const p=dialog._player;if(!p||!p.animation)return;if(p.paused){if(p.finished){p.elapsed=0;p.finished=false;}p.started=performance.now()-p.elapsed;p.paused=false;document.querySelector('#shared-play').textContent='일시 정지';}else{p.elapsed=performance.now()-p.started;p.paused=true;document.querySelector('#shared-play').textContent='재생';}};
document.querySelector('#shared-replay').onclick=()=>{const p=dialog._player;if(!p)return;p.started=performance.now();p.elapsed=0;p.paused=false;p.finished=false;document.querySelector('#shared-play').textContent='일시 정지';};
function tick(time){ for(const p of players) { if(p.canvas.isConnected && p.canvas.getBoundingClientRect().bottom>=0 && p.canvas.getBoundingClientRect().top<innerHeight) animate(p.canvas,p.img,p.animation,time); } if(dialog.open && dialog._player?.animation) { const p=dialog._player; let elapsed=p.paused?p.elapsed:time-p.started; const end=p.animation.frameCount*1000/p.animation.fps; if(!p.animation.loop && elapsed>=end) { elapsed=Math.max(0,end-1000/p.animation.fps); p.elapsed=elapsed; p.paused=true; p.finished=true; document.querySelector('#shared-play').textContent='재생'; } animate(detailCanvas,p.img,p.animation,elapsed); } requestAnimationFrame(tick); } requestAnimationFrame(tick);
query.addEventListener('input',render);
async function load(){ if(loading)return; loading=true;let cursor=null; const seen=new Set(),fresh=[]; try { do {const r=await fetch('/api/share'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store'});if(!r.ok)throw new Error();const d=await r.json();fresh.push(...d.items);cursor=d.next;if(cursor&&seen.has(cursor))throw new Error();if(cursor)seen.add(cursor);}while(cursor); const changed=JSON.stringify(items)!==JSON.stringify(fresh);items=fresh;const base=Number(count.textContent);if(!base)throw new Error();total.textContent=`${base+items.length}개의 픽셀 아트 이펙트를 살펴보고 게임에 활용하세요. (기본 ${base}개 · 공유 ${items.length}개)`; const n=chips.querySelector('[data-cat=all] span');if(n)n.textContent=String(base+items.length); if(changed||!grid.querySelector('.shared-tile'))render();}catch{total.textContent=`기본 ${count.textContent}개 · 공유 작품 수를 확인하지 못했습니다.`;status.textContent='공유 작품을 불러오지 못했습니다.';}finally{loading=false;}}
window.addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});setInterval(()=>{if(!document.hidden)void load();},60000);load();
