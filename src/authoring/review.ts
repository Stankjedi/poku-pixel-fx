export interface EditableObservation {
  topic:string;note:string;frameRanges:{from:number;to:number}[];layer?:string;parameter?:string;time?:number;
}
/** Read the existing visual/intent record shapes. This adapter never changes viewing or approval flags. */
export function observationsFromReview(input:unknown):EditableObservation[]{
  if(!input||typeof input!=='object')throw new TypeError('Review must be an object');
  const record=input as Record<string,any>,source=record.observations??record.humanReview?.observations;
  if(!source||typeof source!=='object')throw new TypeError('Review observations are missing');
  return Object.entries(source).map(([topic,value])=>{
    const o=typeof value==='string'?{note:value}:value as Record<string,any>;
    if(!o||typeof o!=='object')throw new TypeError('Invalid observation');
    const note=o.note??o.observation??o.description??o.problem;if(typeof note!=='string')throw new TypeError('Observation note must be text');
    const ranges=o.frameRanges??(o.frameRange?[{from:o.frameRange[0],to:o.frameRange[1]??o.frameRange[0]}]:o.frames?.length?[{from:o.frames[0],to:o.frames[o.frames.length-1]}]:Number.isSafeInteger(o.frame)?[{from:o.frame,to:o.frame}]:[]);
    if(!Array.isArray(ranges)||ranges.some(r=>!r||!Number.isSafeInteger(r.from)||!Number.isSafeInteger(r.to)||r.from<0||r.to<r.from))throw new RangeError('Invalid observation frame ranges');
    return{topic,note,frameRanges:ranges.map(r=>({from:r.from,to:r.to})),...(typeof o.layer==='string'?{layer:o.layer}:{}),...(typeof o.parameter==='string'?{parameter:o.parameter}:{}),...(Number.isFinite(o.time)&&o.time>=0?{time:o.time}:{})};
  });
}
