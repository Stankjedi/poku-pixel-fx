// The gallery: every effect playing live from its own code. Tiles start when they scroll into view; a click
// opens one effect with its options, a sprite sheet and the code to use it.

import { effects, categories as catalogCategories } from "../src/fx/index.js";
import { createFrame, clearFrame, createFx, createAct, actBounds, composite, backdrop, drawActor, painterFor, stockActor, actorAlphaOf, sceneCameraOffset, PAL, BACKDROPS } from "../src/core/index.js";
import { effectsKo, tagsKo } from "../src/i18n/ko/index.js";
import { encodeAnimatedWebP } from "./animated-webp.js";

const categoryKo: Record<string, [string, string]> = {
  moves: ["공격 동작", "준비부터 회복까지 이어지는 공격"], fire: ["불", "횃불, 화염 숨결과 불기둥"], explosions: ["폭발", "폭발, 연기와 불꽃놀이"],
  water: ["물", "물보라, 폭포와 분수"], ice: ["얼음", "얼음 가시, 냉기 폭발과 빙결"], lightning: ["번개", "낙뢰, 전기 아크와 코일"],
  scifi: ["SF", "홀로그램, 보호막과 순간이동"], melee: ["근접 공격", "베기, 휘두르기와 강타"], impacts: ["충격", "타격 불꽃, 충격파와 착지"],
  projectiles: ["투사체", "총알, 로켓, 레이저와 화살"], spawn: ["출현과 소멸", "출현, 차원문과 소멸"], arcane: ["비전 마법", "차원문, 룬과 마법 탄환"],
  holy: ["신성", "치유, 후광과 빛의 기둥"], shadow: ["어둠", "저주, 공허와 영혼"], status: ["상태 효과", "화상, 빙결, 중독과 수면"],
  nature: ["자연", "독, 덩굴, 가시와 지진"], weather: ["날씨", "비, 눈, 안개와 오로라"], ui: ["UI", "레벨 상승, 숫자와 알림"],
  pickups: ["아이템 획득", "동전, 보석, 상자와 물약"], transitions: ["화면 전환", "와이프, 아이리스와 디졸브"], critters: ["작은 생물", "슬라임, 박쥐, 유령과 개구리"],
};
const categories = catalogCategories.map(c => ({ ...c, name: categoryKo[c.id]?.[0] ?? c.name, blurb: categoryKo[c.id]?.[1] ?? c.blurb }));
const backgrounds: Record<string, string> = { dark: "어둡게", ground: "바닥", sky: "하늘", light: "밝게", black: "검정", none: "투명" };
const tagLabel = (tag: string) => tagsKo[tag] ?? tag;
// Search individual terms regardless of order, including namespace separators and mixed Korean/English.
const searchText = (value: string) => value.normalize("NFC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const searchTokens = (value: string) => searchText(value).split(/\s+/u).filter(Boolean);
const palettesKo: Record<string, string> = {
  fire: "불", ember: "불씨", lava: "용암", smoke: "연기", dust: "먼지", ice: "얼음", water: "물", electric: "전기", volt: "전압",
  poison: "독", holy: "신성", heal: "치유", arcane: "비전", shadow: "그림자", blood: "피", earth: "대지", stone: "돌", gold: "금",
  leaf: "나뭇잎", wood: "나무", metal: "금속", bone: "뼈", neon: "네온", cyber: "사이버", matrix: "매트릭스", candy: "사탕", night: "밤",
};

interface GalleryMeta { name: string; desc: string; size: [number, number]; origin: [number, number]; fps: number; bg: string; loop: boolean; duration: number; tags: string[]; options: Record<string, unknown>; actor?: number | boolean }
interface GalleryEffect { id: string; cat: string; name: string; originalName: string; originalDesc: string; searchIndex: string; meta: GalleryMeta; mod: any }
interface Tile { fx: GalleryEffect; fig: HTMLElement; cv: HTMLCanvasElement; player: Player | null; visible: boolean; hover: boolean }
interface Section { c: (typeof categories)[number]; sec: HTMLElement; list: GalleryEffect[] }
// Shared submissions stay in the standalone library, but the sharing site displays
// those records from its own store so an imported source does not duplicate them.
const hideSharedSources = document.body.hasAttribute("data-exclude-shared-sources");
const FX: GalleryEffect[] = (Object.entries(effects) as [string, any][]).filter(([, mod]) => !hideSharedSources || mod.meta.sharedSource !== true).map(([id, mod]) => {
  const meta = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  const originalName = meta.name, originalDesc = meta.desc;
  const translation = effectsKo[id];
  if (translation) Object.assign(meta, translation);
  const cat = id.split("/")[0], category = categories.find(c => c.id === cat), originalCategory = catalogCategories.find(c => c.id === cat);
  const searchIndex = searchText([id, meta.name, meta.desc, originalName, originalDesc,
    category?.name ?? "", category?.blurb ?? "", originalCategory?.name ?? "", originalCategory?.blurb ?? "",
    ...meta.tags, ...meta.tags.map(tagLabel)].join(" "));
  return { id, cat, name: meta.name, originalName, originalDesc, searchIndex, mod: { ...mod, meta }, meta };
});
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let reduced = motionPreference.matches;
motionPreference.addEventListener("change", event => {
  reduced = event.matches;
  if (detail) { detail.dirty = true; detail.render(); }
  // A reduced-motion tile may now stop ticking, so clear its last offset immediately.
  for (const tile of tiles) if (tile.player) { tile.player.dirty = true; tile.player.render(); }
});
// full-screen effects (transitions, weather, impact frames) fill a 16:9 stage edge to edge instead of floating in it
const isScreen = (fx: GalleryEffect) => fx.meta.size[0] >= 320 && Math.abs(fx.meta.size[0] / fx.meta.size[1] - 16 / 9) < 0.05;
function $(s: "#detail"): HTMLDialogElement;
function $(s: "#big"): HTMLCanvasElement;
function $(s: "#d-pal"): HTMLSelectElement;
function $(s: string): HTMLElement;
function $(s: string): HTMLElement { const e = document.querySelector<HTMLElement>(s); if (!e) throw new Error(`Missing gallery element ${s}`); return e; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: Node | string | (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of Array.isArray(kids) ? kids : [kids]) e.append(k);
  return e;
}

// ---- a live effect on a canvas, at an integer scale that fits the stage
class Player {
  declare canvas: HTMLCanvasElement; declare fx: GalleryEffect; declare ctx: CanvasRenderingContext2D;
  declare opts: Record<string, any>; declare flip: boolean; declare actor: boolean; declare speed: number; declare playing: boolean;
  declare bg: string; declare bgBuf: Uint32Array | null; declare aspect: number; declare pad: number;
  declare W: number; declare H: number; declare x: number; declare y: number; declare frame: ReturnType<typeof createFrame>; declare img: ImageData;
  declare inst: any; declare acc: number; declare wait: number; declare dirty: boolean;
  constructor(canvas: HTMLCanvasElement, fx: GalleryEffect, aspect: number, pad: number) {
    Object.assign(this, { canvas, fx, ctx: canvas.getContext("2d"), opts: {}, flip: false, actor: true, speed: 1, playing: true });
    this.bg = fx.meta.bg;
    this.layout(aspect, pad);
  }
  // the art-pixel stage: the effect's canvas plus some room, stretched to the tile's aspect; CSS scales it up
  layout(aspect: number, pad: number) {
    Object.assign(this, { aspect, pad });
    // an act needs room for the whole performance, not just the effect's canvas
    const acted = this.acted, b = acted ? { ...actBounds(this.fx.mod) } : null;
    // an act happens above the floor: don't spend the tile on bricks
    if (b) b.y1 = Math.min(b.y1, 22);
    const [w, h] = b ? [b.x1 - b.x0, b.y1 - b.y0] : this.fx.meta.size, [ox, oy] = b ? [-b.x0, -b.y0] : this.fx.meta.origin;
    this.W = Math.ceil(Math.max(w * (acted ? Math.min(pad, 1.1) : pad), h * (acted ? Math.min(pad, 1.1) : pad) * aspect));
    this.H = Math.ceil(this.W / aspect);
    this.x = Math.floor((this.W - w) / 2) + ox;
    // an act stands near the bottom of its tile, with the room above it
    this.y = b ? Math.max(oy + 2, this.H - b.y1 - 2) : Math.floor((this.H - h) / 2) + oy;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // shrinking pixel art nearest-neighbour drops whole 1 px lines; smooth it only when it has to shrink
    const shown = this.canvas.getBoundingClientRect().width * devicePixelRatio;
    this.canvas.style.imageRendering = shown && shown < this.W ? "auto" : "";
    this.frame = createFrame(this.W, this.H);
    this.img = this.ctx.createImageData(this.W, this.H);
    this.setBg(this.bg);
    this.restart();
  }
  setBg(kind: string) {
    this.bg = kind;
    this.bgBuf = kind === "none" ? null : backdrop(kind, this.W, this.H, this.y);
    this.dirty = true;
  }
  // an effect with an act plays it, unless the character is switched off
  get acted() {
    return !!this.fx.mod.act && this.actor;
  }
  restart() {
    this.inst = (this.acted ? createAct : createFx)(this.fx.mod, { x: this.x, y: this.y, flip: this.flip, ...this.opts });
    this.acc = 0;
    this.wait = 0;
    this.dirty = true;
  }
  tick(dt: number) {
    const m = this.fx.meta, step = 1 / m.fps;
    if (this.playing) this.acc = Math.min(this.acc + dt * this.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      if (!m.loop && (this.acted ? this.inst.done() : this.inst.t >= m.duration)) {
        this.wait += step;
        if (this.wait > 0.45) this.restart();
      } else this.inst.update(step);
      moved = true;
    }
    if (moved || this.dirty) this.render();
  }
  seek(t: number) {
    this.restart();
    this.inst.update(t);
    this.render();
  }
  render() {
    const f = clearFrame(this.frame);
    if (this.acted) {
      this.inst.draw(f);
      composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = sceneCameraOffset(this.inst.shake, reduced, this.bg === "none");
      if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
      this.ctx.putImageData(this.img, sx, sy);
      this.dirty = false;
      return;
    }
    this.inst.draw(f, "back");
    const m = this.fx.meta, tt = m.loop ? this.inst.t % m.duration : Math.min(this.inst.t, m.duration);
    if (m.actor && this.actor) drawActor(painterFor(f).place(this.x, this.y, this.flip), this.inst.options.actor ?? stockActor(), actorAlphaOf(this.fx.mod, tt, this.inst.options));
    this.inst.draw(f, "front");
    composite(f, this.img.data, this.bgBuf);
    const [sx, sy] = sceneCameraOffset(this.inst.shake, reduced, this.bg === "none");
    if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
    this.ctx.putImageData(this.img, sx, sy);
    this.dirty = false;
  }
}

// ---- tiles
const tiles: Tile[] = [];
const sections: Section[] = [];
function build() {
  $("#count").textContent = String(FX.length);
  const main = $("#grid");
  for (const c of categories) {
    const list = FX.filter((f) => f.cat === c.id);
    if (!list.length) continue;
    const grid = el("div", { className: "grid" });
    const sec = el("section", { id: c.id }, [el("div", { className: "section-head" }, [el("h2", { textContent: c.name + "." }), el("p", { textContent: c.blurb })]), grid]);
    sections.push({ c, sec, list });
    for (const fx of list) {
      const cv = el("canvas", { ariaLabel: fx.name });
      const b = fx.mod.act ? actBounds(fx.mod) : null, [fw, fh] = b ? [b.x1 - b.x0, b.y1 - b.y0] : fx.meta.size;
      const fig = el("figure", { className: isScreen(fx) ? "tile big screen" : fw > 200 || fh > 170 || (b && (fw > 130 || fx.mod.act.target || fx.mod.act.targets)) ? "tile big" : "tile", tabIndex: 0 }, [
        el("div", { className: "stage" }, cv),
        el("figcaption", {}, [el("b", { textContent: fx.name }), el("small", { textContent: fx.meta.loop ? "반복" : `${+fx.meta.duration.toFixed(2)}초` })]),
      ]);
      fig.dataset.effectId = fx.id;
      const t = { fx, fig, cv, player: null, visible: false, hover: false };
      fig.addEventListener("click", () => openDetail(fx));
      fig.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDetail(fx)));
      fig.addEventListener("pointerenter", () => (t.hover = true));
      fig.addEventListener("pointerleave", () => (t.hover = false));
      grid.append(fig);
      tiles.push(t);
    }
    main.append(sec);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.fig === e.target);
      if (!t) continue;
      t.visible = e.isIntersecting;
      if (t.visible && !t.player) {
        t.player = isScreen(t.fx) ? new Player(t.cv, t.fx, 16 / 9, 1) : new Player(t.cv, t.fx, 6 / 5, 1.25);
        if (reduced) t.player.seek(t.fx.meta.duration * 0.4);
      }
    }
  }, { rootMargin: "200px" });
  tiles.forEach((t) => io.observe(t.fig));
}

