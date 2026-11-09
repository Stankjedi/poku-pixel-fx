import test from 'node:test';
import assert from 'node:assert/strict';
// Normal repository path uses compiled JS (Node >=20). Overrides permit bounded
// source verification without rebuilding the project; they are not runtime requirements.
const { createSpriteClip2D } = await import(process.env.POKU_SPRITE_CLIP_MODULE ?? '../build/core/sprite-clip.js');
const { captureSpriteSocketBirth2D: capture } = await import(process.env.POKU_SOCKET_BIRTH_MODULE ?? '../build/core/sprite-socket-birth.js');
const identity = [1, 0, 0, 1, 0, 0];
const fixture = (maps, pivot = [4, 5], options = {}) => createSpriteClip2D({
  version: 1, width: 16, height: 16, pivot,
  frames: maps.map(sockets => ({ durationMs: 100, runs: [256, 0], sockets })),
}, options);
const birth = (clip, extra = {}) => capture({ clip, socket: 'muzzle', birthTime: 2,
  clipTime: 0, world: identity, unavailable: 'throw', ...extra });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('turning muzzle samples birth pose, angle fallback and pivot exactly once', () => {
  const clip = fixture([{ muzzle: { x: 10, y: 5, angle: 0 } },
    { muzzle: { x: 4, y: 11, angle: Math.PI / 2 } }]);
  const first = birth(clip, { velocity: [20, 0] });
  const turn = birth(clip, { clipTime: .1, velocity: [20, 0], offset: [2, 0] });
  assert.deepEqual([first.x, first.y, first.vx, first.vy], [6, 0, 20, 0]);
  near(turn.x, 0); near(turn.y, 8); near(turn.vx, 0); near(turn.vy, 20);
  assert.equal(turn.frame, 1); assert.equal(turn.birthTime, 2); assert.equal(turn.clipTime, .1);
});

test('moving torch stores world birth independently of future source and root', () => {
  const data = { version: 1, width: 16, height: 16, pivot: [4, 5], frames: [
    { durationMs: 100, runs: [256, 0], sockets: { flame: { x: 4, y: 2, basisX: [1, 0], basisY: [0, 1] } } },
    { durationMs: 100, runs: [256, 0], sockets: { flame: { x: 8, y: 3 } } },
  ] };
  const before = JSON.stringify(data), clip = createSpriteClip2D(data);
  const root = [1, 0, 0, 1, 100, 50], velocity = [0, -8], offset = [1, 0];
  const record = birth(clip, { socket: 'flame', world: root, velocity, offset });
  assert.deepEqual([record.x, record.y, record.vx, record.vy], [101, 47, 0, -8]);
  assert.equal(JSON.stringify(data), before);
  root[4] = 1000; velocity[1] = 99; offset[0] = 99;
  data.frames[0].sockets.flame.basisX[0] = 999;
  const copied = clip.socketAt('flame', 0); copied.basisX[0] = 123;
  birth(clip, { socket: 'flame', clipTime: .1, world: root });
  assert.deepEqual([record.x + record.vx * .5, record.y + record.vy * .5], [101, 43]);
  assert.deepEqual(record.basisX, [1, 0]);
  assert.ok(Object.isFrozen(record) && Object.isFrozen(record.basisX) && Object.isFrozen(record.basisY));
  assert.throws(() => { record.x = 0; }, TypeError);
  assert.throws(() => { record.basisX[0] = 0; }, TypeError);
});

test('hidden anatomical limb uses only an explicit alternative and reports why', () => {
  const clip = fixture([{ rightHand: { x: 2, y: 5, visible: false },
    leftHand: { x: 15, y: 5 }, vent: { x: 4, y: 7 } }]);
  assert.throws(() => birth(clip, { socket: 'rightHand' }), /Unavailable/);
  assert.equal(birth(clip, { socket: 'rightHand', unavailable: 'skip' }), null);
  const fallback = birth(clip, { socket: 'rightHand', fallbackSocket: 'vent' });
  assert.equal(fallback.requestedSocket, 'rightHand'); assert.equal(fallback.resolvedSocket, 'vent');
  assert.equal(fallback.fallbackReason, 'hidden'); assert.deepEqual([fallback.x, fallback.y], [0, 2]);
  assert.equal(birth(clip, { socket: 'absent', fallbackSocket: 'vent' }).fallbackReason, 'missing');
  assert.equal(birth(clip, { socket: 'absent', fallbackSocket: 'rightHand', unavailable: 'skip' }), null);
  assert.throws(() => birth(clip, { socket: 'absent', fallbackSocket: 'alsoAbsent' }), /Unavailable/);
});

