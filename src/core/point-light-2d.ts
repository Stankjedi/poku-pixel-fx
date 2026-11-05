/** Reimplemented on baseline b6627aa after the later local workspace was unavailable.
 * Opt-in material lighting for author-supplied 2.5D positions and normals.
 * It does not draw glow, infer depth, or cast shadows. */
export type LightVector2D = readonly [number, number, number];
export interface PointLight2D {
  position: LightVector2D;
  /** Finite influence radius in native pixel units. */
  radius: number;
  /** Non-negative artistic multiplier, not photometric units. Defaults to 1. */
  intensity?: number;
}
export interface PointLightSample2D {
  direction: LightVector2D;
  distance: number;
  attenuation: number;
  diffuse: number;
}
interface InversePlacement2D { fromX(x:number,y:number):number; fromY(x:number,y:number):number }
function vector(value:LightVector2D,label:string){
  if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))
    throw new RangeError(`${label} must be a finite [x, y, z] vector`);
}
function validate(light:PointLight2D){
  vector(light.position,'Point light position');
  if(!Number.isFinite(light.radius)||light.radius<=0)throw new RangeError('Point light radius must be finite and positive');
  if(!Number.isFinite(light.intensity??1)||(light.intensity??1)<0)throw new RangeError('Point light intensity must be finite and non-negative');
}
/** Same-coordinate surface sample. A coincident source has zero diffuse because direction is undefined.
 * Falloff is (1 - (distance/radius)^2)^2, exactly zero outside the radius. */
export function samplePointLight2D(light:PointLight2D,position:LightVector2D,normal:LightVector2D):PointLightSample2D {
  validate(light);vector(position,'Surface position');vector(normal,'Surface normal');
  const length=Math.hypot(...normal);
  if(!Number.isFinite(length)||length<1e-12)throw new RangeError('Surface normal must be finite and nonzero');
  const dx=light.position[0]-position[0],dy=light.position[1]-position[1],dz=light.position[2]-position[2];
  const distance=Math.hypot(dx,dy,dz);
  if(!Number.isFinite(distance))throw new RangeError('Point light separation overflow');
  const direction:LightVector2D=distance>0?[dx/distance,dy/distance,dz/distance]:[0,0,0];
  const attenuation=distance<light.radius?(1-(distance/light.radius)**2)**2:0;
  const lambert=Math.max(0,Math.min(1,normal[0]/length*direction[0]+normal[1]/length*direction[1]+normal[2]/length*direction[2]));
  const diffuse=lambert*attenuation*(light.intensity??1);
  if(!Number.isFinite(diffuse))throw new RangeError('Point light response overflow');
  return {direction,distance,attenuation,diffuse};
}
/** Convert a world/frame source to a Painter's final local placement. Call after place().
 * Rigid translation, rotation and x mirroring are supported. Camera offsets are not world motion. */
export function localPointLight2D(placement:InversePlacement2D,light:PointLight2D):PointLight2D {
  validate(light);
  const position:LightVector2D=[placement.fromX(light.position[0],light.position[1]),placement.fromY(light.position[0],light.position[1]),light.position[2]];
  vector(position,'Local light position');
  return {...light,position};
}

/** Compile one fixed-normal surface for pixel shaders. Snapshots the source and normal, so later
 * caller mutation has no effect; rebuild it when the light moves. Inputs are local x/y/z.
 * Returns diffuse only, avoiding vector allocation and repeated light/normal validation per pixel. */
export function createPointLightSampler2D(light:PointLight2D,normal:LightVector2D):(x:number,y:number,z:number)=>number {
  validate(light);vector(normal,'Surface normal');
  const length=Math.hypot(...normal);
  if(!Number.isFinite(length)||length<1e-12)throw new RangeError('Surface normal must be finite and nonzero');
  const nx=normal[0]/length,ny=normal[1]/length,nz=normal[2]/length;
  const [lx,ly,lz]=light.position,radius=light.radius,intensity=light.intensity??1;
  return (x,y,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))throw new RangeError('Surface position must be finite');
    const dx=lx-x,dy=ly-y,dz=lz-z,distance=Math.hypot(dx,dy,dz);
    if(!Number.isFinite(distance))throw new RangeError('Point light separation overflow');
    if(distance===0||distance>=radius||intensity===0)return 0;
    const lambert=Math.max(0,Math.min(1,(nx*dx+ny*dy+nz*dz)/distance));
    const diffuse=lambert*(1-(distance/radius)**2)**2*intensity;
    if(!Number.isFinite(diffuse))throw new RangeError('Point light response overflow');
    return diffuse;
  };
}