// ---- filters
const state = { cat: "all", q: "" };
function chips() {
  const box = $("#chips");
  const mk = (id: string, label: string, n: number) => {
    const b = el("button", { className: "chip", type: "button" }, [label, el("span", { textContent: String(n) })]);
    b.dataset.cat = id;
    b.addEventListener("click", () => setCat(id));
    box.append(b);
  };
  mk("all", "전체", FX.length);
  for (const s of sections) mk(s.c.id, s.c.name, s.list.length);
}
function setCat(id: string, fromHash = false) {
  state.cat = sections.some((s) => s.c.id === id) ? id : "all";
  document.querySelectorAll<HTMLElement>(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat)));
  if (!fromHash) history.replaceState(null, "", state.cat === "all" ? location.pathname : "#" + state.cat);
  filter();
  if (!fromHash) window.scrollTo({ top: 0 });
}
function filter() {
  const words = searchTokens(state.q);
  let shown = 0;
  for (const s of sections) {
    let any = false;
    for (const fx of s.list) {
      const t = tiles.find((x) => x.fx === fx);
      const hit = (state.cat === "all" || state.cat === s.c.id) && words.every(word => fx.searchIndex.includes(word));
      if (!t) continue;
      t.fig.hidden = !hit;
      any ||= hit;
      shown += Number(hit);
    }
    s.sec.hidden = !any;
  }
  $("#none").hidden = shown > 0;
}