test('root rotation, nonuniform scale and reflection transform points and full bases', () => {
  const clip = fixture([{ muzzle: { x: 6, y: 8, angle: 2,
    basisX: [0, 1], basisY: [-1, 0], mirrorPolicy: 'reflect' } }]);
  // Rotate 90 degrees after scaling X by -2 and Y by 3.
  const r = birth(clip, { world: [0, -2, -3, 0, 10, 20], offset: [2, 1], velocity: [4, 5] });
  assert.deepEqual([r.x, r.y, r.vx, r.vy], [-5, 18, -12, 10]);
  assert.deepEqual(r.basisX, [-3, 0]); near(r.basisY[0], 0); near(r.basisY[1], 2);
  const omitted = fixture([{ muzzle: { x: 6, y: 5 } }]);
  assert.equal(birth(omitted, { world: [-1, 0, 0, 1, 0, 0] }).x, -2);
  for (const mirrorPolicy of ['authored', 'swap-hand']) {
    const authored = fixture([{ muzzle: { x: 6, y: 5, mirrorPolicy } }]);
    assert.equal(birth(authored).x, 2);
    assert.throws(() => birth(authored, { world: [-1, 0, 0, 1, 0, 0], unavailable: 'skip' }), /does not support/);
  }
  const handed = fixture([{ muzzle: { x: 4, y: 5, basisX: [-1, 0], basisY: [0, 1], mirrorPolicy: 'authored' } }]);
  assert.deepEqual(birth(handed, { velocity: [3, 4] }).basisX, [-1, 0]);
});

test('outside clip never clamps or invents a source; explicit looping is respected', () => {
  const clip = fixture([{ muzzle: { x: 6, y: 5 } }]);
  for (const clipTime of [-1, .1, 100]) {
    assert.equal(birth(clip, { clipTime, unavailable: 'skip', fallbackSocket: 'muzzle' }), null);
    assert.throws(() => birth(clip, { clipTime }), /Unavailable/);
  }
  assert.equal(birth(clip.withOptions({ loop: true }), { clipTime: 100 }).x, 2);
  assert.equal(birth(clip, { birthTime: -2 }).birthTime, -2, 'finite preroll effect clocks are preserved');
  for (const clipTime of [NaN, Infinity, -Infinity]) assert.throws(() => birth(clip, { clipTime }), RangeError);
});

test('invalid and overflowed input always fails, including skip policy', () => {
  const clip = fixture([{ muzzle: { x: 6, y: 5 } }]);
  for (const extra of [{ birthTime: NaN }, { velocity: [Infinity, 0] }, { offset: [0] },
    { world: [1, 0, 0, 0, 0, 0] }, { world: [1, 0, 0, 1, Infinity, 0] },
    { world: [1e308, 0, 0, 1, 0, 0] }, { socket: '' }, { unavailable: 'origin' }])
    assert.throws(() => birth(clip, { unavailable: 'skip', ...extra }), RangeError);
  for (const socket of [{ x: NaN, y: 0 }, { x: 0, y: 0, basisX: [1, 0] },
    { x: 0, y: 0, basisX: [0, 0], basisY: [0, 1] }, { x: 0, y: 0, angle: NaN }]) {
    const fake = { frameAt: () => 0, socketAt: () => socket };
    assert.throws(() => birth(fake, { unavailable: 'skip' }), RangeError);
  }
  for (const frame of [NaN, Infinity, -Infinity, .5, -2, Number.MAX_SAFE_INTEGER + 1]) {
    const fake = { frameAt: () => frame, socketAt: () => { throw new Error('must not query invalid frame'); } };
    assert.throws(() => birth(fake, { unavailable: 'skip' }), /frame must be/);
  }
});

test('caller birth records keep their clocks, count and non-geometric attributes', () => {
  const clip = fixture([{ muzzle: { x: 6, y: 5 } }, { muzzle: { x: 4, y: 8 } }]);
  const events = [{ id: 7, birth: 220, life: 175, brightness: 2, vx: 9, vy: -2 },
    { id: 9, birth: 320, life: 200, brightness: 3, vx: 10, vy: -3 }];
  const before = JSON.stringify(events);
  const records = events.map(e => ({ ...e, source: birth(clip, {
    birthTime: e.birth / 1000, clipTime: (e.birth - 220) / 1000, velocity: [e.vx, e.vy] }) }));
  assert.equal(records.length, events.length); assert.equal(JSON.stringify(events), before);
  records.forEach(({ source, ...e }, i) => {
    assert.deepEqual(e, events[i]); assert.equal(source.birthTime, e.birth / 1000);
  });
});
