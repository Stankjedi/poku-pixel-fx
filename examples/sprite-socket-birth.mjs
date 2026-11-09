import assert from 'node:assert/strict';
const { createSpriteClip2D } = await import(process.env.POKU_SPRITE_CLIP_MODULE ?? '../build/core/sprite-clip.js');
const { captureSpriteSocketBirth2D } = await import(process.env.POKU_SOCKET_BIRTH_MODULE ?? '../build/core/sprite-socket-birth.js');

// Author two poses using the existing socket schema. Transparent pixels make
// this a metadata example, not an effect image or a renderer demonstration.
const clip = createSpriteClip2D({ version: 1, width: 16, height: 16, pivot: [8, 8], frames: [
  { durationMs: 100, runs: [256, 0], sockets: { muzzle: { x: 14, y: 8, angle: 0 } } },
  { durationMs: 100, runs: [256, 0], sockets: { muzzle: { x: 8, y: 2, angle: -Math.PI / 2 } } },
] });
const events = [{ id: 1, birthMs: 1000, lifeMs: 350 }, { id: 2, birthMs: 1100, lifeMs: 350 }];
const particles = events.map(event => {
  const birthTime = event.birthMs / 1000;
  const source = captureSpriteSocketBirth2D({ clip, socket: 'muzzle', birthTime,
    clipTime: (event.birthMs - 1000) / 1000,
    world: [1, 0, 0, 1, 100 + 20 * birthTime, 50],
    unavailable: 'throw', velocity: [30, 0] });
  return { ...event, source };
});
function positionAt(particle, effectTime) {
  const { source } = particle, age = effectTime - source.birthTime;
  // No pose query or future root lookup: these particles have detached.
  return [source.x + source.vx * age, source.y + source.vy * age];
}
assert.equal(particles.length, events.length);
assert.deepEqual(positionAt(particles[0], 1.2), [132, 50]);
const second = positionAt(particles[1], 1.2);
assert.ok(Math.abs(second[0] - 122) < 1e-9 && Math.abs(second[1] - 41) < 1e-9);
console.log(JSON.stringify({ particles, positionsAt1_2: particles.map(p => positionAt(p, 1.2)) }, null, 2));
