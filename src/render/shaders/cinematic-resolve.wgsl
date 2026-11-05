struct Params {
  size: vec2u, flags: u32, flat: u32,
  tone: u32, levels: u32, reserved: vec2u,
  light: f32, threshold: f32, knee: f32, exposure: f32,
  intensity: f32, saturation: f32, contrast: f32, vignette: f32,
  fringe: f32, highlight: f32, padding: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var emission: texture_2d<f32>;
@group(0) @binding(3) var bloom0: texture_2d<f32>;
@group(0) @binding(4) var bloom1: texture_2d<f32>;
@group(0) @binding(5) var bloom2: texture_2d<f32>;
@group(0) @binding(6) var bloom3: texture_2d<f32>;
@group(0) @binding(7) var bloom4: texture_2d<f32>;
@group(0) @binding(8) var bloom5: texture_2d<f32>;
@group(0) @binding(9) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(10) var<storage, read> palette: array<u32>;
fn levelSize(level: u32) -> vec2u {
  switch level {
    case 0u: { return textureDimensions(bloom0); } case 1u: { return textureDimensions(bloom1); }
    case 2u: { return textureDimensions(bloom2); } case 3u: { return textureDimensions(bloom3); }
    case 4u: { return textureDimensions(bloom4); } default: { return textureDimensions(bloom5); }
  }
}
fn readLevel(level: u32, p: vec2i) -> vec3f {
  switch level {
    case 0u: { return textureLoad(bloom0, p, 0).rgb; } case 1u: { return textureLoad(bloom1, p, 0).rgb; }
    case 2u: { return textureLoad(bloom2, p, 0).rgb; } case 3u: { return textureLoad(bloom3, p, 0).rgb; }
    case 4u: { return textureLoad(bloom4, p, 0).rgb; } default: { return textureLoad(bloom5, p, 0).rgb; }
  }
}
fn sampleLevel(level: u32, position: vec2f) -> vec3f {
  let bound = vec2i(levelSize(level)) - vec2i(1);
  let p = clamp(position, vec2f(0.0), vec2f(bound));
  let a = vec2i(floor(p)); let b = min(a + vec2i(1), bound); let t = fract(p);
  return mix(mix(readLevel(level, a), readLevel(level, vec2i(b.x, a.y)), t.x), mix(readLevel(level, vec2i(a.x, b.y)), readLevel(level, b), t.x), t.y);
}
fn tone(v: vec3f) -> vec3f {
  let x = max(v, vec3f(0.0));
  if (params.tone == 0u) { return x; }
  if (params.tone == 1u) { return x / (vec3f(1.0) + x); }
  return clamp((x * (2.51 * x + vec3f(.03))) / (x * (2.43 * x + vec3f(.59)) + vec3f(.14)), vec3f(0.0), vec3f(1.0));
}
fn srgb(v: vec3f) -> vec3f {
  let x = clamp(v, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - vec3f(.055), 12.92 * x, x <= vec3f(.0031308));
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= params.size)) { return; }
  let p = vec2i(id.xy); let c = textureLoad(base, p, 0);
  var rgb = c.rgb + textureLoad(emission, p, 0).rgb;
  let center = (vec2f(params.size) - vec2f(1.0)) * .5;
  let normal = (vec2f(id.xy) - center) / max(vec2f(1.0), center);
  let edge = min(1.0, dot(normal, normal) * .5);
  if (params.levels > 0u) {
    let normalizer = (1.0 - pow(.58, f32(params.levels))) / .42;
    var weight = 1.0 / normalizer; var stride = 2.0; var glow = vec3f(0.0);
    for (var level = 0u; level < params.levels; level++) {
      let point = (vec2f(id.xy) + vec2f(.5)) / stride - vec2f(.5);
      let fringe = normal * params.fringe / stride;
      glow += vec3f(sampleLevel(level, point + fringe).r, sampleLevel(level, point).g, sampleLevel(level, point - fringe).b) * weight;
      weight *= .58; stride *= 2.0;
    }
    rgb += glow * params.intensity;
  }
  var alpha = c.a;
  if ((params.flags & 16u) == 0u) { alpha = max(alpha, clamp(max(rgb.r, max(rgb.g, rgb.b)) * .85, 0.0, 1.0)); }
  var invA = 0.0; if (alpha > 0.0) { invA = 1.0 / alpha; }
  rgb *= params.exposure * invA;
  if (params.highlight > 0.0 && params.tone != 0u) {
    let peak = max(rgb.r, max(rgb.g, rgb.b));
    let onset = clamp((peak - 1.0) / 3.0, 0.0, 1.0);
    let preserve = params.highlight * onset * onset * (3.0 - 2.0 * onset);
    if (preserve > 0.0) { rgb = mix(tone(rgb), rgb * (tone(vec3f(peak)).r / peak), preserve); }
    else { rgb = tone(rgb); }
  } else { rgb = tone(rgb); }
  let luminance = dot(rgb, vec3f(.2126, .7152, .0722));
  rgb = (vec3f(luminance) + (rgb - vec3f(luminance)) * params.saturation - vec3f(.18)) * params.contrast + vec3f(.18);
  var encoded = vec3u(floor(srgb(rgb * (1.0 - params.vignette * edge * edge)) * 255.0 + vec3f(.5)));
  let alphaByte = floor(alpha * 255.0 + .5);
  if (params.reserved.x > 0u && alphaByte > 0.0) {
    var nearest = encoded; var distance = 0xffffffffu;
    for (var i = 0u; i < params.reserved.x; i++) {
      let c = palette[i]; let candidate = vec3u(c & 255u, (c >> 8u) & 255u, (c >> 16u) & 255u);
      let delta = vec3i(encoded) - vec3i(candidate); let square = delta * delta; let d = u32(square.x + square.y + square.z);
      if (d < distance) { distance = d; nearest = candidate; }
    }
    encoded = nearest;
  }
  textureStore(output, id.xy, vec4f(vec3f(encoded) / 255.0, alphaByte / 255.0));
}
