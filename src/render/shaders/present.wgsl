@group(0) @binding(0) var source: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - vec2f(1.0), 0.0, 1.0);
}
@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let color = textureLoad(source, vec2i(p.xy), 0);
  // The capture texture is straight alpha; browser presentation requests premultiplied alpha.
  return vec4f(color.rgb * color.a, color.a);
}
