//! Tiny interoperable fixture for an actual atlas/player round trip, no third-party art.
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from(
        env::args()
            .nth(1)
            .unwrap_or_else(|| "native-fixture".into()),
    );
    fs::create_dir_all(&dir)?;
    let image = image::RgbaImage::from_raw(
        4,
        2,
        vec![
            255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128, 255, 255, 255, 255, 255, 0,
            0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
        ],
    )
    .unwrap();
    image.save(dir.join("fixture.color.png"))?;
    let mut emission = vec![0f32; 24];
    emission[0] = 2.0;
    emission[7] = 1.5;
    let data: Vec<u8> = emission.iter().flat_map(|v| v.to_le_bytes()).collect();
    fs::write(dir.join("fixture.emission.f32"), data)?;
    let files: Vec<_> = ["fixture.color.png", "fixture.emission.f32"].into_iter().map(|name| { let bytes = fs::read(dir.join(name)).unwrap(); serde_json::json!({"path":name,"bytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes))}) }).collect();
    let manifest = serde_json::json!({"schema":"poku-asset/v1","id":"native-fixture","name":"Native contract fixture","loop":true,"durationMs":160,
        "settings":{"renderMode":"cinematic","renderProfile":{"cinematic":{"bloom":{"threshold":0.16,"knee":0.18,"intensity":0.9,"levels":4},"toneMap":"aces","exposure":1.15}}},
        "pages":[{"image":"fixture.color.png","width":4,"height":2,"emission":{"image":"fixture.emission.f32","format":"float32-le","channels":3,"colorSpace":"linear-srgb"}}],
        "frames":[{"page":0,"rect":{"x":0,"y":0,"w":2,"h":2},"sourceSize":[4,4],"trimOffset":[1,1],"pivot":[2,3],"duration":40,"time":-0.04,"sockets":{"hand":{"x":3,"y":2}}},
        {"page":0,"rect":{"x":2,"y":0,"w":2,"h":2},"sourceSize":[4,4],"trimOffset":[1,1],"pivot":[2,3],"duration":120,"time":0,"frozen":true,"sockets":{"hand":{"x":3,"y":1}}}],
        "events":[{"name":"hit","timeMs":40,"sourceTime":0,"payload":{"strength":1}}],"tags":[{"name":"all","from":0,"to":1,"direction":"forward"}],"files":files});
    fs::write(
        dir.join("fixture.asset.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    println!("{}", dir.join("fixture.asset.json").display());
    Ok(())
}
