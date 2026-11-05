struct Params {
  size: vec2u, flags: u32, flat: u32,
  tone: u32, levels: u32, reserved: vec2u,
  light: f32, threshold: f32, knee: f32, exposure: f32,
  intensity: f32, saturation: f32, contrast: f32, vignette: f32,
  fringe: f32, highlight: f32, padding: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> colors: array<u32>;
@group(0) @binding(2) var<storage, read> lights: array<u32>;
@group(0) @binding(3) var<storage, read> backgrounds: array<u32>;
@group(0) @binding(4) var<storage, read> legacy: array<u32>;
@group(0) @binding(5) var<storage, read> hdr: array<f32>;
@group(0) @binding(6) var<storage, read> radiance: array<f32>;
@group(0) @binding(7) var<storage, read> occlusion: array<f32>;
@group(0) @binding(8) var base: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var emission: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var extracted: texture_storage_2d<rgba32float, write>;
fn unpack(c: u32) -> vec4f { return vec4f(f32(c & 255u), f32((c >> 8u) & 255u), f32((c >> 16u) & 255u), f32(c >> 24u)) / 255.0; }
fn linear(rgb: vec3f) -> vec3f { return select(pow((rgb + vec3f(.055)) / 1.055, vec3f(2.4)), rgb / 12.92, rgb <= vec3f(.04045)); }
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= params.size)) { return; }
  let i = id.y * params.size.x + id.x; let j = i * 3u;
  let c = unpack(colors[i]); var a = c.a; var rgb = linear(c.rgb) * a;
  if ((params.flags & 16u) != 0u) {
    var bg = params.flat;
    if ((params.flags & 32u) != 0u) { bg = backgrounds[i]; }
    rgb += linear(unpack(bg).rgb) * (1.0 - a); a = 1.0;
  }
  if ((params.flags & 8u) != 0u) { rgb *= clamp(occlusion[i], 0.0, 1.0); }
  var energy = linear(unpack(lights[i]).rgb);
  if ((params.flags & 1u) != 0u) { energy = vec3f(hdr[j], hdr[j + 1u], hdr[j + 2u]); }
  if ((params.flags & 4u) != 0u) { energy += linear(unpack(legacy[i]).rgb); }
  energy *= params.light;
  if ((params.flags & 2u) != 0u) { energy += vec3f(radiance[j], radiance[j + 1u], radiance[j + 2u]); }
  let brightness = max(energy.r, max(energy.g, energy.b));
  let knee = max(.000001, params.knee);
  let above = max(0.0, brightness - params.threshold);
  let q = clamp(brightness - params.threshold + knee, 0.0, 2.0 * knee);
  var scale = 0.0;
  if (brightness > 0.0) { scale = min(1.0, max(above, q * q / (4.0 * knee)) / brightness); }
  textureStore(base, id.xy, vec4f(rgb, a));
  textureStore(emission, id.xy, vec4f(energy, 1.0));
  textureStore(extracted, id.xy, vec4f(energy * scale, 1.0));
}
