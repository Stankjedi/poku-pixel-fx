import {
  createPixelArtAnimation2D, parsePixelArtAnimation2D, serializePixelArtAnimation2D,
  replacePixelArtAnimationFrame2D, addPixelArtAnimationFrame2D, duplicatePixelArtAnimationFrame2D,
  removePixelArtAnimationFrame2D, movePixelArtAnimationFrame2D, updatePixelArtAnimationFrame2D,
  createPixelArtAnimationTimeline2D, createPixelArtOnionSkin2D,
  exportPixelArtAnimationSheet2D, exportPixelArtAnimationClip2D, PixelArtAnimationHistory2D,
  validatePixelArtAnimation2D,
  type PixelArtAnimation2D, type PixelArtAnimationFrame2D,
} from '../src/authoring/pixel-art-animation.js';
import { renderPixelArtDocument2D, nextPixelArtLayerId2D, type PixelArtDocument2D, type PixelArtDocumentRaster2D } from '../src/authoring/pixel-art-document.js';
import { extractPixelAnimationPalette2D } from '../src/core/pixel-palette.js';
import { sortPixelColorsByLightness2D } from '../src/core/pixel-color-edit.js';
import { encodeRGBAPNG } from './png.js';

interface TimelineHost {
  outputDocument(): PixelArtDocument2D;
  restore(document: PixelArtDocument2D, raster?: PixelArtDocumentRaster2D): void;
  finishStroke(): void;
  palette(): readonly number[];
  setPalette(colors: number[]): void;
  refresh(): void;
  status(message: string, error?: boolean): void;
  download(blob: Blob, filename: string): void;
  filename(): string;
}
const el = (id: string) => document.getElementById(id)!;
const field = (id: string) => el(id) as HTMLInputElement;
const select = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
const active = (animation: PixelArtAnimation2D) => animation.frames.find(frame => frame.id === animation.activeFrameId)!;

