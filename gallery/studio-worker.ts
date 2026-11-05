import { createProjectRuntime } from '../src/authoring/runtime.js';
import { separateFrameLayers } from '../src/render/export.js';
const worker=globalThis as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void;onmessage:((e:MessageEvent)=>void)|null};
let current:{id:number;cancelled:boolean;ack?:()=>void}|undefined;
worker.onmessage=e=>{
  const m=e.data;
  if(m.type==='ack'&&current&&current.id===m.id){current.ack?.();current.ack=undefined;return;}
  if(m.type==='cancel'&&current&&current.id===m.id){current.cancelled=true;current.ack?.();return;}
  if(m.type!=='bake')return;
  if(current){current.cancelled=true;current.ack?.();}
  const job={id:m.id,cancelled:false,ack:undefined as (()=>void)|undefined};current=job;
  void (async()=>{
    const runtime=await createProjectRuntime(m.project);
    try {
      const fps=runtime.project.fps, duration=runtime.project.seconds??runtime.duration;
      const count=runtime.frameCount;
      if(count>4096||runtime.width*runtime.height>4_194_304)throw new RangeError('Bake exceeds 4096 frames or 4 megapixels per frame');
      worker.postMessage({type:'begin',id:job.id,count,width:runtime.width,height:runtime.height,fps,loop:runtime.loop,effectDuration:runtime.mod.meta.duration,origin:runtime.origin,contacts:runtime.contacts,events:runtime.events});
      for(let i=0;i<count&&!job.cancelled;i++){
        const sample=runtime.render(i/fps,i,false,false,'asset'),{color,emission}=separateFrameLayers(sample.frame);
        const wait=new Promise<void>(resolve=>{job.ack=resolve;});
        worker.postMessage({type:'frame',id:job.id,index:i,time:sample.time,rgba:color.buffer,emission:emission.buffer,sockets:sample.sockets,frozen:sample.frozen},[color.buffer,emission.buffer]);
        await wait;
      }
      worker.postMessage({type:job.cancelled?'cancelled':'done',id:job.id});
    }finally{runtime.dispose();if(current===job)current=undefined;}
  })().catch(error=>{worker.postMessage({type:'error',id:job.id,message:String(error)});if(current===job)current=undefined;});
};
