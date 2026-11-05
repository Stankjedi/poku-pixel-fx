// Cosmetic-only fixed ticks. Stable slot IDs and integer hashing avoid atomic spawn order.
struct Params { dt: f32, steps: u32, count: u32, tick: u32 }
struct Particle { position: vec4f, velocity: vec4f, material: vec4f, identity: vec4u, gravity: vec4f }
struct Command { tag: vec4u, p0: vec4f, p1: vec4f, p2: vec4f, material: vec4f, emission: vec4f, asset: vec4u, reserved: vec4u }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> commands: array<Command>;
fn hash(input: u32) -> u32 { var x = input; x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
fn unit(seed: u32) -> f32 { return f32(hash(seed) >> 8u) / 16777216.0; }
fn linear(v: vec3f) -> vec3f { return select(pow((v + vec3f(.055)) / 1.055, vec3f(2.4)), v / 12.92, v <= vec3f(.04045)); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= params.count) { return; }
  var p = particles[i]; var c: Command;
  c.tag = vec4u(1u, 0u, 3u, 0u);
  if (p.identity.w == 0u) { commands[i] = c; return; }
  if ((p.identity.w & 1u) != 0u) {
    let key = p.identity.x ^ p.identity.y;
    p.velocity = vec4f(p.velocity.xyz + (vec3f(unit(key), unit(key ^ 0x9e3779b9u), unit(key ^ 0x85ebca6bu)) * 2.0 - vec3f(1.0)) * p.gravity.w, p.velocity.w);
    p.identity.w &= ~1u;
  }
  for (var tick = 0u; tick < params.steps; tick++) {
    if (p.material.w >= p.velocity.w) { p.identity.w = 0u; break; }
    let decay = max(0.0, 1.0 - p.material.y * params.dt);
    p.velocity = vec4f((p.velocity.xyz + p.gravity.xyz * params.dt) * decay, p.velocity.w);
    p.material.w += 1.0;
    p.position = vec4f(p.position.xyz + p.velocity.xyz * params.dt, p.material.w * params.dt);
  }
  if (p.material.w >= p.velocity.w) { p.identity.w = 0u; }
  particles[i] = p;
  if (p.identity.w != 0u) {
    let fade = max(0.0, 1.0 - p.material.w / p.velocity.w);
    c.tag = vec4u(1u, p.identity.z, select(3u, 2u, (p.identity.w & 4u) != 0u), 0u);
    c.p0 = vec4f(p.position.xyz, p.material.x);
    c.material = vec4f(fade * fade, .5, 0.0, 0.0);
    let color = vec3f(f32(p.identity.z & 255u), f32((p.identity.z >> 8u) & 255u), f32((p.identity.z >> 16u) & 255u)) / 255.0;
    c.emission = vec4f(linear(color) * p.material.z, 0.0);
  }
  commands[i] = c;
}
