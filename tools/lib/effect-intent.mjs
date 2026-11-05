// Local authoring accountability, not a classifier, physics engine or proof of human inspection.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const INTENT_SCHEMA = 'poku-effect-intent/v1';
export const INTENT_REVIEW_SCHEMA = 'poku-effect-intent-review/v1';
export const PHASES = ['preparation', 'action', 'response', 'ending'];
export const TOPICS = ['meaning', 'silhouette', 'directionForceWeight', 'causality', 'lifecycle'];
const EVIDENCE_FILES = ['scene-native.png', 'scene-3x.png', 'export-dark.png', 'export-light.png',
  'export-checker.png', 'values.png', 'silhouette.png', 'playback.html'];
export const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0
  && !/^(TODO|TBD|CHANGEME|작성 필요|미작성|\.\.\.)[.! ]*$/i.test(value.trim());
const requireText = (value, name) => { if (!text(value)) fail(`${name}: write a concrete explanation`); };
const readJSON = path => {
  const bytes = readFileSync(path); if (bytes.length > 1024 * 1024) fail('Intent/manifest JSON exceeds 1 MiB');
  return JSON.parse(bytes.toString('utf8'));
};
export function checkId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) fail('Use category/effect in kebab-case');
  return id;
}
const workspace = root => process.env.POKU_WORKSPACE ? resolve(process.env.POKU_WORKSPACE) : root;
export const intentPath = (root, id) => join(workspace(root), 'authoring', `${checkId(id)}.intent.json`);
export function reviewDirectory(root, id, variant) {
  if (variant !== undefined && (typeof variant !== 'string' || !/^[0-9a-f]{64}$/.test(variant))) fail('Invalid project variant fingerprint');
  return variant ? join(workspace(root), 'records', 'review', checkId(id), 'variants', variant)
    : join(workspace(root), 'records', 'review', checkId(id));
}

export function intentTemplate(id) {
  return {
    schema: INTENT_SCHEMA, id: checkId(id),
    intent: { oneSentence: '', firstRead: '', mustNotReadAs: '', useContext: '' },
    readability: { primaryShape: '', focalPoint: '', depthAndOverlap: '', contrast: '',
      intendedBackgrounds: [], secondaryDetailBudget: '' },
    mechanics: { model: 'stylized-physical', source: '', driver: '', direction: '',
      weightAndMaterial: '', causalChain: '', endingRule: '', exaggerationAndLimits: '' },
    timeline: { durationSeconds: 1, loop: false,
      phases: PHASES.map(name => ({ name, from: 0, to: 1, action: '', cause: '', visibleCue: '' })),
      omittedPhases: {} },
    references: [],
  };
}

/** New files only. Existing authored briefs are never overwritten by the generator. */
export function createIntentBrief(root, id) {
  const path = intentPath(root, id);
  if (existsSync(path)) return { path, created: false };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(intentTemplate(id), null, 2) + '\n', { flag: 'wx' });
  return { path, created: true };
}

export function validateIntentBrief(brief, id = brief?.id) {
  checkId(id);
  if (!brief || brief.schema !== INTENT_SCHEMA || brief.id !== id) fail('Intent schema/id mismatch');
  for (const key of ['oneSentence', 'firstRead', 'mustNotReadAs', 'useContext']) requireText(brief.intent?.[key], `intent.${key}`);
  for (const key of ['primaryShape', 'focalPoint', 'depthAndOverlap', 'contrast', 'secondaryDetailBudget'])
    requireText(brief.readability?.[key], `readability.${key}`);
  const backgrounds = brief.readability?.intendedBackgrounds;
  if (!Array.isArray(backgrounds) || !backgrounds.length || !backgrounds.every(text)) fail('State the intended backgrounds');
  if (!['physical', 'stylized-physical', 'magic-with-rules', 'symbolic-ui'].includes(brief.mechanics?.model)) fail('Choose an explicit mechanics model');
  for (const key of ['source', 'driver', 'direction', 'weightAndMaterial', 'causalChain', 'endingRule', 'exaggerationAndLimits'])
    requireText(brief.mechanics[key], `mechanics.${key}`);
  const t = brief.timeline;
  if (!t || !Number.isFinite(t.durationSeconds) || t.durationSeconds <= 0 || typeof t.loop !== 'boolean'
    || !Array.isArray(t.phases) || !t.phases.length || !t.omittedPhases || typeof t.omittedPhases !== 'object') fail('Invalid timeline');
  const seen = new Set(); let previous = -Infinity;
  for (const phase of t.phases) {
    if (!phase || !PHASES.includes(phase.name) || seen.has(phase.name)) fail('Unknown or duplicate phase');
    if (![phase.from, phase.to].every(Number.isFinite) || phase.from < 0 || phase.to < phase.from
      || phase.to > t.durationSeconds || phase.from < previous) fail('Phase times must be ordered and inside the duration; overlap is allowed');
    for (const key of ['action', 'cause', 'visibleCue']) requireText(phase[key], `${phase.name}.${key}`);
    seen.add(phase.name); previous = phase.from;
  }
  for (const name of PHASES) {
    if (seen.has(name) && Object.hasOwn(t.omittedPhases, name)) fail(`Phase ${name} is both present and omitted`);
    if (!seen.has(name)) requireText(t.omittedPhases[name], `Why ${name} is not applicable`);
  }
  for (const name of Object.keys(t.omittedPhases)) if (!PHASES.includes(name)) fail('Unknown omitted phase');
  if (!seen.has('action')) fail('An action/state phase is required');
  if (!Array.isArray(brief.references)) fail('references must be an array; an empty array is allowed');
  for (const ref of brief.references) {
    for (const key of ['source', 'observed', 'application', 'limits']) requireText(ref?.[key], `reference.${key}`);
  }
  return brief;
}
export const readIntentBrief = (root, id) => validateIntentBrief(readJSON(intentPath(root, id)), id);

