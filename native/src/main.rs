use poku_pixel_fx_player::{
    asset::{Asset, AssetPlayer},
    draw::{self, Scene},
    gpu::Renderer,
};
use std::{env, fs, path::PathBuf};
fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|a| a == "--help") {
        println!(
            "poku-player <asset.manifest.json | scene.draw.json> --out <directory> [--frames 60 --fps 60 --width 256 --height 256 --options cinematic.json --socket hand]"
        );
        return Ok(());
    }
    let option = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let number = |name: &str, default: u32| -> Result<u32, String> {
        option(name)
            .map(|s| s.parse().map_err(|_| format!("Invalid {name}")))
            .unwrap_or(Ok(default))
    };
    let out = PathBuf::from(option("--out").unwrap_or_else(|| "native-output".into()));
    let frames = number("--frames", 1)?;
    let fps = number("--fps", 60)?;
    if frames == 0 || frames > 36000 || fps == 0 || fps > 1000 {
        return Err("Invalid playback frame count or fps".into());
    }
    fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(&args[0]).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let options: serde_json::Value = if let Some(path) = option("--options") {
        serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
    } else {
        serde_json::json!({})
    };
    let mut renderer = pollster::block_on(Renderer::new())?;
    let mut trace = Vec::new();
    if value["schema"] == "poku-asset/v1" {
        let mut player = AssetPlayer::new(Asset::load(&args[0])?);
        let options = player.asset.render_options(&options)?;
        let source = player.asset.frames[0].source_size;
        let width = number("--width", source[0])?;
        let height = number("--height", source[1])?;
        for tick in 0..frames {
            let index = player.frame_index();
            let frame = &player.asset.frames[index];
            // Native pixel-edge origin: default anchor places the untrimmed frame at (0,0).
            let position = frame.pivot;
            let scene = player.asset.scene(index, width, height, position);
            let lighting = player
                .asset
                .frame_lighting(index, width, height, position)?;
            let compiled = draw::compile(&scene)?;
            let rgba = renderer.render_with_lighting(
                &compiled,
                &options,
                lighting.radiance.as_deref(),
                lighting.occlusion.as_deref(),
            )?;
            image::save_buffer(
                out.join(format!("frame-{tick:05}.png")),
                &rgba,
                width,
                height,
                image::ColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
            let socket =
                option("--socket").and_then(|name| player.socket(&name, position, 1.0, 0.0, false));
            let authored_time = frame.time;
            let events = player.drain_events();
            trace.push(serde_json::json!({"tick":tick,"elapsedMs":player.elapsed_ms,"frame":index,"authoredTime":authored_time,"socket":socket,"events":events,"uploadBytes":renderer.uploaded_bytes,"renderCaptureMs":renderer.last_render_ms}));
            player.advance(1.0 / f64::from(fps))?;
        }
    } else {
        let scene: Scene = serde_json::from_value(value).map_err(|e| e.to_string())?;
        let compiled = draw::compile(&scene)?;
        for tick in 0..frames {
            let rgba = renderer.render(&compiled, &options)?;
            image::save_buffer(
                out.join(format!("frame-{tick:05}.png")),
                &rgba,
                scene.width,
                scene.height,
                image::ColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
            trace.push(serde_json::json!({"tick":tick,"uploadBytes":renderer.uploaded_bytes,"renderCaptureMs":renderer.last_render_ms}));
        }
    }
    let info = &renderer.adapter_info;
    let report = serde_json::json!({"adapter":format!("{:?}",info),"software":info.device_type == wgpu::DeviceType::Cpu,"frames":trace,"scope":"native wgpu render + capture; no physical-GPU performance claim"});
    fs::write(
        out.join("playback.json"),
        serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    println!(
        "{} frames rendered to {} using {} ({:?})",
        frames,
        out.display(),
        info.name,
        info.device_type
    );
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("poku-player: {error}");
        std::process::exit(1);
    }
}
