// Conservative 16x16 native-pixel bins. One invocation owns one tile, preserving
// submission order without atomics. A full bin uses the exact all-command path.
struct Params { size: vec2u, count: u32, tileCapacity: u32 }
struct Command {
  tag: vec4u, p0: vec4f, p1: vec4f, p2: vec4f,
  material: vec4f, emission: vec4f, asset: vec4u, reserved: vec4u,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> commands: array<Command>;
@group(0) @binding(2) var<storage, read_write> tiles: array<u32>;
fn bounds(c: Command) -> vec4f {
  let p = c.p0.xy;
  switch c.tag.x {
    case 0u: { return vec4f(p, p + vec2f(c.p0.w, c.p1.w)); }
    case 1u: { return vec4f(p - vec2f(c.p0.w), p + vec2f(c.p0.w)); }
    case 2u: { return vec4f(min(p, c.p1.xy) - vec2f(c.p0.w), max(p, c.p1.xy) + vec2f(c.p0.w)); }
    case 3u: { return vec4f(min(p, min(c.p1.xy, c.p2.xy)), max(p, max(c.p1.xy, c.p2.xy))); }
    case 4u: {
      // Ill-conditioned inverses can amplify f32 rounding; retain them in every
      // tile instead of trusting a geometric bound that rasterization can exceed.
      let products = vec2f(c.p1.x * c.p2.y, c.p1.y * c.p2.x);
      if (abs(products.x - products.y) <= max(1.0, abs(products.x) + abs(products.y)) * 0.0001) {
        return vec4f(vec2f(0.0), vec2f(params.size));
      }
      let x = c.p1.xy * c.material.z; let y = c.p2.xy * c.material.w;
      return vec4f(min(min(p, p + x), min(p + y, p + x + y)), max(max(p, p + x), max(p + y, p + x + y)));
    }
    default: { return vec4f(vec2f(0.0), vec2f(params.size)); }
  }
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let columns = (params.size.x + 15u) / 16u;
  let rows = (params.size.y + 15u) / 16u;
  if (id.x >= columns * rows) { return; }
  let tileMin = vec2f(vec2u(id.x % columns, id.x / columns) * 16u);
  let tileMax = min(tileMin + vec2f(16.0), vec2f(params.size));
  let offset = id.x * (params.tileCapacity + 1u); var count = 0u;
  for (var i = 0u; i < params.count; i++) {
    // Dead GPU particle slots have zero opacity. Asset emission is multiplied by
    // this value too, so skipping them cannot discard independently lit pixels.
    if (commands[i].material.x <= 0.0) { continue; }
    let b = bounds(commands[i]);
    // Pixel-edge bounds are widened for f32 products and boundary coverage. A
    // NaN comparison is false, conservatively retaining unusual input as well.
    let magnitude = max(max(abs(b.x), abs(b.y)), max(abs(b.z), abs(b.w)));
    let margin = 1.0 + magnitude * 0.00001;
    if (any(b.zw < tileMin - vec2f(margin)) || any(b.xy > tileMax + vec2f(margin))) { continue; }
    if (count == params.tileCapacity) { tiles[offset] = 0xffffffffu; return; }
    tiles[offset + 1u + count] = i; count++;
  }
  tiles[offset] = count;
}
