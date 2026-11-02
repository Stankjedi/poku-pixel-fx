'use client';
import { useState, type FormEvent } from 'react';

type Animation = {frameWidth:number;frameHeight:number;frameCount:number;fps:number;loop:boolean};
type Item = {id:string;title:string;tags?:string[];animation:Animation|null;model?:string|null};
const MAX_ARCHIVE = 50 * 1024 * 1024;
const crcTable = Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0); return n>>>0;});
function crc32(data:Uint8Array){let c=0xffffffff;for(const v of data)c=(c>>>8)^crcTable[(c^v)&255];return (c^0xffffffff)>>>0;}
function u16(d:DataView,n:number,v:number){d.setUint16(n,v,true)}
function u32(d:DataView,n:number,v:number){d.setUint32(n,v,true)}
function zip(files:{name:string;data:Uint8Array}[]) {
  const encoder=new TextEncoder(), parts:Uint8Array[]=[], central:Uint8Array[]=[];let offset=0;
  for(const f of files){const name=encoder.encode(f.name), crc=crc32(f.data), local=new Uint8Array(30+name.length), d=new DataView(local.buffer);
    u32(d,0,0x04034b50);u16(d,4,20);u16(d,6,0x800);u32(d,14,crc);u32(d,18,f.data.length);u32(d,22,f.data.length);u16(d,26,name.length);local.set(name,30);parts.push(local,f.data);
    const c=new Uint8Array(46+name.length),v=new DataView(c.buffer);u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x800);u32(v,16,crc);u32(v,20,f.data.length);u32(v,24,f.data.length);u16(v,28,name.length);u32(v,42,offset);c.set(name,46);central.push(c);offset+=local.length+f.data.length;
  }
  const centralSize=central.reduce((n,a)=>n+a.length,0), end=new Uint8Array(22),d=new DataView(end.buffer);u32(d,0,0x06054b50);u16(d,8,files.length);u16(d,10,files.length);u32(d,12,centralSize);u32(d,16,offset);
  return new Blob([...parts,...central,end].map(x=>x.buffer as ArrayBuffer),{type:'application/zip'});
}
function animationFromJson(json:any):Animation {
 const frames=Array.isArray(json.frames)?json.frames:Object.values(json.frames||{}), first=frames[0] as any, fx=json.meta?.pokuFx;
 const a={frameWidth:Number(first?.frame?.w),frameHeight:Number(first?.frame?.h),frameCount:frames.length,fps:Math.round(Number(fx?.fps)||1000/Number(first?.duration)),loop:fx?.loop===true};
 if(![a.frameWidth,a.frameHeight,a.frameCount,a.fps].every(Number.isInteger)||a.frameWidth<1||a.frameHeight<1||a.frameCount<2||a.frameCount>4096||a.fps<1||a.fps>60)throw new Error('JSON의 프레임 정보를 읽지 못했습니다.');return a;
}
export default function BulkTools({signedIn,onUploaded}:{signedIn:boolean;onUploaded:()=>void}){
 const [files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tags,setTags]=useState(''),[model,setModel]=useState('');
 async function upload(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setMessage('파일을 확인하고 있습니다.');
  try {
   const pngs=files.filter(f=>/\.png$/i.test(f.name)),jsons=files.filter(f=>/\.json$/i.test(f.name));
   if(!pngs.length)throw new Error('PNG와 같은 이름의 JSON을 함께 선택하세요.');
   if(pngs.length>50)throw new Error('한 번에 최대 50개 작품을 선택할 수 있습니다.');
   const map=new Map<string,File>();for(const f of jsons){const k=f.name.replace(/\.json$/i,'').toLocaleLowerCase();if(map.has(k))throw new Error('이름이 같은 JSON이 중복되었습니다.');map.set(k,f);}
   const seen=new Set<string>(), jobs:{png:File;title:string;animation:Animation}[]=[];
   for(const png of pngs){const title=png.name.replace(/\.png$/i,''),key=title.toLocaleLowerCase(),metadata=map.get(key);if(seen.has(key))throw new Error('이름이 같은 PNG가 중복되었습니다.');seen.add(key);if(!metadata)throw new Error(`${png.name}: 같은 이름의 JSON이 필요합니다.`);if(png.size>5*1024*1024||metadata.size>1024*1024)throw new Error(`${png.name}: 파일 크기 제한을 초과했습니다.`);jobs.push({png,title,animation:animationFromJson(JSON.parse(await metadata.text()))});}
   let ok=0;for(const job of jobs){const f=new FormData();f.set('file',job.png);f.set('title',job.title);f.set('tags',tags);f.set('model',model);f.set('rights','yes');for(const [k,v] of Object.entries(job.animation))f.set(k,k==='loop'?(v?'yes':'no'):String(v));
    const r=await fetch('/api/share',{method:'POST',body:f}),res=await r.json() as {error?:string};if(!r.ok){setMessage(`${ok}개 게시 완료. ${job.title}: ${res.error||'게시 실패'} · 나머지는 게시하지 않았습니다.`);onUploaded();return;}ok++;setMessage(`${ok} / ${jobs.length}개 게시 완료`);}
   setMessage(`${ok}개 작품을 게시했습니다.`);onUploaded();
  } catch(err){setMessage(err instanceof Error?err.message:'게시하지 못했습니다.');}finally{setBusy(false);}
 }
 async function download(){if(busy)return;setBusy(true);setMessage('공유 작품 목록을 읽고 있습니다.');try {
   const items:Item[]=[],seen=new Set<string>();let cursor:string|null=null;
   do{const r=await fetch('/api/share'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store'});if(!r.ok)throw new Error('공유 목록을 불러오지 못했습니다.');const page=await r.json() as {items:Item[];next:string|null};items.push(...page.items);cursor=page.next;if(cursor&&seen.has(cursor))throw new Error('목록 페이지가 반복되었습니다.');if(cursor)seen.add(cursor);if(items.length>500)throw new Error('한 번에 내려받을 수 있는 500개 작품을 초과했습니다.');}while(cursor);
   if(!items.length)throw new Error('내려받을 공유 작품이 없습니다.');
   const filesOut:{name:string;data:Uint8Array}[]=[],enc=new TextEncoder();let size=0;
   for(let i=0;i<items.length;i++){const item=items[i],r=await fetch('/api/share?id='+encodeURIComponent(item.id));if(!r.ok)throw new Error(`${item.title}: 파일을 불러오지 못했습니다.`);const data=new Uint8Array(await r.arrayBuffer());size+=data.length;if(size>MAX_ARCHIVE)throw new Error('전체 파일이 50MB를 초과해 묶음 다운로드를 중단했습니다.');const safe=item.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,60)||'effect', base=`${String(i+1).padStart(4,'0')}-${safe}`;
    filesOut.push({name:`${base}.png`,data}); const a=item.animation;
    if(a){const dv=new DataView(data.buffer,data.byteOffset,data.byteLength),cols=Math.floor(dv.getUint32(16)/a.frameWidth);const frames=Array.from({length:a.frameCount},(_,j)=>({filename:`${base} ${j}`,frame:{x:(j%cols)*a.frameWidth,y:Math.floor(j/cols)*a.frameHeight,w:a.frameWidth,h:a.frameHeight},duration:Math.round(1000/a.fps)}));filesOut.push({name:`${base}.json`,data:enc.encode(JSON.stringify({frames,meta:{pokuFx:{...a,frameSize:[a.frameWidth,a.frameHeight],creatorModel:item.model || null}}},null,2))});}
    setMessage(`${i+1} / ${items.length}개 준비 중…`);
   }
   const blob=zip(filesOut),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='poku-shared-effects.zip';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage(`${items.length}개 공유 작품을 묶어 내려받습니다.`);
  }catch(err){setMessage(err instanceof Error?err.message:'다운로드하지 못했습니다.');}finally{setBusy(false);}}
 return <section style={{background:'#15131d',border:'1px solid #393449',padding:'1rem',borderRadius:8,margin:'2rem 0'}} aria-labelledby="bulk-title"><h2 id="bulk-title">여러 작품 한 번에</h2>
 {signedIn&&<form onSubmit={upload} style={{display:'grid',gap:'.7rem'}}><p>PNG와 같은 이름의 Poku JSON을 함께 선택하세요. 기존 게시물은 건드리지 않으며 계정별 업로드 제한이 적용됩니다.</p><label>PNG와 JSON 파일 <input required type="file" multiple accept=".png,.json,image/png,application/json" onChange={e=>setFiles(Array.from(e.currentTarget.files||[]))}/></label><label>공통 태그 <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="예: 불, 마법" maxLength={167}/></label><label>공통 제작 모델 (선택) <input value={model} onChange={e=>setModel(e.target.value)} placeholder="모든 작품에 사용한 모델" maxLength={80}/><small>모든 선택 작품의 모델이 같을 때만 입력하세요. 확인되지 않으면 비워 두세요.</small></label><label><input required type="checkbox"/> 선택한 모든 파일의 공개 권한과 게시에 관한 법적 책임을 확인합니다.</label><button type="submit" disabled={busy}>선택한 작품 일괄 게시</button></form>}
 <p>기본 이펙트 전체는 <a href="https://github.com/Stankjedi/poku-pixel-fx">라이브러리 저장소</a>를 복제한 후 <code>npm ci</code>, <code>npm run build</code>, <code>node build-tools/tools/sheets.mjs</code>를 차례로 실행하면 PNG와 JSON으로 내보낼 수 있습니다. 기본 작품 하나는 목록에서 열어 스프라이트 시트를 생성한 뒤 내려받을 수 있습니다.</p>
 <p>공개 공유 작품을 PNG와 재생 정보 JSON으로 묶습니다. 최대 500개, 이미지 합계 50MB까지 지원합니다.</p><button disabled={busy} type="button" onClick={()=>void download()}>공유 작품 전체 다운로드 (ZIP)</button><p role="status" aria-live="polite">{message}</p></section>;
}
