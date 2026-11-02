'use client';
import BulkTools from './bulk-tools';
import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';

type Animation = {frameWidth:number; frameHeight:number; frameCount:number; fps:number; loop:boolean};
type Item = { id: string; title: string; created: string; owned: boolean; tags: string[]; animation: Animation | null; model?: string | null };
type Result = { items: Item[]; next: string | null; error?: string };
const box: React.CSSProperties = { background: '#15131d', border: '1px solid #393449', padding: '1rem', borderRadius: 8 };
const button: React.CSSProperties = { background: '#f7eaf8', color: '#120d18', border: 0, padding: '.65rem .9rem', borderRadius: 6, cursor: 'pointer', fontWeight: 700 };
function AnimationFields({animation}: {animation?: Animation | null}) {
  async function importJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0], form = e.currentTarget.form;
    if (!file || !form || file.size > 1024*1024) return;
    try {
      const json = JSON.parse(await file.text()); const frames = Array.isArray(json.frames) ? json.frames : Object.values(json.frames || {});
      const first = frames[0] as {frame?: {w?: number; h?: number}; duration?:number};
      const fx = json.meta?.pokuFx;
      const values: Record<string,number> = {frameWidth: first.frame?.w ?? fx?.frameWidth, frameHeight: first.frame?.h ?? fx?.frameHeight, frameCount: frames.length, fps: Math.round(fx?.fps || 1000 / (first.duration || 0))};
      if (Object.values(values).some(v => !Number.isInteger(v) || v <= 0)) throw new Error();
      for (const [name,value] of Object.entries(values)) { const input = form.elements.namedItem(name) as HTMLInputElement | null; if (input) input.value = String(value); }
      const loop = form.elements.namedItem('loop') as HTMLSelectElement | null; if (loop && typeof fx?.loop === 'boolean') loop.value = fx.loop ? 'yes' : 'no';
    } catch { alert('프레임 정보를 읽지 못했습니다. 값을 직접 입력하세요.'); }
  }
  return <fieldset style={{display:'grid',gap:'.5rem',border:'1px solid #544a60',padding:'.8rem'}}>
    <legend>애니메이션 설정</legend>
    <label>시트 JSON 가져오기 (선택) <input type="file" accept=".json,application/json" onChange={importJson}/></label>
    <small>간격 없는 격자 시트를 왼쪽부터 재생합니다. Poku JSON을 선택하거나 값을 입력하세요.</small>
    <label>프레임 너비 (px) <input name="frameWidth" type="number" min={1} max={2048} required defaultValue={animation?.frameWidth ?? ''}/></label>
    <label>프레임 높이 (px) <input name="frameHeight" type="number" min={1} max={2048} required defaultValue={animation?.frameHeight ?? ''}/></label>
    <label>프레임 수 <input name="frameCount" type="number" min={2} max={4096} required defaultValue={animation?.frameCount ?? ''}/></label>
    <label>재생 방식 <select name="loop" defaultValue={animation?.loop ? "yes" : "no"}><option value="no">1회 재생</option><option value="yes">반복</option></select></label>
    <label>초당 프레임 (FPS) <input name="fps" type="number" min={1} max={60} required defaultValue={animation?.fps ?? ''}/></label>
  </fieldset>;
}
function AnimatedPreview({item}: {item: Item}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const a=item.animation, c=canvas.current; if (!a || !c) return;
    let animation=0, alive=true; const img=new Image(); img.src='/api/share?id='+encodeURIComponent(item.id); img.onload=()=>{
      if (!alive) return; c.width=a.frameWidth; c.height=a.frameHeight; const ctx=c.getContext('2d'); if(!ctx) return;
      const cols=Math.floor(img.width/a.frameWidth), start=performance.now();
      const tick=(now:number)=>{ const f=Math.floor((now-start)*a.fps/1000)%a.frameCount; ctx.clearRect(0,0,c.width,c.height); ctx.imageSmoothingEnabled=false; ctx.drawImage(img,(f%cols)*a.frameWidth,Math.floor(f/cols)*a.frameHeight,a.frameWidth,a.frameHeight,0,0,a.frameWidth,a.frameHeight); animation=requestAnimationFrame(tick); }; animation=requestAnimationFrame(tick);
    }; return ()=>{alive=false; cancelAnimationFrame(animation);};
  },[item.id,item.animation]);
  return item.animation ? <canvas ref={canvas} aria-label={item.title + ' 애니메이션'} style={{width:'100%',height:220,objectFit:'contain',imageRendering:'pixelated',background:'#08070a'}}/> : <><img src={'/api/share?id='+encodeURIComponent(item.id)} alt={item.title} style={{width:'100%',maxHeight:220,objectFit:'contain',imageRendering:'pixelated'}}/><p>재생 정보가 없습니다. 작성자가 수정에서 설정해 주세요.</p></>;
}
export default function SharedGallery({ signedIn, signInPath }: { signedIn: boolean; signInPath: string }) {
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [message, setMessage] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  async function load(next?: string) {
    setLoading(true);
    try {
      const r = await fetch('/api/share' + (next ? '?cursor=' + encodeURIComponent(next) : ''), { cache: 'no-store' });
      const data = await r.json() as Result;
      if (!r.ok) throw new Error(data.error || '목록을 불러오지 못했습니다.');
      setItems(old => next ? [...old, ...data.items] : data.items); setCursor(data.next);
    } catch (e) { setMessage(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form), file = data.get('file');
    if (!(file instanceof File) || file.type !== 'image/png' || file.size > 5 * 1024 * 1024) { setMessage('PNG 파일을 5MB 이하로 선택하세요.'); return; }
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/share', { method: 'POST', body: data }); const result = await r.json() as { error?: string };
      if (!r.ok) throw new Error(result.error || '게시하지 못했습니다.');
      form.reset(); setMessage('공개 갤러리에 게시했습니다.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : '게시하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function quickSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    const chosen = data.getAll('bundle').filter((item): item is File => item instanceof File && item.size > 0);
    const pngs = chosen.filter(item => /\.png$/i.test(item.name));
    const jsons = chosen.filter(item => /\.json$/i.test(item.name));
    setBusy(true); setMessage('');
    try {
      if (chosen.length !== 2 || pngs.length !== 1 || jsons.length !== 1) throw new Error('PNG 하나와 같은 이름의 JSON 하나를 함께 선택하세요.');
      const png = pngs[0], json = jsons[0];
      if (png.name.replace(/\.png$/i, '').toLocaleLowerCase() !== json.name.replace(/\.json$/i, '').toLocaleLowerCase()) throw new Error('PNG와 JSON의 파일 이름이 같아야 합니다.');
      if (png.type !== 'image/png' || png.size > 5 * 1024 * 1024 || json.size > 1024 * 1024) throw new Error('PNG는 5MB, JSON은 1MB 이하여야 합니다.');
      const metadata = JSON.parse(await json.text());
      const frames = Array.isArray(metadata.frames) ? metadata.frames : Object.values(metadata.frames || {});
      const first = frames[0] as {frame?: {w?: number; h?: number}; duration?: number} | undefined;
      const fx = metadata.meta?.pokuFx;
      const values: Record<string, number> = { frameWidth: Number(first?.frame?.w ?? fx?.frameWidth), frameHeight: Number(first?.frame?.h ?? fx?.frameHeight), frameCount: frames.length, fps: Math.round(Number(fx?.fps) || 1000 / Number(first?.duration)) };
      if (Object.values(values).some(v => !Number.isInteger(v) || v <= 0)) throw new Error('JSON의 재생 정보를 읽지 못했습니다.');
      data.delete('bundle'); data.set('file', png);
      for (const [name, value] of Object.entries(values)) data.set(name, String(value));
      data.set('loop', fx?.loop === true ? 'yes' : 'no');
      const r = await fetch('/api/share', { method: 'POST', body: data }); const result = await r.json() as {error?: string};
      if (!r.ok) throw new Error(result.error || '게시하지 못했습니다.');
      form.reset(); setQuickTitle(''); setMessage('공개 갤러리에 게시했습니다.'); await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : '파일을 읽거나 게시하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function saveEdit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setMessage('');
    try { const r = await fetch('/api/share?id=' + encodeURIComponent(id), {method:'PATCH', body:data}); const result = await r.json() as {error?:string};
      if (!r.ok) throw new Error(result.error || '수정하지 못했습니다.');
      setEditing(null); setMessage('작품을 수정했습니다.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : '수정하지 못했습니다.'); } finally { setBusy(false); }
  }
  async function erase(id: string) {
    if (!window.confirm('이 게시물을 삭제할까요? 공개 이미지가 제거됩니다.')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/share?id=' + encodeURIComponent(id), { method: 'DELETE' });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error || '삭제하지 못했습니다.');
      setItems(old => old.filter(item => item.id !== id)); setMessage('게시물을 삭제했습니다.');
    } catch (e) { setMessage(e instanceof Error ? e.message : '삭제하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: '100vh', background: '#09080c', color: '#f8f4ff', fontFamily: 'system-ui, sans-serif', padding: '2rem max(1rem, calc((100vw - 1120px)/2))' }}>
    <a href="/effects/index.html" style={{ color: '#eca6e7' }}>← 이펙트 갤러리</a>
    <p><a href="https://github.com/Stankjedi/poku-pixel-fx" style={{ color: '#eca6e7' }}>Poku Pixel FX 저장소와 라이선스 안내</a></p>
    <p>권리 침해나 부적절한 게시물을 발견했다면 <a href="https://github.com/Stankjedi/poku-pixel-fx/issues" style={{ color: '#eca6e7' }}>저장소 이슈</a>에 해당 작품의 원본 URL과 문제 설명을 남겨 주세요. 공개 이슈에는 개인정보를 적지 마세요.</p>
    <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.6rem)', marginBottom: '.4rem' }}>공유 갤러리</h1>
    <p style={{ color: '#b8adbf', lineHeight: 1.6 }}>직접 제작하거나 게시 권한을 가진 픽셀 이펙트를 함께 살펴보세요.</p>
    <section style={{ ...box, margin: '2rem 0' }} aria-labelledby="upload-title">
      <h2 id="upload-title">작품 공개하기</h2>
      <p>픽셀 이펙트와 스프라이트 시트만 게시해 주세요. PNG 한 장당 최대 5MB, 가로·세로 각각 최대 2048픽셀입니다.</p>
      <p>계정당 최대 50개를 보관할 수 있으며, 업로드 시도는 10분에 5회, 24시간에 20회로 제한됩니다.</p>
      <p style={{ color: '#b8adbf', fontSize: '.9rem' }}>서버는 형식과 해상도를 제한하지만, 작품이 픽셀 아트인지 자동으로 완벽하게 판별하지는 못합니다.</p>
      {!signedIn ? <p><a href={signInPath} target="_top" style={{ color: '#eca6e7' }}>ChatGPT로 로그인하고 게시하기</a></p> : <><p>에이전트에게 Poku Pixel FX 저장소의 스킬을 사용해 스프라이트 시트 PNG와 JSON을 만들어 달라고 요청하세요. 두 파일을 함께 선택하면 재생 정보가 자동으로 설정됩니다.</p>
      <form onSubmit={quickSubmit} style={{display:'grid',gap:'.8rem',maxWidth:640}}>
        <label>PNG와 같은 이름의 JSON <input name="bundle" type="file" accept=".png,.json,image/png,application/json" multiple required onChange={e => { const png = Array.from(e.currentTarget.files || []).find(file => /\.png$/i.test(file.name)); if (png) setQuickTitle(png.name.replace(/\.png$/i, '').slice(0,80)); }} /></label>
        <label>작품 제목 <input name="title" required maxLength={80} value={quickTitle} onChange={e => setQuickTitle(e.target.value)} /></label>
        <label>태그 (선택) <input name="tags" placeholder="예: 불, 마법" maxLength={167}/></label>
        <label>제작 모델 (선택) <input name="model" maxLength={80} placeholder="예: 사용한 모델명" /><small>직접 확인한 모델만 입력하세요. 비워 두면 표시되지 않습니다.</small></label>
        <label><input type="checkbox" name="rights" value="yes" required /> 본인은 이 파일을 공개 게시할 권한이 있으며, 게시에 관한 법적 책임이 본인에게 있음을 확인합니다. 다른 사람의 저작권과 초상권을 침해하지 않습니다.</label>
        <button disabled={busy} type="submit">{busy ? '처리 중…' : '공개 게시'}</button>
      </form>
      <details style={{marginTop:'1rem'}}><summary>재생 정보 직접 입력</summary><form onSubmit={submit} style={{ display: 'grid', gap: '.8rem', maxWidth: 640 }}>
        <label>작품 제목 <input name="title" required maxLength={80} style={{ display: 'block', width: '100%', padding: '.6rem', marginTop: '.3rem', color: '#16121a' }} /></label>
        <label>태그 <input name="tags" placeholder="예: 불, 마법, 폭발" maxLength={167} style={{ display: 'block', width: '100%', padding: '.6rem', marginTop: '.3rem', color: '#16121a' }} /><small>쉼표로 구분해 최대 8개, 태그당 20자까지 입력하세요.</small></label>
        <label>제작 모델 (선택) <input name="model" maxLength={80} placeholder="직접 확인한 모델명" /></label>
        <AnimationFields />
        <label>PNG 파일 <input name="file" type="file" accept="image/png,.png" required style={{ display: 'block', marginTop: '.3rem' }} /></label>
        <label style={{ lineHeight: 1.6 }}><input type="checkbox" name="rights" value="yes" required /> 본인은 이 파일을 공개 게시할 권한이 있으며, 게시에 관한 법적 책임이 본인에게 있음을 확인합니다. 다른 사람의 저작권과 초상권을 침해하지 않습니다.</label>
        <p style={{ margin: 0, color: '#b8adbf', fontSize: '.9rem' }}>게시 권한은 자동으로 확인되지 않습니다. 개인 정보나 공유할 권한이 없는 파일은 올리지 마세요.</p>
        <button disabled={busy} style={button} type="submit">{busy ? '처리 중…' : '공개 게시'}</button>
      </form></details></>}
      <p role="status" aria-live="polite">{message}</p>
    </section>
    <BulkTools signedIn={signedIn} onUploaded={() => void load()} />
    <section aria-labelledby="recent-title"><h2 id="recent-title">공유된 작품</h2>
      {!items.length && !loading && <p>아직 게시된 작품이 없습니다.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '1rem' }}>
        {items.map(item => <article key={item.id} style={box}>
          <a href={'/api/share?id=' + encodeURIComponent(item.id)} target="_blank" rel="noreferrer" title="원본 PNG 열기"><AnimatedPreview item={item} /></a>
          <div style={{ color: '#eca6e7', marginTop: '.5rem' }}>{(item.tags || []).map(tag => <span key={tag}>#{tag} </span>)}</div>
          <h3 style={{ overflowWrap: 'anywhere' }}>{item.title}</h3>
          {item.model && <p style={{ color: '#b8adbf', fontSize: '.9rem', overflowWrap: 'anywhere' }}>제작 모델: {item.model} (게시자 입력)</p>}
          {item.created && <time dateTime={item.created} style={{ color: '#b8adbf' }}>{new Date(item.created).toLocaleDateString('ko-KR')}</time>}
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.7rem', flexWrap: 'wrap' }}><a style={{ color: '#eca6e7' }} href={'/api/share?id=' + encodeURIComponent(item.id)} target="_blank" rel="noreferrer">원본 보기 · 링크 공유</a>{item.owned && <><button type="button" disabled={busy} onClick={() => setEditing(item.id)}>수정</button><button type="button" disabled={busy} onClick={() => void erase(item.id)}>내 작품 삭제</button></>}</div>
          {editing === item.id && <form onSubmit={e => void saveEdit(e, item.id)} style={{display:'grid',gap:'.6rem',marginTop:'1rem'}}>
            <label>제목 <input name="title" required maxLength={80} defaultValue={item.title} /></label>
            <label>태그 <input name="tags" maxLength={167} defaultValue={(item.tags || []).join(', ')} /></label>
            <label>제작 모델 (선택) <input name="model" maxLength={80} defaultValue={item.model || ''} placeholder="직접 확인한 모델명" /></label>
            <AnimationFields animation={item.animation} />
            <label>PNG 교체 (선택) <input type="file" name="file" accept="image/png,.png" /></label>
            <label><input type="checkbox" name="rights" value="yes" /> 새 파일을 선택한 경우 게시 권한과 법적 책임을 확인합니다.</label>
            <div><button type="submit" disabled={busy}>저장</button> <button type="button" onClick={() => setEditing(null)}>취소</button></div>
          </form>}
        </article>)}
      </div>
      {cursor && <button style={{ ...button, marginTop: '1rem' }} type="button" disabled={loading} onClick={() => void load(cursor)}>더 보기</button>}
      {loading && <p>불러오는 중…</p>}
    </section>
  </main>;
}
