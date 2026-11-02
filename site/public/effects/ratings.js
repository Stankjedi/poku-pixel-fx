// Ratings are stored by the server per signed-in visitor. Library IDs remain stable.
const grid = document.querySelector('#grid');
const summaries = new Map();
const widgets = new Map();
let frame = 0, loaded = false, failed = false;
const changedLocally = new Set();
const signIn = '/signin-with-chatgpt?return_to=%2Feffects%2F';
// Keep the sorting controller informed without making it request the ratings twice.
function publishRatings() {
  updateSortStatus();
  window.dispatchEvent(new CustomEvent('poku-ratings-updated', {
    detail: { ratings: Array.from(summaries.values()), loaded, failed }
  }));
}
const chips = document.querySelector('#chips');
const ratingSort = document.createElement('button');
ratingSort.type = 'button';
ratingSort.className = 'chip rating-sort';
ratingSort.textContent = '높은 별점순';
ratingSort.title = '평균 별점이 높은 작품부터 표시합니다';
ratingSort.setAttribute('aria-pressed', 'false');
const latestSort = chips?.querySelector('.latest-sort');
if (latestSort) latestSort.after(ratingSort);
else chips?.append(ratingSort);
const sortStatus = document.createElement('p');
sortStatus.className = 'rating-sort-status';
sortStatus.setAttribute('role', 'status');
sortStatus.setAttribute('aria-live', 'polite');
sortStatus.hidden = true;
document.querySelector('.bar')?.append(sortStatus);
function updateSortStatus() {
  const active = ratingSort.getAttribute('aria-pressed') === 'true';
  const message = !active ? '' : failed ? '별점 정보를 불러오지 못해 최신순으로 표시합니다.' : !loaded ? '별점 정보를 불러오는 중입니다.' : '';
  sortStatus.textContent = message;
  sortStatus.hidden = !message;
}
ratingSort.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('poku-sort-change', { detail: { mode: 'rating' } }));
});
window.addEventListener('poku-sort-change', event => {
  ratingSort.setAttribute('aria-pressed', String(event.detail?.mode === 'rating'));
  updateSortStatus();
});
function ratingKey(tile) {
  if (tile.dataset.ratingId) return tile.dataset.ratingId;
  return tile.dataset.effectId ? 'builtin:' + tile.dataset.effectId : '';
}
function paintStars(widget, value) {
  widget.stars.forEach((star, index) => {
    const fill = Math.max(0, Math.min(1, value - index));
    star.classList.toggle('is-selected', fill === 1);
    star.classList.toggle('is-half', fill === 0.5);
  });
}
function updateWidget(widget) {
  const info = summaries.get(widget.key);
  const count = Number(info?.count || 0);
  const avg = Number(info?.average || 0);
  const mine = Number(info?.mine || 0);
  widget.score.textContent = failed && !summaries.has(widget.key) ? '불러오기 실패' : (loaded || summaries.has(widget.key)) ? (count ? `${avg.toFixed(1)} (${count})` : '평가 없음') : '불러오는 중…';
  widget.score.setAttribute('aria-label', count ? `평균 ${avg.toFixed(1)}점, 평가 ${count}명` : widget.score.textContent);
  widget.buttons.forEach((button, index) => {
    const value = (index + 1) / 2;
    const selected = mine === value;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected || (!mine && index === 0) ? 0 : -1;
    button.title = `${value}점 주기${selected ? ' · 내 평가' : ''}`;
  });
  paintStars(widget, widget.preview ?? mine);
}
function setMessage(widget, text, login = false) {
  widget.message.replaceChildren();
  if (text) widget.message.append(document.createTextNode(text));
  if (login) {
    const link = document.createElement('a'); link.href = signIn; link.target = '_top'; link.textContent = 'ChatGPT 로그인';
    widget.message.append(document.createTextNode(' '), link);
  }
}
async function rate(widget, value) {
  if (widget.busy) return;
  widget.busy = true; widget.group.setAttribute('aria-busy', 'true'); setMessage(widget, '저장 중…');
  try {
    const response = await fetch('/api/ratings', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:widget.key,score:value})});
    if (response.status === 401) { setMessage(widget, '평가하려면 로그인하세요.', true); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '평가를 저장하지 못했습니다.');
    changedLocally.add(widget.key); summaries.set(widget.key, data); updateWidget(widget); setMessage(widget, ''); publishRatings();
  } catch (error) { setMessage(widget, error instanceof Error ? error.message : '평가를 저장하지 못했습니다.'); }
  finally { widget.busy = false; widget.group.removeAttribute('aria-busy'); }
}
function mount(tile) {
  const key = ratingKey(tile);
  if (!key || tile.querySelector(':scope > .rating-panel')) return;
  const panel = document.createElement('div'); panel.className = 'rating-panel';
  panel.addEventListener('click', event => event.stopPropagation());
  panel.addEventListener('keydown', event => event.stopPropagation());
  const model = document.createElement('p'); model.className = 'rating-model';
  const declared = (tile.dataset.creatorModel || '').trim();
  model.textContent = declared ? `제작 모델: ${declared} (게시자 입력)` : '';
  model.hidden = !declared;
  model.title = model.textContent;
  const score = document.createElement('p'); score.className = 'rating-summary';
  const stars = document.createElement('div'); stars.className = 'rating-stars'; stars.setAttribute('role', 'radiogroup'); stars.setAttribute('aria-label', `${tile.querySelector('figcaption b')?.textContent || '이펙트'} 별점 매기기`);
  const message = document.createElement('p'); message.className = 'rating-message'; message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
  const buttons = [], starElements = [];
  const widget = {key,score,buttons,stars:starElements,group:stars,message,busy:false,preview:null};
  for (let index = 0; index < 5; index++) {
    const star = document.createElement('span'); star.className = 'rating-star-wrap';
    const glyph = document.createElement('span'); glyph.className = 'rating-star-glyph'; glyph.setAttribute('aria-hidden','true'); glyph.textContent = '★'; star.append(glyph);
    for (let half = 1; half <= 2; half++) {
      const value = index + half / 2;
      const button = document.createElement('button'); button.type='button'; button.className=`rating-half ${half === 1 ? 'is-left' : 'is-right'}`;
      button.setAttribute('role','radio'); button.setAttribute('aria-label',`${value}점`); button.setAttribute('aria-checked','false'); button.tabIndex = -1;
      button.addEventListener('click', () => { widget.preview = null; void rate(widget,value); });
      button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { widget.preview = value; paintStars(widget,value); } });
      button.addEventListener('keydown', event => {
        let next = value;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5,value + 0.5);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0.5,value - 0.5);
        else if (event.key === 'Home') next = 0.5;
        else if (event.key === 'End') next = 5;
        else return;
        event.preventDefault(); event.stopPropagation();
        if (widget.busy) return;
        widget.preview = null;
        widget.buttons[next * 2 - 1].focus(); void rate(widget,next);
      });
      star.append(button); buttons.push(button);
    }
    stars.append(star); starElements.push(star);
  }
  stars.addEventListener('pointerleave', () => { widget.preview = null; updateWidget(widget); });
  panel.append(model,score,stars,message); tile.append(panel); widgets.set(tile,widget); updateWidget(widget);
}
function scan() { frame = 0; for (const tile of widgets.keys()) if (!tile.isConnected) widgets.delete(tile); grid?.querySelectorAll('figure.tile').forEach(mount); }
function schedule() { if (!frame) frame = requestAnimationFrame(scan); }
if (grid) {
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('figure.tile') || node.querySelector('figure.tile'))))) schedule();
  }).observe(grid,{childList:true,subtree:true});
  scan();
  fetch('/api/ratings',{cache:'no-store'}).then(async r => {if (!r.ok) throw new Error(); return r.json();}).then(data => {
    if (!Array.isArray(data.ratings)) throw new Error();
    loaded = true; for (const item of data.ratings) if (item && typeof item.id === 'string' && !changedLocally.has(item.id)) summaries.set(item.id,item);
    for (const [tile, widget] of widgets) { if (!tile.isConnected) widgets.delete(tile); else updateWidget(widget); }
    publishRatings();
  }).catch(() => { failed = true; for (const [tile,widget] of widgets) { if (!tile.isConnected) widgets.delete(tile); else updateWidget(widget); } publishRatings(); });
}