/** Uses the existing rendered evidence. Never renders, runs source, reads arbitrary manifest paths or approves art. */
export function readIntentContext(root, id, expectedIdentity, variant, expectedBrief) {
  const dir = reviewDirectory(root, id, variant);
  const brief = variant ? validateIntentBrief(readJSON(join(dir, 'intent.json')), id) : readIntentBrief(root, id);
  if (expectedBrief && digest(expectedBrief) !== digest(brief)) fail('Current project intent differs from reviewed intent');
  const manifest = readJSON(join(dir, 'manifest.json')), identity = manifest?.identity;
  if (manifest?.schema !== 'poku-visual-review/v1' || identity?.id !== id
    || !Number.isSafeInteger(manifest.frames) || manifest.frames < 1
    || !Number.isFinite(manifest.fps) || manifest.fps <= 0 || typeof manifest.loop !== 'boolean') fail('Prepare the current visual review packet first');
  if (variant) {
    const context = manifest.context;
    if (!context || context.projectSha256 !== variant || context.effectDuration !== brief.timeline.durationSeconds
      || context.effectLoop !== brief.timeline.loop) fail('Project intent duration/loop or variant does not match the evidence');
    const projectBytes = readFileSync(join(dir, 'project.json'));
    if (hash(projectBytes) !== variant) fail('Project snapshot changed since review');
  } else {
    const expectedFrames = Math.max(1, Math.round(brief.timeline.durationSeconds * manifest.fps) + (brief.timeline.loop ? 0 : 1));
    if (brief.timeline.loop !== manifest.loop || expectedFrames !== manifest.frames)
      fail('Intent duration/loop does not match the rendered evidence');
  }
  const source = variant ? manifest.context.source : `src/fx/${id}.ts`;
  if (source !== 'project.json' && !/^src\/(?:fx\/[a-z0-9-]+\/[a-z0-9-]+|3d\/effects\/[a-z0-9-]+)\.ts$/.test(source))
    fail('Unsupported review source path');
  const sourcePath = source === 'project.json' ? join(dir, source) : join(root, source);
  if (hash(readFileSync(sourcePath)) !== identity.sourceSha256) fail('Source changed; rebuild and prepare new visual evidence');
  const fields = Object.fromEntries(['id', 'sourceSha256', 'pngSha256', 'jsonSha256', 'sceneSha256'].map(key => [key, identity[key]]));
  if (identity.fingerprint !== digest(fields)) fail('Invalid visual identity');
  if (expectedIdentity && expectedIdentity.fingerprint !== identity.fingerprint) fail('Current rendered output differs from reviewed evidence');
  for (const file of EVIDENCE_FILES) {
    if (!manifest.evidence?.[file] || hash(readFileSync(join(dir, file))) !== manifest.evidence[file]) fail(`Missing or changed evidence: ${file}`);
  }
  return { brief, manifest, dir, bindings: { briefSha256: digest(brief),
    manifestSha256: digest(manifest), fingerprint: identity.fingerprint, sourceSha256: identity.sourceSha256 } };
}

export function intentReviewTemplate(context) {
  return { schema: INTENT_REVIEW_SCHEMA, id: context.brief.id, bindings: context.bindings,
    reviewer: { name: '', kind: 'human', relationship: 'author' }, reviewedAt: '',
    viewed: { native: false, silhouette: false, playback: false, ending: false, backgrounds: false },
    firstRead: { method: 'informed-self-review', description: '', matchesIntent: false, confusions: '' },
    observations: Object.fromEntries(TOPICS.map(topic => [topic, { result: 'needs-work', note: '', frameRanges: [] }])),
    knownLimitations: '', nextChanges: [], decision: 'needs-work',
    userApproval: { status: 'not-recorded', evidence: '' } };
}

