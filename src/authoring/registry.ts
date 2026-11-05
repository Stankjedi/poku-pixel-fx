import { catalogEntries, effectLoaders } from './catalog.generated.js';
export { catalogEntries };
const loaded = new Map<string, Promise<any>>();
export function loadCatalogEffect(id: string): Promise<any> {
  const loader = effectLoaders[id];
  if (!loader) return Promise.reject(new RangeError(`Unknown effect: ${id}`));
  let promise = loaded.get(id);
  if (!promise) { promise = loader().catch(error => { loaded.delete(id); throw error; }); loaded.set(id, promise); }
  return promise;
}
const semantics: Record<string, string[]> = {
  blade: ['검', '칼', '베기', 'slash', 'sword', 'blade', 'melee'],
  spin: ['회전', 'spin', 'orbit', 'tornado', 'whirl'],
  impact: ['접촉', '타격', '충돌', 'impact', 'hit', 'contact'],
  smoke: ['연기', '연무', 'smoke', 'mist', 'plume'],
  water: ['물', '방울', 'water', 'splash', 'liquid'],
  metal: ['금속', '검', 'sword', 'spark', 'metal'],
  lightning: ['번개', '전기', 'lightning', 'electric', 'arc', 'bolt'],
  portal: ['포탈', '포털', '차원문', 'portal', 'rift', 'gate'],
  restore: ['치유', '회복', 'heal', 'restore', 'cleanse'],
  fire: ['불', '화염', '불꽃', 'fire', 'flame', 'ember'],
};
export function searchEffects(query: string, limit = 30) {
  const words = query.normalize('NFC').toLocaleLowerCase().split(/[\s,/]+/).filter(Boolean);
  const expanded = words.map(word => [word, ...Object.entries(semantics).filter(([key, aliases]) => key === word || aliases.includes(word)).flatMap(([, aliases]) => aliases)]);
  return catalogEntries.map(entry => {
    const haystack = [entry.id, entry.meta.name, entry.meta.desc, ...(entry.meta.tags ?? [])].join(' ').toLocaleLowerCase();
    const matches = expanded.map(terms => terms.some(term => haystack.includes(term)));
    const score = matches.filter(Boolean).length * 10 + words.filter(word => entry.id.includes(word)).length * 3;
    return { ...entry, score, matched: matches.filter(Boolean).length };
  }).filter(entry => !words.length || entry.matched > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
}
