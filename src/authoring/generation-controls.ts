/** Studio adapters: persistent source data is the only generation control state. */
import { createGeneratedEffect2D, createGenerationPlan2D } from './generation.js';
import { createSequenceSpec, type SequenceSource } from './sequence.js';
import { createProject } from './project.js';

export type GenerationSource = Extract<SequenceSource, { kind: 'generation' }>;
export type FireSparkChoice = 'legacy' | 'short-exposure' | 'scintillation';
export function supportsFireSparkControls(source: GenerationSource): boolean {
  const { material, action, response } = createGenerationPlan2D(source.intent).intent;
  return material === 'fire' && (action === 'plume' || action === 'dash' || action === 'burst') && (response === 'dissipate' || action === 'dash');
}
export function fireSparkChoice(source: GenerationSource): FireSparkChoice {
  return source.renderOptions?.fireSparkFinish === 'scintillation' ? 'scintillation'
    : source.renderOptions?.fireSparks === 'short-exposure' ? 'short-exposure' : 'legacy';
}
/** Only an explicit return to legacy removes spark-specific controls. Other artwork is preserved. */
export function withFireSparkChoice(source: GenerationSource, choice: FireSparkChoice): GenerationSource {
  if (!['legacy', 'short-exposure', 'scintillation'].includes(choice)) throw new RangeError('Unknown spark choice');
  if (!supportsFireSparkControls(source)) throw new RangeError('불티 설정은 화염 폭발·분출 또는 돌진에서만 지원됩니다.');
  createGeneratedEffect2D(createGenerationPlan2D(source.intent), source.renderOptions);
  if (fireSparkChoice(source) === choice) return source;
  const options = { ...source.renderOptions };
  if (choice === 'legacy') {
    delete options.fireSparks; delete options.fireSparkFinish; delete options.fireSparkCount; delete options.fireSparkLight;
  } else {
    options.fireSparks = 'short-exposure';
    if (choice === 'scintillation') options.fireSparkFinish = 'scintillation';
    else delete options.fireSparkFinish;
  }
  createGeneratedEffect2D(createGenerationPlan2D(source.intent), options);
  const { renderOptions: _, ...rest } = source;
  return Object.keys(options).length ? { ...rest, renderOptions: options } : rest;
}
export function withFireSparkNumber(source: GenerationSource, key: 'fireSparkCount' | 'fireSparkLight', value: number | undefined): GenerationSource {
  if (key !== 'fireSparkCount' && key !== 'fireSparkLight') throw new RangeError('Unknown spark control');
  if (!supportsFireSparkControls(source) || fireSparkChoice(source) === 'legacy') throw new RangeError('짧은 불티를 먼저 선택하세요.');
  const options = { ...source.renderOptions };
  if (value === undefined) delete options[key]; else options[key] = value;
  createGeneratedEffect2D(createGenerationPlan2D(source.intent), options);
  return { ...source, renderOptions: options };
}
/** Dash timing is source travel, never a cue visibility trim or sequence retime. */
export function supportsDashMotionControls(source: GenerationSource): boolean {
  const { material, action } = createGenerationPlan2D(source.intent).intent;
  return (material === 'fire' || material === 'energy') && action === 'dash';
}
export function withDashMotionNumber(source: GenerationSource, key: 'travel' | 'distance', value: number | undefined): GenerationSource {
  if (key !== 'travel' && key !== 'distance') throw new RangeError('Unknown dash motion control');
  if (!supportsDashMotionControls(source)) throw new RangeError('이동 시간·거리는 화염 또는 에너지 돌진에서만 지원됩니다.');
  const intent = { ...source.intent };
  if (value === undefined) delete intent[key]; else intent[key] = value;
  // Validate without persisting the planner's resolved defaults into authored JSON.
  createGenerationPlan2D(intent);
  return { ...source, intent };
}
/** A new opt-in starter, not a replacement for existing recipe defaults. */
export function createStudioFireGeneration(action: 'plume' | 'dash') {
  if (action !== 'plume' && action !== 'dash') throw new RangeError('Unsupported fire starter');
  return createProject({ id: `sequences/fire-${action}`, name: action === 'plume' ? '화염 분출' : '화염 돌진 · 소멸',
    kind: 'sequence', seed: 1, fps: 30, bg: 'dark', actor: false, target: false,
    sequence: createSequenceSpec({ cues: [{ id: 'fire', source: { kind: 'generation',
      intent: { material: 'fire', action, response: 'dissipate' }, renderOptions: { composition: 'material-volumes' } } }] }) });
}

/** Explicit fast dash-to-burst recipe; existing starters and renderer defaults stay unchanged. */
export function createStudioFastFireDashBurst() {
  return createProject({ id: 'sequences/fire-fast-dash-burst', name: '빠른 화염 돌진 · 폭발',
    kind: 'sequence', seed: 1, fps: 30, bg: 'dark', actor: false, target: false,
    intentRef: 'authoring/sequences/fire-fast-dash-burst.intent.json',
    notes: '140px / 0.25초 이동 · 짧은 불티 + 반짝임. 기존 화염 본체를 사용하는 편집 시작점입니다.',
    sequence: createSequenceSpec({ cues: [{ id: 'fire', source: { kind: 'generation',
      intent: { material: 'fire', action: 'dash', response: 'burst', distance: 140, travel: .25 },
      renderOptions: { composition: 'body', fireSparks: 'short-exposure', fireSparkFinish: 'scintillation' } } }] }) });
}