export function validateIntentReview(record, context) {
  if (!record || record.schema !== INTENT_REVIEW_SCHEMA || record.id !== context.brief.id
    || !record.bindings || Object.entries(context.bindings).some(([k, v]) => record.bindings[k] !== v))
    fail('Review does not match the current intent, source and evidence');
  requireText(record.reviewer?.name, 'reviewer.name');
  if (!['human', 'agent'].includes(record.reviewer.kind) || !['author', 'independent'].includes(record.reviewer.relationship)) fail('Identify the actual reviewer and relationship');
  if (!text(record.reviewedAt) || !Number.isFinite(Date.parse(record.reviewedAt))) fail('reviewedAt must be a date/time');
  for (const key of ['native', 'silhouette', 'playback', 'ending', 'backgrounds']) {
    if (typeof record.viewed?.[key] !== 'boolean') fail(`State whether the evidence was viewed: ${key}`);
    if (record.decision === 'ready' && record.viewed[key] !== true) fail(`Explicit viewing confirmation required: ${key}`);
  }
  const read = record.firstRead;
  if (!read || !['unlabelled-independent', 'informed-self-review'].includes(read.method)
    || typeof read.matchesIntent !== 'boolean') fail('Record what the effect actually read as');
  if (read.method === 'unlabelled-independent' && record.reviewer.relationship !== 'independent') fail('An author cannot claim an independent first-read test');
  requireText(read.description, 'firstRead.description'); requireText(read.confusions, 'firstRead.confusions');
  for (const topic of TOPICS) {
    const o = record.observations?.[topic];
    if (!o || !['pass', 'needs-work', 'not-applicable'].includes(o.result)) fail(`Missing observation: ${topic}`);
    requireText(o.note, `${topic}.note`);
    if (!Array.isArray(o.frameRanges) || (!o.frameRanges.length && (record.decision === 'ready' || o.result !== 'needs-work')))
      fail(`Give actual frame references: ${topic}`);
    for (const range of o.frameRanges) if (!range || ![range.from, range.to].every(Number.isSafeInteger)
      || range.from < 0 || range.to < range.from || range.to >= context.manifest.frames) fail(`Frame range out of evidence bounds: ${topic}`);
    if (topic === 'meaning' && o.result === 'not-applicable') fail('Meaning cannot be marked not-applicable');
  }
  requireText(record.knownLimitations, 'knownLimitations');
  if (!Array.isArray(record.nextChanges) || !record.nextChanges.every(text)) fail('nextChanges must contain concrete changes');
  if (!record.userApproval || !['not-recorded', 'approved', 'changes-requested'].includes(record.userApproval.status)) fail('Keep user approval separate from the reviewer judgement');
  if (record.userApproval.status !== 'not-recorded') requireText(record.userApproval.evidence, 'Evidence of the user decision for this version');
  if (!['ready', 'needs-work', 'provisional'].includes(record.decision)) fail('Invalid review decision');
  if (record.decision === 'ready') {
    if (!read.matchesIntent || TOPICS.some(topic => record.observations[topic].result === 'needs-work')) fail('Known meaning/causality failures cannot clear the ready gate');
    if (record.nextChanges.length) fail('Resolve the listed next changes or keep a non-ready decision');
    if (record.userApproval.status === 'changes-requested') fail('Recorded user changes must be addressed before ready');
  } else if (!record.nextChanges.length) fail('State the next correction or pending review');
  return record;
}

export function prepareIntentReview(root, id, variant) {
  const context = readIntentContext(root, id, undefined, variant), template = intentReviewTemplate(context);
  const path = join(context.dir, `intent-review-template-${context.bindings.briefSha256.slice(0, 12)}-${context.bindings.manifestSha256.slice(0, 12)}.json`);
  const content = JSON.stringify(template, null, 2) + '\n';
  if (existsSync(path)) { if (readFileSync(path, 'utf8') !== content) fail('Template path contains authored edits; use that file for record, do not overwrite it'); }
  else writeFileSync(path, content, { flag: 'wx' });
  return { path, playback: join(context.dir, 'playback.html'), bindings: context.bindings,
    notice: 'Template only. Inspect the actual frames/playback; no review or approval was generated.' };
}
export function recordIntentReview(root, id, file, variant) {
  const context = readIntentContext(root, id, undefined, variant), record = validateIntentReview(readJSON(file), context);
  const path = join(context.dir, 'intent-review.json');
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  return { path, decision: record.decision, notice: 'Recorded reviewer assertion; software cannot prove inspection or artistic/physical quality.' };
}
export function requireIntentReview(root, id, expectedIdentity, variant, expectedBrief) {
  const context = readIntentContext(root, id, expectedIdentity, variant, expectedBrief);
  const record = validateIntentReview(readJSON(join(context.dir, 'intent-review.json')), context);
  if (record.decision !== 'ready') fail('Intent review is not ready; follow the recorded corrections/pending judgement');
  return { brief: context.brief, review: record };
}
