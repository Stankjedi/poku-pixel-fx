use crate::draw::{Command, DrawAsset, Material, Rect, Scene};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
};
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Socket {
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub angle: f32,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basis_x: Option<[f32; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basis_y: Option<[f32; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mirror_policy: Option<String>,
}
fn yes() -> bool {
    true
}
#[derive(Clone, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub page: usize,
    pub rect: Rect,
    pub source_size: [u32; 2],
    pub trim_offset: [f32; 2],
    pub pivot: [f32; 2],
    pub duration: u32,
    pub time: f64,
    #[serde(default)]
    pub sockets: HashMap<String, Socket>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FloatLayer {
    image: String,
    format: String,
    channels: u32,
    color_space: String,
}
#[derive(Deserialize)]
struct Page {
    image: String,
    width: u32,
    height: u32,
    emission: Option<FloatLayer>,
    radiance: Option<FloatLayer>,
    occlusion: Option<FloatLayer>,
}
#[derive(Deserialize)]
struct FileHash {
    path: String,
    sha256: String,
    bytes: usize,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetEvent {
    pub name: String,
    pub time_ms: f64,
    pub source_time: f64,
    #[serde(default)]
    pub payload: serde_json::Value,
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEvent {
    pub event: AssetEvent,
    pub cycle: u64,
    pub elapsed_ms: f64,
}
#[derive(Deserialize)]
struct Manifest {
    schema: String,
    #[serde(rename = "loop")]
    looping: bool,
    frames: Vec<Frame>,
    pages: Vec<Page>,
    #[serde(default)]
    files: Vec<FileHash>,
    #[serde(default)]
    events: Vec<AssetEvent>,
    #[serde(default)]
    settings: serde_json::Value,
}
pub struct Asset {
    pub frames: Vec<Frame>,
    pub pages: Vec<DrawAsset>,
    pub looping: bool,
    pub duration_ms: u64,
    pub events: Vec<AssetEvent>,
    pub settings: serde_json::Value,
    pub lighting: Vec<PageLighting>,
}
#[derive(Clone, Default, Debug)]
pub struct PageLighting {
    pub radiance: Option<Vec<f32>>,
    pub occlusion: Option<Vec<f32>>,
}
/// Frame-sized external lighting, preserving the compositor's separate RGB and AO contracts.
#[derive(Default, Debug)]
pub struct FrameLighting {
    pub radiance: Option<Vec<f32>>,
    pub occlusion: Option<Vec<f32>>,
}
fn relative(root: &Path, path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Bundle file paths must remain relative to the manifest".into());
    }
    Ok(root.join(path))
}
fn read_float_layer(
    root: &Path,
    layer: &FloatLayer,
    pixels: usize,
    channels: u32,
    color_space: &str,
    maximum: Option<f32>,
) -> Result<Vec<f32>, String> {
    if layer.format != "float32-le"
        || layer.channels != channels
        || layer.color_space != color_space
    {
        return Err(format!("Unsupported float layer encoding: {}", layer.image));
    }
    let bytes = fs::read(relative(root, &layer.image)?).map_err(|e| e.to_string())?;
    if bytes.len() != pixels * channels as usize * 4 {
        return Err(format!("Float layer buffer size mismatch: {}", layer.image));
    }
    let values: Vec<_> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    if values
        .iter()
        .any(|v| !v.is_finite() || *v < 0.0 || maximum.is_some_and(|maximum| *v > maximum))
    {
        return Err(format!(
            "Invalid linear float layer values: {}",
            layer.image
        ));
    }
    Ok(values)
}
impl Asset {
    pub fn load(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let root = path.parent().unwrap_or(Path::new("."));
        let manifest: Manifest =
            serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if manifest.schema != "poku-asset/v1"
            || manifest.frames.is_empty()
            || manifest.pages.is_empty()
        {
            return Err("Invalid poku-asset/v1 manifest".into());
        }
        for file in &manifest.files {
            let bytes = fs::read(relative(root, &file.path)?).map_err(|e| e.to_string())?;
            if bytes.len() != file.bytes
                || format!("{:x}", Sha256::digest(&bytes)) != file.sha256.to_lowercase()
            {
                return Err(format!("Bundle integrity mismatch: {}", file.path));
            }
        }
        let mut pages = Vec::new();
        let mut lighting = Vec::new();
        for (index, page) in manifest.pages.iter().enumerate() {
            if page.width == 0
                || page.height == 0
                || u64::from(page.width) * u64::from(page.height) > 16_777_216
            {
                return Err("Atlas page exceeds native pixel budget".into());
            }
            let image_bytes = fs::read(relative(root, &page.image)?).map_err(|e| e.to_string())?;
            let image = image::load_from_memory_with_format(&image_bytes, image::ImageFormat::Png)
                .map_err(|e| e.to_string())?
                .to_rgba8();
            if image.width() != page.width || image.height() != page.height {
                return Err("Atlas dimensions differ from manifest".into());
            }
            let color: Vec<_> = image
                .as_raw()
                .chunks_exact(4)
                .map(|p| u32::from_le_bytes([p[0], p[1], p[2], p[3]]))
                .collect();
            let emission = if let Some(e) = &page.emission {
                Some(read_float_layer(
                    root,
                    e,
                    color.len(),
                    3,
                    "linear-srgb",
                    None,
                )?)
            } else {
                None
            };
            lighting.push(PageLighting {
                radiance: page
                    .radiance
                    .as_ref()
                    .map(|e| read_float_layer(root, e, color.len(), 3, "linear-srgb", None))
                    .transpose()?,
                occlusion: page
                    .occlusion
                    .as_ref()
                    .map(|e| read_float_layer(root, e, color.len(), 1, "linear", Some(1.0)))
                    .transpose()?,
            });
            let mut revision = Sha256::new();
            revision.update(&image_bytes);
            if let Some(values) = &emission {
                for value in values {
                    revision.update(value.to_le_bytes());
                }
            }
            pages.push(DrawAsset {
                id: format!("page-{index}"),
                revision: serde_json::json!(format!("{:x}", revision.finalize())),
                width: page.width,
                height: page.height,
                color,
                emission,
            });
        }
        let mut duration_ms = 0u64;
        for frame in &manifest.frames {
            let page = pages.get(frame.page).ok_or("Frame page missing")?;
            if frame.duration == 0
                || !frame.time.is_finite()
                || frame.source_size.contains(&0)
                || frame
                    .pivot
                    .iter()
                    .chain(frame.trim_offset.iter())
                    .any(|v| !v.is_finite())
                || frame.rect.w == 0
                || frame.rect.h == 0
                || frame
                    .rect
                    .x
                    .checked_add(frame.rect.w)
                    .is_none_or(|v| v > page.width)
                || frame
                    .rect
                    .y
                    .checked_add(frame.rect.h)
                    .is_none_or(|v| v > page.height)
            {
                return Err("Invalid frame geometry or duration".into());
            }
            for socket in frame.sockets.values() {
                if !socket.x.is_finite()
                    || !socket.y.is_finite()
                    || !socket.angle.is_finite()
                    || socket
                        .basis_x
                        .iter()
                        .chain(socket.basis_y.iter())
                        .flatten()
                        .any(|v| !v.is_finite())
                    || socket.mirror_policy.as_ref().is_some_and(|v| {
                        !["reflect", "swap-hand", "authored"].contains(&v.as_str())
                    })
                {
                    return Err("Invalid socket coordinates or mirror policy".into());
                }
            }
            duration_ms += u64::from(frame.duration);
        }
        if manifest.events.iter().any(|e| {
            e.name.is_empty()
                || !e.time_ms.is_finite()
                || e.time_ms < 0.0
                || e.time_ms > duration_ms as f64
                || !e.source_time.is_finite()
        }) {
            return Err("Invalid asset event".into());
        }
        let mut events = manifest.events;
        events.sort_by(|a, b| a.time_ms.total_cmp(&b.time_ms));
        Ok(Self {
            frames: manifest.frames,
            pages,
            looping: manifest.looping,
            duration_ms,
            events,
            settings: manifest.settings,
            lighting,
        })
    }
    pub fn frame_at_ms(&self, elapsed_ms: f64) -> usize {
        let elapsed = elapsed_ms.max(0.0);
        let mut clock = if self.looping {
            elapsed % self.duration_ms as f64
        } else {
            elapsed.min(self.duration_ms as f64 - f64::EPSILON)
        };
        for (i, frame) in self.frames.iter().enumerate() {
            if clock < f64::from(frame.duration) {
                return i;
            }
            clock -= f64::from(frame.duration);
        }
        self.frames.len() - 1
    }
    /// Resolve declared source finishing and keep a final palette lock even with caller overrides.
    pub fn render_options(
        &self,
        overrides: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        resolve_asset_render_options(&self.settings, overrides)
    }
    /// Restore external lighting with the same pixel-center source-cell ownership as scene().
    /// This reference asset scene API supports translation; transformed scene hosts must transform
    /// these screen-space layers along with the sprite rather than applying them globally.
    pub fn frame_lighting(
        &self,
        frame_index: usize,
        width: u32,
        height: u32,
        position: [f32; 2],
    ) -> Result<FrameLighting, String> {
        if width == 0
            || height == 0
            || u64::from(width) * u64::from(height) > 16_777_216
            || position.iter().any(|v| !v.is_finite())
        {
            return Err("Invalid native lighting target".into());
        }
        let frame = self.frames.get(frame_index).ok_or("Frame missing")?;
        let Some(lighting) = self.lighting.get(frame.page) else {
            return Ok(FrameLighting::default());
        };
        if lighting.radiance.is_none() && lighting.occlusion.is_none() {
            return Ok(FrameLighting::default());
        }
        let page = self.pages.get(frame.page).ok_or("Frame page missing")?;
        let page_pixels = page.width as usize * page.height as usize;
        if lighting
            .radiance
            .as_ref()
            .is_some_and(|a| a.len() != page_pixels * 3)
            || lighting
                .occlusion
                .as_ref()
                .is_some_and(|a| a.len() != page_pixels)
        {
            return Err("Invalid asset lighting array lengths".into());
        }
        let pixels = width as usize * height as usize;
        let mut result = FrameLighting {
            radiance: lighting.radiance.as_ref().map(|_| vec![0.0; pixels * 3]),
            occlusion: lighting.occlusion.as_ref().map(|_| vec![1.0; pixels]),
        };
        let origin = [
            position[0] - frame.pivot[0] + frame.trim_offset[0],
            position[1] - frame.pivot[1] + frame.trim_offset[1],
        ];
        for y in 0..height {
            let sy = (y as f32 + 0.5 - origin[1]).floor();
            if sy < 0.0 || sy >= frame.rect.h as f32 {
                continue;
            }
            for x in 0..width {
                let sx = (x as f32 + 0.5 - origin[0]).floor();
                if sx < 0.0 || sx >= frame.rect.w as f32 {
                    continue;
                }
                let source = (frame.rect.y + sy as u32) as usize * page.width as usize
                    + (frame.rect.x + sx as u32) as usize;
                let target = y as usize * width as usize + x as usize;
                if let (Some(input), Some(output)) = (&lighting.radiance, &mut result.radiance) {
                    output[target * 3..target * 3 + 3]
                        .copy_from_slice(&input[source * 3..source * 3 + 3]);
                }
                if let (Some(input), Some(output)) = (&lighting.occlusion, &mut result.occlusion) {
                    output[target] = input[source];
                }
            }
        }
        Ok(result)
    }
    pub fn scene(&self, frame_index: usize, width: u32, height: u32, position: [f32; 2]) -> Scene {
        let frame = &self.frames[frame_index];
        Scene {
            schema: "poku-draw/v1".into(),
            width,
            height,
            assets: self.pages.clone(),
            commands: vec![Command::Sprite {
                asset: format!("page-{}", frame.page),
                origin: [
                    position[0] - frame.pivot[0] + frame.trim_offset[0],
                    position[1] - frame.pivot[1] + frame.trim_offset[1],
                    0.0,
                ],
                axis_x: None,
                axis_y: None,
                region: Some(frame.rect),
                material: Material::default(),
            }],
        }
    }
}
pub fn resolve_asset_render_options(
    settings: &serde_json::Value,
    overrides: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    if !overrides.is_object() && !overrides.is_null() {
        return Err("Native render options must be an object".into());
    }
    let project = &settings["project"];
    // A resolved scene profile includes default camera-light finishing values even if the
    // authored 3D project omitted them. Other project types keep their declared own profile.
    let profile = if settings["renderProfile"].is_object()
        && (project["kind"] == "3d" || !project["renderProfile"].is_object())
    {
        &settings["renderProfile"]
    } else {
        &project["renderProfile"]
    };
    let declared_mode = profile["mode"].as_str().or(settings["renderMode"].as_str());
    if declared_mode
        .is_some_and(|mode| !matches!(mode, "legacy" | "cinematic" | "linear-transparent"))
    {
        return Err("Unsupported asset render mode".into());
    }
    let override_mode = match overrides.get("mode") {
        None => None,
        Some(value) => match value.as_str() {
            Some(mode @ ("cinematic" | "linear-transparent")) => Some(mode),
            _ => return Err("Native options.mode must be 'cinematic' or 'linear-transparent'; legacy encoded-light compositing is unsupported".into()),
        },
    };
    let mode = override_mode.or(declared_mode);
    if mode.is_none() || mode == Some("legacy") {
        return Err("Native reference renderer uses linear HDR. This asset declares legacy encoded-light compositing or omits its finishing mode, whose 2D authoring default is legacy; provide explicit options.mode:'cinematic' or 'linear-transparent' to choose different finishing, or bake final RGBA instead".into());
    }
    let identity = mode == Some("linear-transparent");
    let mut resolved = if identity {
        serde_json::json!({"bloom":false,"toneMap":"none","exposure":1,"saturation":1,"contrast":1,"vignette":0,"chromaticFringe":0})
    } else if declared_mode == Some("cinematic") || project["kind"] == "3d" {
        serde_json::json!({"bloom":{"threshold":0.12,"knee":0.2,"intensity":0.7,"levels":3},"toneMap":"aces","exposure":1})
    } else {
        serde_json::json!({})
    };
    let cinematic = if profile["cinematic"].is_object() {
        &profile["cinematic"]
    } else {
        profile
    };
    if let Some(values) = cinematic.as_object().filter(|_| !identity) {
        for key in [
            "bloom",
            "toneMap",
            "exposure",
            "lightStrength",
            "highlightColor",
            "saturation",
            "contrast",
            "vignette",
            "chromaticFringe",
            "finalPalette",
        ] {
            if let Some(value) = values.get(key) {
                resolved[key] = value.clone();
            }
        }
    }
    if let Some(values) = overrides.as_object() {
        for (key, value) in values {
            resolved[key] = value.clone();
        }
    }
    let style = &project["pixelStyle"];
    if style["finalColorPolicy"] == "palette-locked" {
        let palette = style["palette"]
            .as_array()
            .ok_or("Palette-locked asset has no palette")?;
        if palette.is_empty()
            || palette.len() > 256
            || palette.iter().any(|c| {
                c.as_i64()
                    .is_none_or(|v| !(-2147483648..=4294967295).contains(&v))
            })
        {
            return Err("Invalid final palette".into());
        }
        resolved["finalPalette"] = style["palette"].clone();
    }
    Ok(resolved)
}
pub struct AssetPlayer {
    pub asset: Asset,
    pub elapsed_ms: f64,
    pub speed: f64,
    pub paused: bool,
    pending_events: Vec<PlaybackEvent>,
}
impl AssetPlayer {
    pub fn new(asset: Asset) -> Self {
        let pending_events = asset
            .events
            .iter()
            .filter(|e| e.time_ms == 0.0)
            .map(|event| PlaybackEvent {
                event: event.clone(),
                cycle: 0,
                elapsed_ms: 0.0,
            })
            .collect();
        Self {
            asset,
            elapsed_ms: 0.0,
            speed: 1.0,
            paused: false,
            pending_events,
        }
    }
    pub fn advance(&mut self, seconds: f64) -> Result<usize, String> {
        if !seconds.is_finite() || seconds < 0.0 || !self.speed.is_finite() || self.speed < 0.0 {
            return Err("Invalid player clock".into());
        }
        if !self.paused {
            let end = self.elapsed_ms + seconds * 1000.0 * self.speed;
            if !end.is_finite() {
                return Err("Player clock overflow".into());
            }
            if !self.asset.events.is_empty() {
                let duration = self.asset.duration_ms as f64;
                let first = if self.asset.looping {
                    (self.elapsed_ms / duration).floor() as u64
                } else {
                    0
                };
                let last = if self.asset.looping {
                    (end / duration).floor() as u64
                } else {
                    0
                };
                if last.saturating_sub(first) > 4096
                    || (last - first + 1) as usize * self.asset.events.len()
                        + self.pending_events.len()
                        > 16384
                {
                    return Err(
                        "Event queue budget reached; advance in smaller intervals and drain events"
                            .into(),
                    );
                }
                for cycle in first..=last {
                    for event in &self.asset.events {
                        let at = cycle as f64 * duration + event.time_ms;
                        if at > self.elapsed_ms && at <= end {
                            self.pending_events.push(PlaybackEvent {
                                event: event.clone(),
                                cycle,
                                elapsed_ms: at,
                            });
                        }
                    }
                }
            }
            self.elapsed_ms = end;
        }
        Ok(self.frame_index())
    }
    pub fn seek(&mut self, seconds: f64) -> Result<usize, String> {
        if !seconds.is_finite() || seconds < 0.0 {
            return Err("Invalid seek time".into());
        }
        self.elapsed_ms = seconds * 1000.0;
        self.pending_events.clear();
        Ok(self.frame_index())
    }
    pub fn drain_events(&mut self) -> Vec<PlaybackEvent> {
        std::mem::take(&mut self.pending_events)
    }
    pub fn frame_index(&self) -> usize {
        self.asset.frame_at_ms(self.elapsed_ms)
    }
    pub fn socket(
        &self,
        name: &str,
        position: [f32; 2],
        scale: f32,
        rotation: f32,
        flip_x: bool,
    ) -> Option<Socket> {
        let frame = &self.asset.frames[self.frame_index()];
        let s = frame.sockets.get(name)?;
        let x = (s.x - frame.pivot[0]) * scale * if flip_x { -1.0 } else { 1.0 };
        let y = (s.y - frame.pivot[1]) * scale;
        let (sin, cos) = rotation.sin_cos();
        let transform = |basis: [f32; 2]| {
            let x = basis[0] * scale * if flip_x { -1.0 } else { 1.0 };
            let y = basis[1] * scale;
            [x * cos - y * sin, x * sin + y * cos]
        };
        let (local_sin, local_cos) = s.angle.sin_cos();
        let basis_x = transform(s.basis_x.unwrap_or([local_cos, local_sin]));
        let basis_y = transform(s.basis_y.unwrap_or([-local_sin, local_cos]));
        Some(Socket {
            x: position[0] + x * cos - y * sin,
            y: position[1] + x * sin + y * cos,
            angle: basis_x[1].atan2(basis_x[0]),
            visible: s.visible,
            basis_x: Some(basis_x),
            basis_y: Some(basis_y),
            mirror_policy: s.mirror_policy.clone(),
        })
    }
}
