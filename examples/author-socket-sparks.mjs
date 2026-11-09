// Standalone, opt-in new-effect authoring. Never edits the catalog or existing output.
import {readFileSync,writeFileSync,mkdirSync,rmdirSync,unlinkSync,lstatSync,openSync,closeSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSocketSparkRecipe} from './lib/socket-spark-recipe.mjs';
import {validateIntentBrief} from '../tools/lib/effect-intent.mjs';
export function authorSocketSparks({config,intent,out}) {
  const effect=createSocketSparkRecipe(config); // Validate all sockets/events before any write.
  validateIntentBrief(intent);
  if (intent.timeline.durationSeconds!==effect.meta.duration || intent.timeline.loop!==false)
    throw new RangeError('Intent timing must match the authored effect');
  const target=resolve(out);
  try {lstatSync(target);throw new Error('Output path already exists; refuse overwrite');}
  catch(error){if(error.code!=='ENOENT') throw error;}
  // Parent must exist: no orphan ancestor directories on failure. Atomic exclusive mkdir owns the path.
  const recipe=fileURLToPath(new URL('./lib/socket-spark-recipe.mjs',import.meta.url));
  let spec=relative(target,recipe).split(sep).join('/');if(!spec.startsWith('.'))spec='./'+spec;
  const source=`// New authored effect. Metadata is explicit, not inferred from pixels.\nimport {createSocketSparkRecipe} from ${JSON.stringify(spec)};\nexport const config=JSON.parse(${JSON.stringify(JSON.stringify(config))});\nconst effect=createSocketSparkRecipe(config);\nexport const meta=effect.meta;\nexport const draw=effect.draw;\nexport const births=effect.births;\n`;
  const files={'effect.mjs':source,'intent.json':JSON.stringify(intent,null,2)+'\n','config.json':JSON.stringify(config,null,2)+'\n'};
  mkdirSync(target);
  const written=[];
  try {
    for(const [name,data] of Object.entries(files)) {
      const p=resolve(target,name),fd=openSync(p,'wx');written.push(p);
      try {writeFileSync(fd,data);} finally {closeSync(fd);}
    }
  } catch(error) {
    const cleanupErrors=[];
    for(const p of written.reverse())try {unlinkSync(p);}catch(e){if(e.code!=='ENOENT')cleanupErrors.push({path:p,code:e.code});}
    try {rmdirSync(target);}catch(e){if(e.code!=='ENOENT')cleanupErrors.push({path:target,code:e.code});}
    // Never recursively remove a directory: a raced-in unrelated file belongs to its creator.
    if(cleanupErrors.length){error.cleanupErrors=cleanupErrors;error.outputDirectory=target;}
    throw error;
  }
  return {directory:target,effect:resolve(target,'effect.mjs'),intent:resolve(target,'intent.json'),events:effect.births.length};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [configPath,intentPath,out,...extra]=process.argv.slice(2);
  if(!configPath||!intentPath||!out||extra.length)throw Error('Usage: node examples/author-socket-sparks.mjs CONFIG.json INTENT.json NEW_DIRECTORY');
  const read=p=>{const b=readFileSync(p);if(b.length>8*1024*1024)throw Error('Input too large');return JSON.parse(b);};
  console.log(JSON.stringify(authorSocketSparks({config:read(configPath),intent:read(intentPath),out}),null,2));
}
