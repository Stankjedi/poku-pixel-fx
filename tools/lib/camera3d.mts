/** Shared, validated orbit overrides for 3D contact sheets and GIFs. Angles are degrees. */
export interface ExportCamera3D { yaw: number; elevation: number; zoom: number; target: readonly [number,number,number] }
export function exportCamera3D(flags: Record<string,string>, defaults: ExportCamera3D): ExportCamera3D {
  const number=(key:string,fallback:number)=>{
    if(flags[key]===undefined) return fallback;
    const n=Number(flags[key]);if(!Number.isFinite(n)||flags[key].trim()==="") throw new RangeError(`${key} must be finite`);
    return n;
  };
  const yaw=flags.yaw===undefined?defaults.yaw:number("yaw",0)*Math.PI/180;
  const elevation=flags.elevation===undefined?defaults.elevation:number("elevation",0)*Math.PI/180;
  const zoom=number("zoom",defaults.zoom),targetY=number("target-y",defaults.target[1]);
  if(zoom<=0||zoom>20) throw new RangeError("zoom must be greater than zero and at most 20");
  if(Math.abs(elevation)>=Math.PI/2) throw new RangeError("elevation must be between -90 and 90 degrees, exclusive");
  return {yaw,elevation,zoom,target:[defaults.target[0],targetY,defaults.target[2]]};
}
