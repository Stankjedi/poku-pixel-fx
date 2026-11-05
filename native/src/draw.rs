use serde::{Deserialize, Serialize};
use std::collections::HashMap;
pub type Point = [f32; 3];
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub color: u32,
    #[serde(default = "one")]
    pub opacity: f32,
    #[serde(default = "alpha")]
    pub blend: String,
    #[serde(default = "half")]
    pub cutoff: f32,
    #[serde(default)]
    pub emission: [f32; 3],
    #[serde(default)]
    pub emission_kind: Option<String>,
}
fn one() -> f32 {
    1.0
}
fn half() -> f32 {
    0.5
}
fn alpha() -> String {
    "alpha".into()
}
impl Default for Material {
    fn default() -> Self {
        Self {
            color: u32::MAX,
            opacity: 1.0,
            blend: alpha(),
            cutoff: 0.5,
            emission: [0.0; 3],
            emission_kind: None,
        }
    }
}
#[derive(Clone, Copy, Deserialize, Serialize, Debug)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum Command {
    Rect {
        origin: Point,
        size: [f32; 2],
        material: Material,
    },
    Disc {
        center: Point,
        radius: f32,
        material: Material,
    },
    Segment {
        from: Point,
        to: Point,
        width: f32,
        material: Material,
    },
    Triangle {
        vertices: [Point; 3],
        material: Material,
    },
    Sprite {
        asset: String,
        origin: Point,
        #[serde(rename = "axisX")]
        axis_x: Option<[f32; 2]>,
        #[serde(rename = "axisY")]
        axis_y: Option<[f32; 2]>,
        region: Option<Rect>,
        material: Material,
    },
    Ribbon {
        points: Vec<Point>,
        width: f32,
        material: Material,
    },
    Mesh {
        vertices: Vec<Point>,
        indices: Vec<usize>,
        material: Material,
    },
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct DrawAsset {
    pub id: String,
    pub revision: serde_json::Value,
    pub width: u32,
    pub height: u32,
    pub color: Vec<u32>,
    #[serde(default)]
    pub emission: Option<Vec<f32>>,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Scene {
    pub schema: String,
    pub width: u32,
    pub height: u32,
    pub commands: Vec<Command>,
    #[serde(default)]
    pub assets: Vec<DrawAsset>,
}
pub struct Compiled {
    pub width: u32,
    pub height: u32,
    pub count: u32,
    pub commands: Vec<u8>,
    pub color: Vec<u8>,
    pub emission: Vec<u8>,
    pub asset_revision: String,
}
fn err(s: &str) -> String {
    s.into()
}
fn finite(p: &[f32]) -> Result<(), String> {
    if p.iter().all(|v| v.is_finite()) {
        Ok(())
    } else {
        Err(err("Nonfinite DrawIR coordinate"))
    }
}
fn flatten(command: &Command, out: &mut Vec<Command>) -> Result<(), String> {
    match command {
        Command::Mesh {
            vertices,
            indices,
            material,
        } => {
            if indices.len() % 3 != 0 {
                return Err(err("Incomplete mesh triangle"));
            }
            for face in indices.chunks(3) {
                if face.iter().any(|i| *i >= vertices.len()) {
                    return Err(err("Mesh index out of range"));
                }
                out.push(Command::Triangle {
                    vertices: [vertices[face[0]], vertices[face[1]], vertices[face[2]]],
                    material: material.clone(),
                });
            }
        }
        Command::Ribbon {
            points,
            width,
            material,
        } => {
            for pair in points.windows(2) {
                out.push(Command::Segment {
                    from: pair[0],
                    to: pair[1],
                    width: *width,
                    material: material.clone(),
                });
            }
        }
        _ => out.push(command.clone()),
    }
    Ok(())
}
fn put(words: &mut [u32; 32], offset: usize, data: &[f32]) {
    for (i, v) in data.iter().enumerate() {
        words[offset + i] = v.to_bits();
    }
}
pub fn compile(scene: &Scene) -> Result<Compiled, String> {
    if scene.schema != "poku-draw/v1" || scene.width == 0 || scene.height == 0 {
        return Err(err("Invalid DrawIR schema or size"));
    }
    let mut assets = HashMap::new();
    let mut color = Vec::<u8>::new();
    let mut emission = Vec::<u8>::new();
    for a in &scene.assets {
        let size = (a.width as usize)
            .checked_mul(a.height as usize)
            .ok_or("Asset dimensions overflow")?;
        if size == 0
            || a.color.len() != size
            || a.emission.as_ref().is_some_and(|e| {
                e.len() != size * 3 || e.iter().any(|v| !v.is_finite() || *v < 0.0)
            })
            || assets.contains_key(&a.id)
        {
            return Err(err("Invalid DrawIR asset"));
        }
        assets.insert(a.id.clone(), (a, (color.len() / 4) as u32));
        for value in &a.color {
            color.extend(value.to_le_bytes());
        }
        if let Some(values) = &a.emission {
            for v in values {
                emission.extend(v.to_le_bytes());
            }
        } else {
            emission.resize(emission.len() + size * 12, 0);
        }
    }
    let mut primitives = Vec::new();
    for c in &scene.commands {
        flatten(c, &mut primitives)?;
    }
    if primitives.len() > 16384 {
        return Err(err("DrawIR primitive budget exceeded"));
    }
    let count = primitives.len() as u32;
    let mut commands = Vec::new();
    let mut alpha_count = 0;
    for c in &primitives {
        let m = match c {
            Command::Rect { material, .. }
            | Command::Disc { material, .. }
            | Command::Segment { material, .. }
            | Command::Triangle { material, .. }
            | Command::Sprite { material, .. } => material,
            _ => unreachable!(),
        };
        finite(&[m.opacity, m.cutoff])?;
        finite(&m.emission)?;
        if !(0.0..=1.0).contains(&m.opacity)
            || !(0.0..=1.0).contains(&m.cutoff)
            || m.emission.iter().any(|v| *v < 0.0)
        {
            return Err(err("Invalid DrawIR material"));
        }
        let blend = match m.blend.as_str() {
            "opaque" => 0,
            "alpha" => {
                alpha_count += 1;
                1
            }
            "cutout" => 2,
            "additive" => 3,
            _ => return Err(err("Unknown material blend")),
        };
        if alpha_count > 64 {
            return Err(err("Exact alpha primitive budget (64) exceeded"));
        }
        if m.emission_kind
            .as_ref()
            .is_some_and(|v| v != "surface" && v != "optical")
        {
            return Err(err("Unknown emission kind"));
        }
        let mut w = [0u32; 32];
        w[1] = m.color;
        w[2] = blend;
        w[3] = u32::from(m.emission_kind.as_deref() == Some("optical"));
        put(&mut w, 16, &[m.opacity, m.cutoff]);
        put(&mut w, 20, &m.emission);
        match c {
            Command::Rect { origin, size, .. } => {
                finite(origin)?;
                finite(size)?;
                if size.iter().any(|v| *v <= 0.0) {
                    return Err(err("Invalid rectangle"));
                }
                put(&mut w, 4, origin);
                put(&mut w, 7, &[size[0]]);
                put(&mut w, 11, &[size[1]]);
            }
            Command::Disc { center, radius, .. } => {
                finite(center)?;
                if !radius.is_finite() || *radius < 0.0 {
                    return Err(err("Invalid disc"));
                }
                w[0] = 1;
                put(&mut w, 4, center);
                put(&mut w, 7, &[*radius]);
            }
            Command::Segment {
                from, to, width, ..
            } => {
                finite(from)?;
                finite(to)?;
                if !width.is_finite() || *width <= 0.0 {
                    return Err(err("Invalid segment"));
                }
                w[0] = 2;
                put(&mut w, 4, from);
                put(&mut w, 8, to);
                put(&mut w, 7, &[width / 2.0]);
            }
            Command::Triangle { vertices, .. } => {
                w[0] = 3;
                for (i, p) in vertices.iter().enumerate() {
                    finite(p)?;
                    put(&mut w, 4 + i * 4, p);
                }
            }
            Command::Sprite {
                asset,
                origin,
                axis_x,
                axis_y,
                region,
                ..
            } => {
                let (a, offset) = assets.get(asset).ok_or("Sprite asset missing")?;
                let x = axis_x.unwrap_or([1.0, 0.0]);
                let y = axis_y.unwrap_or([0.0, 1.0]);
                finite(origin)?;
                finite(&x)?;
                finite(&y)?;
                if (x[0] * y[1] - x[1] * y[0]).abs() < 1e-8 {
                    return Err(err("Singular sprite transform"));
                }
                let r = region.unwrap_or(Rect {
                    x: 0,
                    y: 0,
                    w: a.width,
                    h: a.height,
                });
                if r.w == 0
                    || r.h == 0
                    || r.x.checked_add(r.w).is_none_or(|v| v > a.width)
                    || r.y.checked_add(r.h).is_none_or(|v| v > a.height)
                {
                    return Err(err("Sprite region outside atlas"));
                }
                w[0] = 4;
                w[3] |= if a.emission.is_some() { 2 } else { 0 };
                put(&mut w, 4, origin);
                put(&mut w, 8, &x);
                put(&mut w, 12, &y);
                put(&mut w, 18, &[r.w as f32, r.h as f32]);
                w[24] = *offset;
                w[25] = a.width;
                w[26] = r.x;
                w[27] = r.y;
            }
            _ => unreachable!(),
        }
        for word in w {
            commands.extend(word.to_le_bytes());
        }
    }
    commands.resize(commands.len().max(128), 0);
    color.resize(color.len().max(4), 0);
    emission.resize(emission.len().max(12), 0);
    let revisions: Vec<_> = scene
        .assets
        .iter()
        .map(|a| (&a.id, &a.revision, a.width, a.height, a.emission.is_some()))
        .collect();
    Ok(Compiled {
        width: scene.width,
        height: scene.height,
        count,
        commands,
        color,
        emission,
        asset_revision: serde_json::to_string(&revisions).map_err(|e| e.to_string())?,
    })
}
