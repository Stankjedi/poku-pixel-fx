// poku-draw/v1. Pixel centers, larger depth is nearer; stable submission ties.
struct Params { size: vec2u, count: u32, unused: u32 }
struct Command {
  tag: vec4u, p0: vec4f, p1: vec4f, p2: vec4f,
  material: vec4f, emission: vec4f, asset: vec4u, reserved: vec4u,
}
struct Sample { color: vec4f, light: vec3f, depth: f32, blend: u32, optical: bool, hit: bool }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> commands: array<Command>;
@group(0) @binding(2) var<storage, read> assets: array<u32>;
@group(0) @binding(3) var<storage, read> assetEmission: array<f32>;
@group(0) @binding(4) var<storage, read_write> colors: array<u32>;
@group(0) @binding(5) var<storage, read_write> lights: array<u32>;
@group(0) @binding(6) var<storage, read_write> hdr: array<f32>;
fn unpack(c: u32) -> vec4f { return vec4f(f32(c & 255u), f32((c >> 8u) & 255u), f32((c >> 16u) & 255u), f32(c >> 24u)) / 255.0; }
fn pack(c: vec4f) -> u32 { let v = vec4u(floor(clamp(c, vec4f(0.0), vec4f(1.0)) * 255.0 + vec4f(.5))); return v.x | (v.y << 8u) | (v.z << 16u) | (v.w << 24u); }
fn srgb(v: vec3f) -> vec3f { let x = max(v, vec3f(0.0)); return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - vec3f(.055), x * 12.92, x <= vec3f(.0031308)); }
fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }
fn excludesEdge(a: vec2f, b: vec2f, p: vec2f, winding: f32) -> bool {
  let d = (b - a) * winding; return cross2(d, p - a) == 0.0 && !(d.y < 0.0 || (d.y == 0.0 && d.x > 0.0));
}
fn sampleDraw(index: u32, pixel: vec2f) -> Sample {
  let c = commands[index]; var s: Sample;
  s.hit = false; s.depth = c.p0.z; s.color = unpack(c.tag.y); s.blend = c.tag.z; s.optical = (c.tag.w & 1u) != 0u;
  var assetIndex = 0u; var hasAsset = false;
  let q = pixel - c.p0.xy;
  switch c.tag.x {
    case 0u: { if (any(q < vec2f(0.0)) || q.x >= c.p0.w || q.y >= c.p1.w) { return s; } }
    case 1u: { if (dot(q, q) > c.p0.w * c.p0.w) { return s; } }
    case 2u: {
      let v = c.p1.xy - c.p0.xy; let len = dot(v, v); var t = 0.0;
      if (len > 0.0) { t = clamp(dot(q, v) / len, 0.0, 1.0); }
      let distance = q - v * t; if (dot(distance, distance) > c.p0.w * c.p0.w) { return s; }
      s.depth = mix(c.p0.z, c.p1.z, t);
    }
    case 3u: {
      let a = c.p1.xy - c.p0.xy; let b = c.p2.xy - c.p0.xy; let det = cross2(a, b);
      if (abs(det) < 1e-8) { return s; }
      let wa = cross2(q, b) / det; let wb = cross2(a, q) / det;
      if (wa < 0.0 || wb < 0.0 || wa + wb > 1.0) { return s; }
      let winding = sign(det);
      if (excludesEdge(c.p0.xy, c.p1.xy, pixel, winding) || excludesEdge(c.p1.xy, c.p2.xy, pixel, winding) || excludesEdge(c.p2.xy, c.p0.xy, pixel, winding)) { return s; }
      s.depth += (c.p1.z - c.p0.z) * wa + (c.p2.z - c.p0.z) * wb;
    }
    case 4u: {
      let det = cross2(c.p1.xy, c.p2.xy);
      let uv = vec2i(floor(vec2f(cross2(q, c.p2.xy), cross2(c.p1.xy, q)) / det));
      if (any(uv < vec2i(0)) || any(uv >= vec2i(c.material.zw))) { return s; }
      assetIndex = c.asset.x + (u32(uv.y) + c.asset.w) * c.asset.y + u32(uv.x) + c.asset.z; hasAsset = true;
      s.color *= unpack(assets[assetIndex]);
    }
    default: { return s; }
  }
  let rawAlpha = s.color.a * c.material.x;
  if ((s.blend == 2u && rawAlpha < c.material.y) || ((s.blend == 0u || s.blend == 2u) && rawAlpha <= 0.0)) { return s; }
  var alpha = rawAlpha; if (s.blend == 0u || s.blend == 2u) { alpha = 1.0; }
  s.color.a = alpha; s.light = c.emission.rgb * alpha;
  if (hasAsset && (c.tag.w & 2u) != 0u) { let j = assetIndex * 3u; s.light += vec3f(assetEmission[j], assetEmission[j + 1u], assetEmission[j + 2u]) * c.material.x; }
  s.hit = true; return s;
}
@compute @workgroup_size(4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= params.size)) { return; }
  let pixel = vec2f(id.xy) + vec2f(.5); let output = id.y * params.size.x + id.x;
  var nearest = -3.402823e38; var opaqueId = -1; var color = vec4f(0.0); var light = vec3f(0.0); var optical = vec3f(0.0); var additive = vec3f(0.0);
  for (var i = 0u; i < params.count; i++) {
    let s = sampleDraw(i, pixel); if (!s.hit) { continue; }
    if (s.optical) { optical += s.light; }
    if ((s.blend == 0u || s.blend == 2u) && s.depth >= nearest) { nearest = s.depth; opaqueId = i32(i); color = s.color; light = select(s.light, vec3f(0.0), s.optical); }
  }
  var order: array<u32, 64>; var depths: array<f32, 64>; var count = 0u;
  // Hosts enforce <=64 alpha primitives before dispatch, so no fragment can silently overflow.
  for (var i = 0u; i < params.count; i++) {
    let s = sampleDraw(i, pixel); if (!s.hit) { continue; }
    if (s.blend != 1u || s.depth < nearest || (s.depth == nearest && i32(i) <= opaqueId)) { continue; }
    var k = count;
    loop { if (k == 0u) { break; } if (depths[k - 1u] <= s.depth) { break; } order[k] = order[k - 1u]; depths[k] = depths[k - 1u]; k--; }
    order[k] = i; depths[k] = s.depth; count++;
  }
  for (var i = 0u; i < count; i++) {
    let s = sampleDraw(order[i], pixel); let inv = 1.0 - s.color.a;
    color = vec4f(s.color.rgb * s.color.a + color.rgb * inv, s.color.a + color.a * inv);
    light = select(s.light, vec3f(0.0), s.optical) + light * inv;
  }
  for (var i = 0u; i < params.count; i++) {
    let s = sampleDraw(i, pixel); if (!s.hit || s.blend != 3u || s.optical || s.depth < nearest) { continue; }
    var transmission = 1.0;
    for (var k = 0u; k < count; k++) { if (depths[k] > s.depth || (depths[k] == s.depth && order[k] > i)) { transmission *= 1.0 - sampleDraw(order[k], pixel).color.a; } }
    additive += s.light * transmission;
  }
  if (color.a > 0.0) { color = vec4f(color.rgb / color.a, color.a); } else { color = vec4f(0.0); }
  light += optical + additive; colors[output] = pack(color); lights[output] = pack(vec4f(srgb(light), select(0.0, 1.0, any(light > vec3f(0.0)))));
  hdr[output * 3u] = light.r; hdr[output * 3u + 1u] = light.g; hdr[output * 3u + 2u] = light.b;
}