function draw(canvas: HTMLCanvasElement, sprite: PixelArtDocumentRaster2D, thumbnail = false) {
  const source = thumbnail ? document.createElement('canvas') : canvas;
  source.width = sprite.w; source.height = sprite.h;
  const ctx = source.getContext('2d')!, pixels = ctx.createImageData(sprite.w, sprite.h);
  for (let i = 0; i < sprite.pixels.length; i++) {
    const c = sprite.pixels[i]; pixels.data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, sprite.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  if (thumbnail) {
    canvas.width = 56; canvas.height = 56; const output = canvas.getContext('2d')!; output.imageSmoothingEnabled = false;
    const scale = Math.min(52 / source.width, 52 / source.height), w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    output.drawImage(source, Math.floor((56 - w) / 2), Math.floor((56 - h) / 2), w, h);
  }
}

/** The existing v2 still-image editor is embedded unchanged into each independently editable cel. */
export function installPixelArtTimeline(host: TimelineHost) {
  let state: PixelArtAnimation2D | undefined, history: PixelArtAnimationHistory2D | undefined;
  let version = 0, syncedVersion = -1, onionVersion = '', playing = false, raf = 0, started = 0, lastPlaybackIndex = -1;
  let clock: ReturnType<typeof createPixelArtAnimationTimeline2D> | undefined;
  let playbackFrames: PixelArtDocumentRaster2D[] | undefined;
  const cache = new Map<string, { document: PixelArtDocument2D; sprite: PixelArtDocumentRaster2D; bytes: number }>();
  let cacheBytes = 0;
  const dirtyThumbnails = new Set<string>();
  const result = el('result') as HTMLCanvasElement;
  const onion = document.createElement('canvas'); onion.className = 'onion-overlay'; onion.setAttribute('aria-hidden', 'true');
  result.parentElement!.insertBefore(onion, result);
  const player = el('animation-preview') as HTMLCanvasElement;
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  function rasterForFrame(frame: PixelArtAnimationFrame2D) {
    const old = cache.get(frame.id);
    const sameRaster = old && (old.document === frame.document || old.document.width === frame.document.width && old.document.height === frame.document.height
      && old.document.pixels === frame.document.pixels && old.document.mask === frame.document.mask && old.document.channels === frame.document.channels && old.document.layers === frame.document.layers);
    if (sameRaster) { cache.delete(frame.id); cache.set(frame.id, old); return old.sprite; }
    const sprite = renderPixelArtDocument2D(frame.document);
    if (old) { cache.delete(frame.id); cacheBytes -= old.bytes; }
    const bytes = sprite.pixels.byteLength + sprite.mask.data.byteLength + (sprite.channels ? sprite.channels.material.byteLength + sprite.channels.height.byteLength + sprite.channels.normal.byteLength : 0);
    // Thumbnails are independent 56px canvases. Full cels have a separate 32 MiB LRU budget.
    while (cache.size && cacheBytes + bytes > 32 * 1024 * 1024) {
      const [key, entry] = cache.entries().next().value!; cache.delete(key); cacheBytes -= entry.bytes;
    }
    if (bytes <= 32 * 1024 * 1024) { cache.set(frame.id, { document: frame.document, sprite, bytes }); cacheBytes += bytes; }
    return sprite;
  }
  function frameRaster(index: number) { return rasterForFrame(state!.frames[index]); }
  function stop() {
    playing = false; cancelAnimationFrame(raf); raf = 0; lastPlaybackIndex = -1;
    button('play-animation').textContent = '재생'; button('play-animation').setAttribute('aria-pressed', 'false');
  }
  function showActive(raster?: PixelArtDocumentRaster2D) {
    if (!state) return;
    const frame = active(state);
    host.restore(frame.document, raster ?? rasterForFrame(frame)); version++; clock = undefined; host.refresh();
  }
  function ensure() {
    if (!state) {
      const next = createPixelArtAnimation2D(host.outputDocument()), raster = rasterForFrame(active(next));
      const nextHistory = new PixelArtAnimationHistory2D(next);
      state = next; history = nextHistory;
      for (const frame of state.frames) dirtyThumbnails.add(frame.id);
      showActive(raster);
    }
    return state;
  }
  function commit(next: PixelArtAnimation2D, allDirty = false) {
    stop();
    // Render the candidate before changing either document or undo state. A rejected
    // expensive material setting must not leave the timeline on a different cel.
    const raster = rasterForFrame(active(next));
    if (history!.commit(next)) {
      playbackFrames=undefined;
      // Editing APIs already return immutable snapshots. Reading history.value here
      // would clone every cel and invalidate the cache on every brush stroke.
      state = next;
      const ids = new Set(state.frames.map(frame => frame.id));
      for (const [id, entry] of cache) if (!ids.has(id)) { cache.delete(id); cacheBytes -= entry.bytes; }
      if (allDirty) for (const frame of state.frames) dirtyThumbnails.add(frame.id);
      else dirtyThumbnails.add(state.activeFrameId);
      showActive(raster);
    }
  }
  function capture() {
    host.finishStroke();
    if (state) commit(replacePixelArtAnimationFrame2D(state, host.outputDocument()));
  }
  function choose(id: string) {
    capture(); if (!state || state.activeFrameId === id) return;
    const candidate = state.frames.find(frame => frame.id === id);
    if (!candidate) throw new RangeError('선택할 프레임을 찾을 수 없습니다.');
    const raster = rasterForFrame(candidate);
    stop(); history!.selectFrame(id); state = { ...state, activeFrameId: id }; showActive(raster);
  }
  function play() {
    capture(); ensure(); stop(); clock = createPixelArtAnimationTimeline2D(state!);
    // Only visible color/mask are retained for playback (at most 40 MiB under the
    // animation's aggregate native-cell budget). Geometry stays in the separate LRU.
    // Material baking and layer replay never run inside the animation callback.
    playbackFrames ??= state!.frames.map((_, i) => {
      const sprite=frameRaster(i); return {w:sprite.w,h:sprite.h,pixels:sprite.pixels,mask:sprite.mask};
    });
    started = performance.now(); playing = true;
    button('play-animation').textContent = '정지'; button('play-animation').setAttribute('aria-pressed', 'true');
    const tick = (now: number) => {
      if (!playing || !state || !clock) return;
      try {
        const elapsed = now - started, finished = !state.loop && elapsed >= clock.durationMs;
        const index = finished ? clock.frameAtPhase(1) : clock.frameAt(elapsed);
        if (index >= 0 && index !== lastPlaybackIndex) { draw(player, playbackFrames![index]); lastPlaybackIndex = index; }
        const time = finished ? clock.durationMs : elapsed % clock.durationMs;
        el('animation-playhead').textContent = `${index + 1} / ${state.frames.length} · ${Math.floor(time)} ms`;
        if (finished) { stop(); return; }
        raf = requestAnimationFrame(tick);
      } catch (error) { stop(); host.status(error instanceof Error ? error.message : String(error), true); }
    };
    raf = requestAnimationFrame(tick);
  }
  button('play-animation').onclick = () => attempt(() => playing ? stop() : play());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  button('add-frame').onclick = () => attempt(() => { capture(); commit(addPixelArtAnimationFrame2D(ensure())); });
  button('duplicate-frame').onclick = () => attempt(() => { capture(); commit(duplicatePixelArtAnimationFrame2D(ensure())); });
  button('remove-frame').onclick = () => attempt(() => { capture(); commit(removePixelArtAnimationFrame2D(ensure()), true); });
  for (const [id, delta] of [['frame-left', -1], ['frame-right', 1]] as const) button(id).onclick = () => attempt(() => {
    capture(); const animation = ensure(), index = animation.frames.findIndex(frame => frame.id === animation.activeFrameId);
    if (index + delta >= 0 && index + delta < animation.frames.length) commit(movePixelArtAnimationFrame2D(animation, animation.activeFrameId, index + delta));
  });
  field('frame-duration').onchange = () => attempt(() => {
    const durationMs = Number(field('frame-duration').value); capture(); const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { durationMs }));
  });
  field('frame-name').onchange = () => attempt(() => {
    const name = field('frame-name').value.trim(); capture(); const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { name }));
  });
  for (const id of ['animation-loop', 'animation-direction']) el(id).addEventListener('change', () => attempt(() => {
    const loop = field('animation-loop').checked, direction = select('animation-direction').value as PixelArtAnimation2D['direction'];
    capture(); commit({ ...ensure(), loop, direction });
  }));
  for (const id of ['onion-skin', 'onion-opacity']) el(id).addEventListener('input', () => { onionVersion = ''; sync(); });

  button('extract-animation-palette').onclick = () => attempt(() => {
    capture(); const animation = ensure(), count = Number(field('palette-count').value);
    const palette = extractPixelAnimationPalette2D(animation.frames.map((frame, i) => ({ sprite: frameRaster(i), duration: frame.durationMs })), { colors: count, weighting: 'equal-frame' });
    if (!palette.length) throw new Error('색을 추출할 프레임이 비어 있습니다.');
    host.setPalette(sortPixelColorsByLightness2D(palette)); el('palette-note').textContent = `${animation.frames.length}개 프레임에서 공통 ${palette.length}색을 추출해 명도순으로 정렬했습니다.`;
  });
  button('apply-animation-palette').onclick = () => attempt(() => {
    capture(); const animation = ensure(), palette = [...host.palette()];
    const frames = animation.frames.map(frame => {
      const doc = frame.document, id = nextPixelArtLayerId2D(doc, 'palette');
      const document: PixelArtDocument2D = { ...doc, workingPalette:[...palette], activeLayerId: id, layers: [...doc.layers, { kind: 'palette', id, name: `공통 팔레트 · ${palette.length}색`, palette,
        dither: select('palette-dither').value as 'none' | 'bayer4' | 'bayer8', strength: 1,
        ...(doc.protectedMask ? { protectedMask: doc.protectedMask } : {}) }] };
      return { ...frame, document };
    });
    commit({ ...animation, frames }, true);
  });
  button('save-animation-sheet').onclick = () => attempt(() => {
    const requestedColumns = Number(field('sheet-columns').value), padding = Number(field('sheet-padding').value);
    capture(); const animation = ensure(), columns = Math.min(animation.frames.length, requestedColumns);
    const sheet = exportPixelArtAnimationSheet2D(animation, { columns, padding }), filename = host.filename();
    const manifest = { ...sheet.manifest, image: filename + '-sheet.png' };
    void encodeRGBAPNG(sheet.sprite.w, sheet.sprite.h, sheet.rgba).then(blob => {
      host.download(blob, filename + '-sheet.png');
      host.download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), filename + '-sheet.json');
    }).catch(error => host.status(String(error), true));
  });
  button('save-animation-clip').onclick = () => attempt(() => {
    capture(); host.download(new Blob([JSON.stringify(exportPixelArtAnimationClip2D(ensure()))], { type: 'application/json' }), host.filename() + '.sprite-clip.json');
  });
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' && state) { event.preventDefault(); attempt(() => playing ? stop() : play()); }
    if (state && (event.key === ',' || event.key === '.')) {
      event.preventDefault(); const index = state.frames.findIndex(frame => frame.id === state!.activeFrameId), next = index + (event.key === ',' ? -1 : 1);
      if (state.frames[next]) attempt(() => choose(state!.frames[next].id));
    }
  });
  function sync() {
    el('timeline-state').textContent = state ? `${state.frames.length} FRAMES` : 'STILL IMAGE';
    if (syncedVersion !== version) {
      syncedVersion = version;
      const rows = new Map(Array.from(el('frame-list').querySelectorAll<HTMLButtonElement>('button')).map(row => [row.dataset.frameId!, row]));
      el('frame-list').replaceChildren(...(state?.frames ?? []).map((frame, i) => {
        let row = rows.get(frame.id);
        if (!row) {
          row = document.createElement('button'); row.type = 'button'; row.className = 'frame-card'; row.dataset.frameId = frame.id;
          row.append(document.createElement('canvas'), document.createElement('strong'), document.createElement('span'));
          row.onclick = () => attempt(() => choose(frame.id)); dirtyThumbnails.add(frame.id);
        }
        row.classList.toggle('active', frame.id === state!.activeFrameId); row.setAttribute('aria-pressed', String(frame.id === state!.activeFrameId));
        row.setAttribute('aria-label', `${i + 1}. ${frame.name} · ${frame.durationMs} ms`);
        row.querySelector('strong')!.textContent = `${i + 1} · ${frame.name}`; row.querySelector('span')!.textContent = `${frame.durationMs} ms`;
        if (dirtyThumbnails.has(frame.id)) draw(row.querySelector('canvas')!, frameRaster(i), true);
        return row;
      }));
      dirtyThumbnails.clear();
      const frame = state ? active(state) : undefined;
      field('frame-duration').value = String(frame?.durationMs ?? 100); field('frame-name').value = frame?.name ?? 'Frame 1';
      field('animation-loop').checked = state?.loop ?? true; select('animation-direction').value = state?.direction ?? 'forward';
      const index = state?.frames.findIndex(frame => frame.id === state!.activeFrameId) ?? 0;
      button('remove-frame').disabled = !state || state.frames.length <= 1; button('frame-left').disabled = !state || index === 0;
      button('frame-right').disabled = !state || index === state.frames.length - 1;
      if (state && !playing) { draw(player, frameRaster(index)); el('animation-playhead').textContent = `${index + 1} / ${state.frames.length}`; }
    }
    const key = `${version}:${field('onion-skin').checked}:${field('onion-opacity').value}`;
    if (key !== onionVersion) {
      onionVersion = key;
      onion.hidden = !state || !field('onion-skin').checked;
      if (state && !onion.hidden) {
        const index = state.frames.findIndex(frame => frame.id === state!.activeFrameId);
        // Only the adjacent cels are rendered for onion skin, regardless of timeline length.
        const neighbors: PixelArtDocumentRaster2D[] = [], previous = Math.max(0, index - 1), next = Math.min(state.frames.length - 1, index + 1);
        for (let i = previous; i <= next; i++) neighbors.push(frameRaster(i));
        draw(onion, createPixelArtOnionSkin2D(neighbors, index - previous, { previous: 1, next: 1, opacity: Number(field('onion-opacity').value) }));
      }
    }
    onion.style.width = result.style.width; onion.style.height = result.style.height;
    if (state) { button('undo').disabled = !history!.canUndo; button('redo').disabled = !history!.canRedo; }
  }
  return {
    get enabled() { return !!state; },
    sync, stop,
    /** One transaction for every cel; a failed mapping never commits a partial sequence. */
    editDocuments(edit:(document:PixelArtDocument2D)=>PixelArtDocument2D):number|undefined {
      if(!state)return undefined;
      host.finishStroke();
      const current=replacePixelArtAnimationFrame2D(state,host.outputDocument());
      let changed=0;
      const frames=current.frames.map(frame=>{
        const document=edit(frame.document);if(document!==frame.document)changed++;
        return document===frame.document?frame:{...frame,document};
      });
      if(changed)commit({...current,frames},true);
      return changed;
    },
    /** Sheet import is undoable, including when the preceding artwork was a still image. */
    importAnimation(animation:PixelArtAnimation2D) {
      const next=validatePixelArtAnimation2D(animation);
      if(next.width>4096||next.height>4096)throw new RangeError('가져올 프레임은 가로·세로 4096픽셀 이하로 지정해 주세요.');
      renderPixelArtDocument2D(active(next).document);
      serializePixelArtAnimation2D(next);
      capture();ensure();commit(next,true);
    },
    commitFrame(document: PixelArtDocument2D) { if (state) commit(replacePixelArtAnimationFrame2D(state, document)); },
    newDocument(document: PixelArtDocument2D) { if (state) commit(createPixelArtAnimation2D(document), true); },
    close() { stop(); state = undefined; history = undefined; playbackFrames=undefined; cache.clear(); cacheBytes = 0; version++; onionVersion = ''; player.getContext('2d')!.clearRect(0,0,player.width,player.height);el('animation-playhead').textContent='프레임을 추가하거나 복제하세요';host.refresh(); },
    open(json: string) {
      const next = parsePixelArtAnimation2D(json);
      if(next.width>4096||next.height>4096)throw new RangeError('브라우저 작업실에서는 가로·세로 4096픽셀 이하의 프로젝트를 사용해 주세요.');
      const raster = renderPixelArtDocument2D(active(next).document), nextHistory = new PixelArtAnimationHistory2D(next);
      stop(); playbackFrames=undefined;state = next; history = nextHistory;
      cache.clear(); cacheBytes = 0; for (const frame of state.frames) dirtyThumbnails.add(frame.id); showActive(raster);
    },
    serialize() { return state ? serializePixelArtAnimation2D(replacePixelArtAnimationFrame2D(state, host.outputDocument())) : undefined; },
    undo() { if (history) { stop(); playbackFrames=undefined;state = history.undo(); for (const frame of state.frames) dirtyThumbnails.add(frame.id); showActive(); } },
    redo() { if (history) { stop(); playbackFrames=undefined;state = history.redo(); for (const frame of state.frames) dirtyThumbnails.add(frame.id); showActive(); } },
  };
}
