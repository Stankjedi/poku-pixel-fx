@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var destination: texture_storage_2d<rgba32float, write>;
fn read(p: vec2i) -> vec4f { return textureLoad(source, clamp(p, vec2i(0), vec2i(textureDimensions(source)) - vec2i(1)), 0); }
@compute @workgroup_size(8, 8)
fn down(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= textureDimensions(destination))) { return; }
  let p = vec2i(id.xy * 2u);
  textureStore(destination, id.xy, (read(p) + read(p + vec2i(1, 0)) + read(p + vec2i(0, 1)) + read(p + vec2i(1, 1))) * .25);
}
@compute @workgroup_size(8, 8)
fn horizontal(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= textureDimensions(destination))) { return; }
  let p = vec2i(id.xy);
  textureStore(destination, id.xy, (read(p + vec2i(-2, 0)) + 4.0 * read(p + vec2i(-1, 0)) + 6.0 * read(p) + 4.0 * read(p + vec2i(1, 0)) + read(p + vec2i(2, 0))) / 16.0);
}
@compute @workgroup_size(8, 8)
fn vertical(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= textureDimensions(destination))) { return; }
  let p = vec2i(id.xy);
  textureStore(destination, id.xy, (read(p + vec2i(0, -2)) + 4.0 * read(p + vec2i(0, -1)) + 6.0 * read(p) + 4.0 * read(p + vec2i(0, 1)) + read(p + vec2i(0, 2))) / 16.0);
}
