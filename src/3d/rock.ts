/** Seeded, closed low-poly rocks for projectiles, asteroids and rigid-body debris. */
import { type FragmentMesh3D } from "./fragments.js";
import { type Vec3, Rng3D, clamp3, norm3, mul3, add3 } from "./math.js";

export interface RockMesh3DOptions { seed?: number; radius?: number; roughness?: number; detail?: 0 | 1 }
/** Shared edge midpoints keep the mesh watertight. Detail is capped at 80 triangles. */
export function createRockMesh3D(options: RockMesh3DOptions = {}): FragmentMesh3D {
  const radius = options.radius ?? 1;
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("rock radius must be finite and positive");
  const roughness = clamp3(Number.isFinite(options.roughness) ? options.roughness! : 0.2, 0, 0.45);
  const rng = new Rng3D(options.seed ?? 1), g = (1 + Math.sqrt(5)) / 2;
  let vertices: Vec3[] = ([[-1,g,0],[1,g,0],[-1,-g,0],[1,-g,0],[0,-1,g],[0,1,g],[0,-1,-g],[0,1,-g],[g,0,-1],[g,0,1],[-g,0,-1],[-g,0,1]] as Vec3[]).map(norm3);
  let faces: [number,number,number][] = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  if (options.detail !== 0) {
    const edges = new Map<string,number>();
    const midpoint = (a:number,b:number) => {
      const key = `${Math.min(a,b)}:${Math.max(a,b)}`;
      let i = edges.get(key);
      if (i === undefined) { i = vertices.length; vertices.push(norm3(add3(vertices[a],vertices[b]))); edges.set(key,i); }
      return i;
    };
    faces = faces.flatMap(([a,b,c]) => { const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]] as [number,number,number][]; });
  }
  vertices = vertices.map(v => mul3([v[0]*1.07,v[1]*0.91,v[2]], radius*(1+rng.range(-roughness,roughness))));
  return {vertices,faces};
}

export interface RockFracturePiece3D {mesh:FragmentMesh3D;center:Vec3;sourceFaces:readonly number[]}
/** Split this module's 80-face rock into 20 closed, matching wedge solids, retaining every outer face.
 * Each contiguous four-face patch is an original icosahedron face. Internal cuts meet at the source center.
 */
export function fractureRockMesh3D(mesh:FragmentMesh3D):RockFracturePiece3D[] {
  if(mesh.faces.length!==80||mesh.vertices.length!==42||mesh.vertices.some(v=>v.length!==3||!v.every(Number.isFinite))||mesh.faces.some(f=>f.length!==3||new Set(f).size!==3||f.some(i=>!Number.isSafeInteger(i)||i<0||i>=42))) throw new RangeError("fracture expects a detail-1 rock mesh");
  const origin=mul3(mesh.vertices.reduce((a,b)=>add3(a,b),[0,0,0] as Vec3),1/mesh.vertices.length),pieces:RockFracturePiece3D[]=[];
  for(let start=0;start<80;start+=4) {
    const patch=mesh.faces.slice(start,start+4),ids=[...new Set(patch.flat())],map=new Map(ids.map((id,i)=>[id,i]));
    const world=[...ids.map(i=>mesh.vertices[i]),origin],core=world.length-1,edges=new Map<string,{a:number;b:number;count:number}>();
    const faces=patch.map(f=>f.map(i=>map.get(i)!) as [number,number,number]);
    for(const [a,b,c] of faces) for(const [u,v] of [[a,b],[b,c],[c,a]]) {const key=[Math.min(u,v),Math.max(u,v)].join(":");const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a:u,b:v,count:1});}
    if(ids.length!==6||edges.size!==9||[...edges.values()].filter(e=>e.count===1).length!==6||[...edges.values()].some(e=>e.count>2)) throw new RangeError("rock patches must use shared detail-1 topology");
    for(const e of edges.values())if(e.count===1)faces.push([e.b,e.a,core]);
    const center=mul3(world.reduce((a,b)=>add3(a,b),[0,0,0] as Vec3),1/world.length);
    pieces.push({mesh:{vertices:world.map(v=>[v[0]-center[0],v[1]-center[1],v[2]-center[2]]),faces},center,sourceFaces:[start,start+1,start+2,start+3]});
  }
  return pieces;
}