// ---- detail
let detail: Player | null = null;
function openDetail(fx: GalleryEffect) {
  const d = $("#detail");
  const big = $("#big"), screen = isScreen(fx);
  big.parentElement!.classList.toggle("screen", screen);
  detail = screen ? new Player(big, fx, 16 / 9, 1) : new Player(big, fx, 16 / 10, 1.6);
  const m = fx.meta;
  $("#d-name").textContent = m.name;
  $("#d-id").textContent = fx.id;
  $("#d-desc").textContent = m.desc;
  const frames = Math.round(m.duration * m.fps) + (m.loop ? 0 : 1);
  $("#d-facts").replaceChildren(
    ...[["종류", m.loop ? "반복" : "한 번 재생"], ["길이", `${+m.duration.toFixed(2)}초, ${m.fps}fps에서 ${frames}프레임`], ...(fx.mod.act ? [["동작", actFacts(fx.mod)]] : []), ["캔버스", `${m.size[0]} × ${m.size[1]}px`], ["태그", m.tags.map(tagLabel).join(", ")]].flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]),
  );
  // controls
  $("#d-bg").replaceChildren(...BACKDROPS.concat("none").map((b) => btn(backgrounds[b] ?? b, () => detail!.setBg(b), b === m.bg, "bg")));
  $("#d-speed").replaceChildren(...[0.25, 0.5, 1].map((s) => btn(`${s}×`, () => (detail!.speed = s), s === 1, "speed")));
  const pal = $("#d-pal");
  pal.replaceChildren(el("option", { value: "", textContent: "기본 색상" }), ...Object.keys(PAL).map((k) => el("option", { value: k, textContent: palettesKo[k] ?? tagLabel(k) })));
  pal.value = "";
  $("#d-actor").hidden = !m.actor;
  $("#d-actor").setAttribute("aria-pressed", "true");
  $("#d-flip").setAttribute("aria-pressed", "false");
  $("#d-play").setAttribute("aria-pressed", "true");
  $("#d-play").textContent = "일시 정지";
  $("#d-sheet").replaceChildren();
  code(fx);
  d.showModal();
  d.scrollTop = 0;
}
// what the body does around the effect, in a line: the wind-up, the freeze, the recovery
function actFacts(mod: any) {
  const k = mod.act.poses, lead = Math.max(0, -k[0][0]), end = k[k.length - 1][0] - mod.meta.duration, hits = (mod.act.hits ?? []).filter((h: { stop?: number }) => h.stop);
  const parts = [];
  if (lead > 0) parts.push(`${lead.toFixed(2)}초 준비 동작`);
  if (hits.length) parts.push(`${hits.length === 1 ? `${Math.round(hits[0].stop * 1000)}ms 정지` : `${hits.length}회 정지`} (${hits[0].t.toFixed(2)}초 시점)`);
  if (!mod.meta.loop && end > 0.02) parts.push(`${end.toFixed(2)}초 회복`);
  return parts.join(", ") || "캐릭터가 함께 움직임";
}
function btn(label: string, fn: () => void, on: boolean, group: string) {
  const b = el("button", { className: "btn", type: "button", textContent: label });
  b.setAttribute("aria-pressed", String(!!on));
  b.addEventListener("click", () => {
    if (group) b.parentElement!.querySelectorAll(".btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    fn();
  });
  return b;
}
function code(fx: GalleryEffect) {
  const v = fx.id.split("/")[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const opts = { x: 160, y: 120, ...(detail!.opts.palette ? { palette: "[…]" } : {}), ...(detail!.flip ? { flip: true } : {}) };
  const acted = !!fx.mod.act, make = acted ? "createAct" : "createFx";
  $("#d-code").textContent = [
    `import { createFrame, ${make}, composite } from "poku-pixel-fx";`,
    `import * as ${v} from "poku-pixel-fx/fx/${fx.id}";`,
    ``,
    `const frame = createFrame(320, 180);`,
    `const fx = ${make}(${v}, ${JSON.stringify(opts).replace(/"\[…\]"/, "[…]").replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")});`,
    ``,
    `// 매 프레임`,
    `fx.update(dt);`,
    `fx.draw(frame);          // 색상과 빛 버퍼`,
    `composite(frame, imageData.data, null);`,
    ...(acted ? [``, `// 캐릭터 타이밍: ${v}.act (자세, 타격, 정지)`] : []),
  ].join("\n");
}
function sheet() {
  const fx = detail!.fx, m = fx.meta, [w, h] = m.size, n = Math.max(1, Math.round(m.duration * m.fps) + (m.loop ? 0 : 1));
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w)))), rows = Math.ceil(n / cols);
  const cv = el("canvas", { width: cols * w, height: rows * h }), ctx = cv.getContext("2d")!;
  const frame = createFrame(w, h), img = ctx.createImageData(w, h);
  const inst = createFx(fx.mod, { x: m.origin[0], y: m.origin[1], ...detail!.opts, flip: detail!.flip });
  for (let i = 0; i < n; i++) {
    if (i) inst.update(1 / m.fps);
    inst.draw(clearFrame(frame));
    composite(frame, img.data, null);
    ctx.putImageData(img, (i % cols) * w, Math.floor(i / cols) * h);
  }
  const k = Math.max(1, Math.min(4, Math.floor(1100 / (cols * w))));
  const pic = el("img", { src: cv.toDataURL("image/png"), alt: `${m.name} 스프라이트 시트`, width: cols * w * k, height: rows * h * k });
  const name = fx.id.split("/").pop()!.replace(/[^a-zA-Z0-9_-]/g, "-") || "effect";
  const png = el("a", { className: "btn", href: pic.src, download: `${name}.png`, textContent: "PNG 다운로드" });
  // Prevent the hosted gallery's legacy PNG helper from adding a duplicate link.
  png.dataset.sheetDownload = "true";
  const status = el("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const webp = el("button", { className: "btn", type: "button", textContent: "움직이는 WebP 다운로드" });
  // Snapshot the detail options: export the same actor, stage, palette, flip and background
  // that the visitor sees without disturbing the live player's playback position.
  webp.addEventListener("click", async () => {
    if (webp.disabled) return;
    const current = detail;
    if (!current || current.fx !== fx) return;
    const exportOptions = { ...current.opts }, exportFlip = current.flip, exportActor = current.actor;
    const exportBg = current.bg, exportSpeed = current.speed, exportAspect = current.aspect, exportPad = current.pad;
    webp.disabled = true;
    status.textContent = "애니메이션 WebP를 준비하는 중…";
    try {
      const stage = el("canvas"), player = new Player(stage, fx, exportAspect, exportPad);
      player.opts = { ...exportOptions }; player.flip = exportFlip; player.actor = exportActor;
      player.bg = exportBg; player.layout(exportAspect, exportPad);
      const step = 1 / m.fps;
      // Count the full acted performance, including lead-in, recovery and hit-stop.
      let frameCount = Math.max(2, Math.round(m.duration * m.fps) + (m.loop ? 0 : 1));
      if (player.acted) {
        const probe = createAct(fx.mod, { x: player.x, y: player.y, flip: exportFlip, ...exportOptions });
        frameCount = 1;
        const limit = Math.ceil(m.fps * 120);
        while ((m.loop ? probe.t < m.duration : !probe.done()) && frameCount < limit) { probe.update(step); frameCount++; }
        if (frameCount >= limit) throw new Error("효과의 재생 시간이 너무 깁니다.");
      }
      const blob = await encodeAnimatedWebP({
        width: player.W, height: player.H, frameCount, fps: m.fps * exportSpeed, loop: m.loop,
        drawFrame: (i, _canvas, context) => {
          if (i) player.inst.update(step);
          player.render(); context.drawImage(stage, 0, 0);
        },
        onProgress: (done, total) => { status.textContent = `애니메이션 WebP 생성 중… ${done}/${total}`; },
      });
      const url = URL.createObjectURL(blob), link = el("a", { href: url, download: `${name}.webp` });
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "움직이는 WebP 다운로드가 시작되었습니다.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "WebP 파일을 만들지 못했습니다. PNG를 이용해 주세요.";
    } finally { webp.disabled = false; }
  });
  const downloads = el("div", { className: "row" }, [png, webp]);
  $("#d-sheet").replaceChildren(pic, downloads, status, el("p", { textContent: `${w} × ${h}px 프레임 ${n}개, 가로 ${cols}개, ${m.fps}fps, ${m.loop ? "반복 재생" : "한 번 재생"}. WebP는 현재 미리보기의 배경과 캐릭터, 재생 속도를 반영한 애니메이션입니다. 압축으로 색상이 조금 달라질 수 있습니다.` }));
}
function wireDetail() {
  const d = $("#detail");
  $("#d-close").addEventListener("click", () => d.close());
  d.addEventListener("close", () => (detail = null));
  d.addEventListener("click", (e) => e.target === d && d.close());
  $("#d-play").addEventListener("click", (e) => {
    detail!.playing = !detail!.playing;
    (e.target as HTMLElement).setAttribute("aria-pressed", String(detail!.playing));
    (e.target as HTMLElement).textContent = detail!.playing ? "일시 정지" : "재생";
  });
  $("#d-again").addEventListener("click", () => detail!.restart());
  $("#d-flip").addEventListener("click", (e) => {
    detail!.flip = !detail!.flip;
    (e.target as HTMLElement).setAttribute("aria-pressed", String(detail!.flip));
    detail!.restart();
    code(detail!.fx);
  });
  $("#d-actor").addEventListener("click", (e) => {
    detail!.actor = !detail!.actor;
    (e.target as HTMLElement).setAttribute("aria-pressed", String(detail!.actor));
    // with an act, the character is the performance: off shows the effect alone, as a sprite sheet has it
    if (detail!.fx.mod.act) detail!.layout(detail!.aspect, detail!.pad);
    detail!.dirty = true;
  });
  $("#d-seed").addEventListener("click", () => {
    detail!.opts.seed = 1 + Math.floor(Math.random() * 9999);
    detail!.restart();
  });
  $("#d-pal").addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).value) detail!.opts.palette = PAL[(e.target as HTMLInputElement).value as keyof typeof PAL];
    else delete detail!.opts.palette;
    detail!.restart();
    code(detail!.fx);
  });
  $("#d-make").addEventListener("click", sheet);
  $("#d-copy").addEventListener("click", async (e) => {
    const text = $("#d-code").textContent;
    try {
      await navigator.clipboard.writeText(text ?? "");
      (e.target as HTMLElement).textContent = "복사됨";
    } catch {
      getSelection()?.selectAllChildren($("#d-code"));
      (e.target as HTMLElement).textContent = "선택됨";
    }
    setTimeout(() => ((e.target as HTMLElement).textContent = "복사"), 1400);
  });
}

// ---- the clock
let last = performance.now();
function frameLoop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (detail) detail!.tick(dt);
  else for (const t of tiles) if (t.visible && t.player && !t.fig.hidden && (!reduced || t.hover)) t.player.tick(dt);
  requestAnimationFrame(frameLoop);
}

build();
chips();
wireDetail();
$("#q").addEventListener("input", (e) => {
  state.q = (e.target as HTMLInputElement).value;
  filter();
});
setCat(location.hash.slice(1) || "all", true);
addEventListener("hashchange", () => setCat(location.hash.slice(1) || "all", true));
requestAnimationFrame(frameLoop);
