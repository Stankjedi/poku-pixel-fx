//! Canonical shaders are included from the browser renderer, not forked Rust copies.
use crate::draw::Compiled;
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    collections::HashMap,
    sync::mpsc,
    time::{Duration, Instant},
};
use wgpu::util::DeviceExt;
const DRAW: &str = include_str!("../../src/render/shaders/draw-ir.wgsl");
const PREPARE: &str = include_str!("../../src/render/shaders/cinematic-prepare.wgsl");
const BLOOM: &str = include_str!("../../src/render/shaders/cinematic-bloom.wgsl");
const RESOLVE: &str = include_str!("../../src/render/shaders/cinematic-resolve.wgsl");
const PARTICLES: &str = include_str!("../../src/render/shaders/particles.wgsl");
struct Cached {
    buffer: wgpu::Buffer,
    revision: String,
    bytes: usize,
}
struct Tex {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    w: u32,
    h: u32,
}
struct Target {
    w: u32,
    h: u32,
    base: Tex,
    light: Tex,
    extracted: Tex,
    output: Tex,
    levels: Vec<(Tex, Tex)>,
    color_buffer: wgpu::Buffer,
    light_buffer: wgpu::Buffer,
    hdr_buffer: wgpu::Buffer,
    capture: wgpu::Buffer,
    row: u32,
}
pub struct Renderer {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub adapter_info: wgpu::AdapterInfo,
    draw: wgpu::ComputePipeline,
    prepare: wgpu::ComputePipeline,
    down: wgpu::ComputePipeline,
    horizontal: wgpu::ComputePipeline,
    vertical: wgpu::ComputePipeline,
    resolve: wgpu::ComputePipeline,
    params: wgpu::Buffer,
    draw_params: wgpu::Buffer,
    zero: wgpu::Buffer,
    dummy: Tex,
    assets: HashMap<String, Cached>,
    target: Option<Target>,
    pub uploaded_bytes: usize,
    pub last_render_ms: f64,
}
fn buffer(device: &wgpu::Device, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size,
        usage,
        mapped_at_creation: false,
    })
}
fn texture(device: &wgpu::Device, w: u32, h: u32, format: wgpu::TextureFormat) -> Tex {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::STORAGE_BINDING
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    Tex {
        texture,
        view,
        w,
        h,
    }
}
fn entry(binding: u32, ty: wgpu::BindingType) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty,
        count: None,
    }
}
fn uniform(binding: u32) -> wgpu::BindGroupLayoutEntry {
    entry(
        binding,
        wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
    )
}
fn read_texture(binding: u32) -> wgpu::BindGroupLayoutEntry {
    entry(
        binding,
        wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: false },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
    )
}
fn write_texture(binding: u32, format: wgpu::TextureFormat) -> wgpu::BindGroupLayoutEntry {
    entry(
        binding,
        wgpu::BindingType::StorageTexture {
            access: wgpu::StorageTextureAccess::WriteOnly,
            format,
            view_dimension: wgpu::TextureViewDimension::D2,
        },
    )
}
fn layout(device: &wgpu::Device, entries: &[wgpu::BindGroupLayoutEntry]) -> wgpu::PipelineLayout {
    let group = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries,
    });
    device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&group)],
        immediate_size: 0,
    })
}
fn pipeline(
    device: &wgpu::Device,
    code: &str,
    name: &str,
    pipeline_layout: Option<&wgpu::PipelineLayout>,
) -> wgpu::ComputePipeline {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some(name),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(code)),
    });
    device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some(name),
        layout: pipeline_layout,
        module: &module,
        entry_point: Some(name),
        compilation_options: Default::default(),
        cache: None,
    })
}
fn group(
    device: &wgpu::Device,
    p: &wgpu::ComputePipeline,
    resources: &[wgpu::BindingResource<'_>],
) -> wgpu::BindGroup {
    let entries: Vec<_> = resources
        .iter()
        .enumerate()
        .map(|(i, resource)| wgpu::BindGroupEntry {
            binding: i as u32,
            resource: resource.clone(),
        })
        .collect();
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &p.get_bind_group_layout(0),
        entries: &entries,
    })
}
fn bytes_u32(values: &[u32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}
fn tex(v: &Tex) -> wgpu::BindingResource<'_> {
    wgpu::BindingResource::TextureView(&v.view)
}
impl Renderer {
    pub async fn new() -> Result<Self, String> {
        let instance =
            wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
                ..Default::default()
            })
            .await
            .map_err(|e| e.to_string())?;
        let info = adapter.get_info();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("poku native player"),
                required_limits: wgpu::Limits::default(),
                ..Default::default()
            })
            .await
            .map_err(|e| e.to_string())?;
        let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
        let mut prepare_entries = vec![uniform(0)];
        for binding in 1..8 {
            prepare_entries.push(entry(
                binding,
                wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
            ));
        }
        for binding in 8..11 {
            prepare_entries.push(write_texture(binding, wgpu::TextureFormat::Rgba32Float));
        }
        let prepare_layout = layout(&device, &prepare_entries);
        let bloom_layout = layout(
            &device,
            &[
                read_texture(0),
                write_texture(1, wgpu::TextureFormat::Rgba32Float),
            ],
        );
        let mut resolve_entries = vec![uniform(0)];
        for binding in 1..9 {
            resolve_entries.push(read_texture(binding));
        }
        resolve_entries.push(write_texture(9, wgpu::TextureFormat::Rgba8Unorm));
        resolve_entries.push(entry(
            10,
            wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: true },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
        ));
        let resolve_layout = layout(&device, &resolve_entries);
        let draw = pipeline(&device, DRAW, "main", None);
        let prepare = pipeline(&device, PREPARE, "main", Some(&prepare_layout));
        let down = pipeline(&device, BLOOM, "down", Some(&bloom_layout));
        let horizontal = pipeline(&device, BLOOM, "horizontal", Some(&bloom_layout));
        let vertical = pipeline(&device, BLOOM, "vertical", Some(&bloom_layout));
        let resolve = pipeline(&device, RESOLVE, "main", Some(&resolve_layout));
        let _particle_validation = pipeline(&device, PARTICLES, "main", None);
        if let Some(error) = scope.pop().await {
            return Err(error.to_string());
        }
        let params = buffer(
            &device,
            80,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let draw_params = buffer(
            &device,
            16,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let zero = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: None,
            contents: &[0; 12],
            usage: wgpu::BufferUsages::STORAGE,
        });
        let dummy = texture(&device, 1, 1, wgpu::TextureFormat::Rgba32Float);
        Ok(Self {
            device,
            queue,
            adapter_info: info,
            draw,
            prepare,
            down,
            horizontal,
            vertical,
            resolve,
            params,
            draw_params,
            zero,
            dummy,
            assets: HashMap::new(),
            target: None,
            uploaded_bytes: 0,
            last_render_ms: 0.0,
        })
    }
    fn upload(&mut self, name: &str, data: &[u8], revision: &str) -> Result<wgpu::Buffer, String> {
        if data.len() as u64 > u64::from(self.device.limits().max_storage_buffer_binding_size) {
            return Err("Native GPU asset exceeds storage buffer limit".into());
        }
        let item = self.assets.entry(name.into()).or_insert_with(|| Cached {
            buffer: buffer(
                &self.device,
                data.len() as u64,
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            ),
            bytes: data.len(),
            revision: String::new(),
        });
        if item.bytes != data.len() {
            item.buffer.destroy();
            item.buffer = buffer(
                &self.device,
                data.len() as u64,
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            );
            item.bytes = data.len();
            item.revision.clear();
        }
        if item.revision != revision {
            self.queue.write_buffer(&item.buffer, 0, data);
            item.revision = revision.into();
            self.uploaded_bytes += data.len();
        }
        Ok(item.buffer.clone())
    }
    fn target(&mut self, w: u32, h: u32, levels: usize) -> Result<(), String> {
        if self
            .target
            .as_ref()
            .is_some_and(|t| t.w == w && t.h == h && t.levels.len() == levels)
        {
            return Ok(());
        }
        let n = u64::from(w) * u64::from(h);
        let limits = self.device.limits();
        if w == 0
            || h == 0
            || w.max(h) > limits.max_texture_dimension_2d
            || n * 12 > u64::from(limits.max_storage_buffer_binding_size)
            || n * 110 > 256 * 1024 * 1024
        {
            return Err("Native render target exceeds GPU budget".into());
        }
        let mut levels_out = Vec::new();
        let (mut lw, mut lh) = (w, h);
        for _ in 0..levels {
            lw = lw.div_ceil(2).max(1);
            lh = lh.div_ceil(2).max(1);
            levels_out.push((
                texture(&self.device, lw, lh, wgpu::TextureFormat::Rgba32Float),
                texture(&self.device, lw, lh, wgpu::TextureFormat::Rgba32Float),
            ));
        }
        let row = (w * 4).div_ceil(256) * 256;
        self.target = Some(Target {
            w,
            h,
            base: texture(&self.device, w, h, wgpu::TextureFormat::Rgba32Float),
            light: texture(&self.device, w, h, wgpu::TextureFormat::Rgba32Float),
            extracted: texture(&self.device, w, h, wgpu::TextureFormat::Rgba32Float),
            output: texture(&self.device, w, h, wgpu::TextureFormat::Rgba8Unorm),
            levels: levels_out,
            color_buffer: buffer(&self.device, n * 4, wgpu::BufferUsages::STORAGE),
            light_buffer: buffer(&self.device, n * 4, wgpu::BufferUsages::STORAGE),
            hdr_buffer: buffer(&self.device, n * 12, wgpu::BufferUsages::STORAGE),
            capture: buffer(
                &self.device,
                u64::from(row) * u64::from(h),
                wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            ),
            row,
        });
        Ok(())
    }
    /// Submit without CPU readback. A game host can sample output_texture in its own render pass.
    pub fn submit(&mut self, scene: &Compiled, options: &serde_json::Value) -> Result<(), String> {
        self.submit_with_lighting(scene, options, None, None)
    }
    /// External frame-sized linear RGB radiance and [0,1] base-color occlusion remain separate
    /// from material emission: radiance must not be rescaled by lightStrength.
    pub fn submit_with_lighting(
        &mut self,
        scene: &Compiled,
        options: &serde_json::Value,
        radiance: Option<&[f32]>,
        occlusion: Option<&[f32]>,
    ) -> Result<(), String> {
        let start = Instant::now();
        self.uploaded_bytes = 0;
        let b = &options["bloom"];
        let levels = if b == &serde_json::Value::Bool(false) {
            0
        } else {
            b["levels"].as_u64().unwrap_or(4).clamp(1, 6) as usize
        };
        self.target(scene.width, scene.height, levels)?;
        let commands = self.upload(
            "commands",
            &scene.commands,
            &format!("{:?}", Instant::now()),
        )?;
        let assets = self.upload("asset color", &scene.color, &scene.asset_revision)?;
        let emission = self.upload("asset emission", &scene.emission, &scene.asset_revision)?;
        let pixels = scene.width as usize * scene.height as usize;
        let radiance_buffer =
            self.upload_float_layer("external radiance", radiance, pixels * 3, None)?;
        let occlusion_buffer =
            self.upload_float_layer("external occlusion", occlusion, pixels, Some(1.0))?;
        let palette_values: Vec<u32> = if options["finalPalette"].is_null() {
            Vec::new()
        } else {
            let values = options["finalPalette"]
                .as_array()
                .ok_or("Final palette must be an array")?;
            if values.is_empty() || values.len() > 256 {
                return Err("Final palette needs 1..256 colors".into());
            }
            values
                .iter()
                .map(|v| {
                    v.as_i64()
                        .filter(|c| (-2147483648..=4294967295).contains(c))
                        .map(|c| c as u32)
                        .ok_or_else(|| "Invalid packed palette color".to_string())
                })
                .collect::<Result<_, _>>()?
        };
        let palette = if palette_values.is_empty() {
            self.zero.clone()
        } else {
            self.upload(
                "final palette",
                &bytes_u32(&palette_values),
                &options["finalPalette"].to_string(),
            )?
        };
        let mut words = [0u32; 20];
        words[0] = scene.width;
        words[1] = scene.height;
        words[2] = 1;
        if radiance.is_some() {
            words[2] |= 2;
        }
        if occlusion.is_some() {
            words[2] |= 8;
        }
        if let Some(bg) = options["background"].as_u64() {
            words[2] |= 16;
            words[3] = bg as u32;
        }
        words[4] = match options["toneMap"].as_str() {
            Some("none") => 0,
            Some("reinhard") => 1,
            _ => 2,
        };
        words[5] = levels as u32;
        words[6] = palette_values.len() as u32;
        let number = |value: &serde_json::Value, fallback: f32| -> f32 {
            value
                .as_f64()
                .map(|v| v as f32)
                .unwrap_or(fallback)
                .max(0.0)
        };
        let values = [
            number(&options["lightStrength"], 1.0),
            number(&b["threshold"], 0.16),
            number(&b["knee"], 0.18),
            number(&options["exposure"], 1.15),
            number(&b["intensity"], 0.9),
            number(&options["saturation"], 1.08),
            number(&options["contrast"], 1.04),
            number(&options["vignette"], 0.08).min(1.0),
            number(&options["chromaticFringe"], 0.45),
            number(&options["highlightColor"], 0.0).min(1.0),
        ];
        for (i, v) in values.iter().enumerate() {
            if !v.is_finite() {
                return Err("Nonfinite cinematic option".into());
            }
            words[8 + i] = v.to_bits();
        }
        self.queue.write_buffer(&self.params, 0, &bytes_u32(&words));
        self.queue.write_buffer(
            &self.draw_params,
            0,
            &bytes_u32(&[scene.width, scene.height, scene.count, 0]),
        );
        self.uploaded_bytes += 96;
        let t = self.target.as_ref().unwrap();
        let draw_group = group(
            &self.device,
            &self.draw,
            &[
                self.draw_params.as_entire_binding(),
                commands.as_entire_binding(),
                assets.as_entire_binding(),
                emission.as_entire_binding(),
                t.color_buffer.as_entire_binding(),
                t.light_buffer.as_entire_binding(),
                t.hdr_buffer.as_entire_binding(),
            ],
        );
        let prepare_group = group(
            &self.device,
            &self.prepare,
            &[
                self.params.as_entire_binding(),
                t.color_buffer.as_entire_binding(),
                t.light_buffer.as_entire_binding(),
                self.zero.as_entire_binding(),
                self.zero.as_entire_binding(),
                t.hdr_buffer.as_entire_binding(),
                radiance_buffer.as_entire_binding(),
                occlusion_buffer.as_entire_binding(),
                tex(&t.base),
                tex(&t.light),
                tex(&t.extracted),
            ],
        );
        let mut bloom_groups = Vec::new();
        let mut source = &t.extracted;
        for (data, scratch) in &t.levels {
            bloom_groups.push((
                group(&self.device, &self.down, &[tex(source), tex(data)]),
                group(&self.device, &self.horizontal, &[tex(data), tex(scratch)]),
                group(&self.device, &self.vertical, &[tex(scratch), tex(data)]),
            ));
            source = data;
        }
        let mut resolve_resources =
            vec![self.params.as_entire_binding(), tex(&t.base), tex(&t.light)];
        for i in 0..6 {
            resolve_resources.push(tex(t.levels.get(i).map(|l| &l.0).unwrap_or(&self.dummy)));
        }
        resolve_resources.push(tex(&t.output));
        resolve_resources.push(palette.as_entire_binding());
        let resolve_group = group(&self.device, &self.resolve, &resolve_resources);
        let scope = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_compute_pass(&Default::default());
            pass.set_pipeline(&self.draw);
            pass.set_bind_group(0, &draw_group, &[]);
            pass.dispatch_workgroups(t.w.div_ceil(4), t.h.div_ceil(4), 1);
            pass.set_pipeline(&self.prepare);
            pass.set_bind_group(0, &prepare_group, &[]);
            pass.dispatch_workgroups(t.w.div_ceil(8), t.h.div_ceil(8), 1);
            for (i, (down, horizontal, vertical)) in bloom_groups.iter().enumerate() {
                let l = &t.levels[i].0;
                for (p, g) in [
                    (&self.down, down),
                    (&self.horizontal, horizontal),
                    (&self.vertical, vertical),
                ] {
                    pass.set_pipeline(p);
                    pass.set_bind_group(0, g, &[]);
                    pass.dispatch_workgroups(l.w.div_ceil(8), l.h.div_ceil(8), 1);
                }
            }
            pass.set_pipeline(&self.resolve);
            pass.set_bind_group(0, &resolve_group, &[]);
            pass.dispatch_workgroups(t.w.div_ceil(8), t.h.div_ceil(8), 1);
        }
        self.queue.submit([encoder.finish()]);
        if let Some(error) = pollster::block_on(scope.pop()) {
            return Err(error.to_string());
        }
        self.last_render_ms = start.elapsed().as_secs_f64() * 1000.0;
        Ok(())
    }
    /// One capture staging buffer bounds memory; the CLI waits, ordinary submit does not.
    pub fn capture(&self) -> Result<Vec<u8>, String> {
        let t = self
            .target
            .as_ref()
            .ok_or("Submit a frame before capture")?;
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            t.output.texture.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &t.capture,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(t.row),
                    rows_per_image: Some(t.h),
                },
            },
            wgpu::Extent3d {
                width: t.w,
                height: t.h,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit([encoder.finish()]);
        let (tx, rx) = mpsc::channel();
        t.capture
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |result| {
                let _ = tx.send(result);
            });
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: None,
                timeout: Some(Duration::from_secs(30)),
            })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(30))
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        let mapped = t
            .capture
            .slice(..)
            .get_mapped_range()
            .map_err(|e| e.to_string())?;
        let mut output = vec![0u8; t.w as usize * t.h as usize * 4];
        for y in 0..t.h as usize {
            output[y * t.w as usize * 4..(y + 1) * t.w as usize * 4].copy_from_slice(
                &mapped[y * t.row as usize..y * t.row as usize + t.w as usize * 4],
            );
        }
        drop(mapped);
        t.capture.unmap();
        Ok(output)
    }
    pub fn render(
        &mut self,
        scene: &Compiled,
        options: &serde_json::Value,
    ) -> Result<Vec<u8>, String> {
        self.render_with_lighting(scene, options, None, None)
    }
    pub fn render_with_lighting(
        &mut self,
        scene: &Compiled,
        options: &serde_json::Value,
        radiance: Option<&[f32]>,
        occlusion: Option<&[f32]>,
    ) -> Result<Vec<u8>, String> {
        let start = Instant::now();
        self.submit_with_lighting(scene, options, radiance, occlusion)?;
        let result = self.capture();
        self.last_render_ms = start.elapsed().as_secs_f64() * 1000.0;
        result
    }
    fn upload_float_layer(
        &mut self,
        name: &str,
        values: Option<&[f32]>,
        length: usize,
        maximum: Option<f32>,
    ) -> Result<wgpu::Buffer, String> {
        let Some(values) = values else {
            return Ok(self.zero.clone());
        };
        if values.len() != length
            || values
                .iter()
                .any(|v| !v.is_finite() || *v < 0.0 || maximum.is_some_and(|maximum| *v > maximum))
        {
            return Err(format!("Invalid {name} buffer"));
        }
        let bytes: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
        self.upload(name, &bytes, &format!("{:x}", Sha256::digest(&bytes)))
    }
    pub fn output_texture(&self) -> Option<&wgpu::Texture> {
        self.target.as_ref().map(|t| &t.output.texture)
    }
}
