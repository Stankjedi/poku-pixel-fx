use poku_pixel_fx_player::{
    asset::{Asset, AssetEvent, AssetPlayer, Frame, Socket},
    draw::{self, Rect, Scene},
};
use std::collections::HashMap;
fn asset(looping: bool) -> Asset {
    let make = |duration, x| Frame {
        page: 0,
        rect: Rect {
            x: 0,
            y: 0,
            w: 2,
            h: 2,
        },
        source_size: [8, 8],
        trim_offset: [2.0, 1.0],
        pivot: [4.0, 6.0],
        duration,
        time: -0.1,
        sockets: HashMap::from([(
            "hand".into(),
            Socket {
                x,
                y: 4.0,
                angle: 0.0,
                visible: true,
                basis_x: Some([1.0, 0.0]),
                basis_y: Some([0.0, 1.0]),
                mirror_policy: Some("reflect".into()),
            },
        )]),
    };
    Asset {
        frames: vec![make(40, 6.0), make(120, 7.0)],
        pages: vec![],
        lighting: vec![],
        looping,
        duration_ms: 160,
        settings: serde_json::json!({"renderMode":"linear-transparent"}),
        events: vec![
            AssetEvent {
                name: "begin".into(),
                time_ms: 0.0,
                source_time: -0.1,
                payload: serde_json::Value::Null,
            },
            AssetEvent {
                name: "hit".into(),
                time_ms: 80.0,
                source_time: 0.0,
                payload: serde_json::json!({"amount": 2}),
            },
        ],
    }
}
#[test]
fn variable_duration_and_loop_boundary() {
    let a = asset(true);
    assert_eq!(a.frame_at_ms(0.0), 0);
    assert_eq!(a.frame_at_ms(39.99), 0);
    assert_eq!(a.frame_at_ms(40.0), 1);
    assert_eq!(a.frame_at_ms(159.99), 1);
    assert_eq!(a.frame_at_ms(160.0), 0);
    assert_eq!(asset(false).frame_at_ms(10_000.0), 1);
}
#[test]
fn sockets_use_untrimmed_pivot_and_host_transform() {
    let p = AssetPlayer::new(asset(true));
    let s = p.socket("hand", [10.0, 20.0], 2.0, 0.0, false).unwrap();
    assert_eq!([s.x, s.y], [14.0, 16.0]);
    let s = p.socket("hand", [10.0, 20.0], 2.0, 0.0, true).unwrap();
    assert_eq!([s.x, s.y], [6.0, 16.0]);
    assert_eq!(s.angle, std::f32::consts::PI);
    assert_eq!(s.basis_x, Some([-2.0, 0.0]));
    assert_eq!(s.basis_y, Some([0.0, 2.0]));
    assert_eq!(s.mirror_policy.as_deref(), Some("reflect"));
}
#[test]
fn events_cross_once_and_seek_does_not_reemit_history() {
    let mut p = AssetPlayer::new(asset(true));
    assert_eq!(p.drain_events()[0].event.name, "begin");
    p.advance(0.08).unwrap();
    assert_eq!(p.drain_events()[0].event.name, "hit");
    p.advance(0.0).unwrap();
    assert!(p.drain_events().is_empty());
    p.advance(0.08).unwrap();
    let event = p.drain_events().remove(0);
    assert_eq!(event.cycle, 1);
    assert_eq!(event.event.name, "begin");
    p.seek(10.0).unwrap();
    assert!(p.drain_events().is_empty());
}
#[test]
fn shared_scene_fixture_compiles_to_declared_abi_and_rejects_invalid_mesh() {
    let scene: Scene = serde_json::from_str(include_str!("../examples/draw-scene.json")).unwrap();
    let c = draw::compile(&scene).unwrap();
    assert_eq!(c.count, 4);
    assert_eq!(c.commands.len(), 4 * 128);
    let mut invalid = scene;
    invalid.commands = vec![draw::Command::Mesh {
        vertices: vec![[0.0, 0.0, 0.0]],
        indices: vec![0, 1, 2],
        material: Default::default(),
    }];
    assert!(draw::compile(&invalid).is_err());
}
#[test]
fn declared_asset_finish_cannot_silently_drop_palette_lock() {
    use poku_pixel_fx_player::asset::resolve_asset_render_options;
    let settings = serde_json::json!({"project":{"renderProfile":{"mode":"cinematic","cinematic":{"exposure":1.7}},"pixelStyle":{"finalColorPolicy":"palette-locked","palette":[4278190080u32,4294967295u32]}}});
    let resolved = resolve_asset_render_options(
        &settings,
        &serde_json::json!({"exposure":2,"finalPalette":[4294901760u32]}),
    )
    .unwrap();
    assert_eq!(resolved["exposure"], 2);
    assert_eq!(
        resolved["finalPalette"],
        settings["project"]["pixelStyle"]["palette"]
    );
    assert!(
        resolve_asset_render_options(
            &serde_json::json!({"project":{"renderProfile":{"mode":"legacy"}}}),
            &serde_json::json!({})
        )
        .is_err()
    );
}

#[test]
fn native_finishing_requires_declared_or_explicit_mode() {
    use poku_pixel_fx_player::asset::resolve_asset_render_options;
    for settings in [
        serde_json::Value::Null,
        serde_json::json!({}),
        serde_json::json!({"project":{"kind":"effect"}}),
        serde_json::json!({"project":{"kind":"3d"}}),
        serde_json::json!({"renderProfile":{"cinematic":{"exposure":2}}}),
        serde_json::json!({"renderMode":"legacy"}),
    ] {
        assert!(resolve_asset_render_options(&settings, &serde_json::json!({})).is_err());
        assert!(
            resolve_asset_render_options(&settings, &serde_json::json!({"exposure":2})).is_err()
        );
        let chosen = resolve_asset_render_options(
            &settings,
            &serde_json::json!({"mode":"cinematic","exposure":1.4}),
        )
        .unwrap();
        assert_eq!(chosen["exposure"], 1.4);
        let identity = resolve_asset_render_options(
            &settings,
            &serde_json::json!({"mode":"linear-transparent"}),
        )
        .unwrap();
        assert_eq!(identity["bloom"], false);
        assert_eq!(identity["toneMap"], "none");
        assert_eq!(identity["exposure"], 1);
    }
    // Explicit legacy-to-cinematic conversion retains the established native defaults.
    let converted = resolve_asset_render_options(
        &serde_json::json!({"renderMode":"legacy"}),
        &serde_json::json!({"mode":"cinematic"}),
    )
    .unwrap();
    assert!(converted["bloom"].is_null());
    assert!(converted["exposure"].is_null());
    for mode in [
        serde_json::json!("legacy"),
        serde_json::json!("typo"),
        serde_json::json!(false),
    ] {
        assert!(
            resolve_asset_render_options(
                &serde_json::json!({"renderMode":"cinematic"}),
                &serde_json::json!({"mode":mode}),
            )
            .is_err()
        );
    }
    assert!(
        resolve_asset_render_options(
            &serde_json::json!({"renderMode":"unknown"}),
            &serde_json::json!({}),
        )
        .is_err()
    );
}

#[test]
fn atlas_lighting_uses_the_same_trim_and_pixel_center_mapping_as_color() {
    use poku_pixel_fx_player::{asset::PageLighting, draw::DrawAsset};
    let mut a = asset(true);
    a.pages = vec![DrawAsset {
        id: "page-0".into(),
        revision: serde_json::json!(1),
        width: 2,
        height: 2,
        color: vec![0; 4],
        emission: None,
    }];
    a.lighting = vec![PageLighting {
        radiance: Some(vec![
            2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0, 1.0, 1.0, 1.0,
        ]),
        occlusion: Some(vec![0.0, 0.2, 0.7, 1.0]),
    }];
    let mapped = a.frame_lighting(0, 8, 8, [4.0, 6.0]).unwrap();
    let rgb = mapped.radiance.unwrap();
    let ao = mapped.occlusion.unwrap();
    assert_eq!(&rgb[(1 * 8 + 2) * 3..(1 * 8 + 3) * 3], &[2.0, 0.0, 0.0]);
    assert_eq!(&rgb[(2 * 8 + 3) * 3..(2 * 8 + 4) * 3], &[1.0, 1.0, 1.0]);
    assert_eq!(ao[1 * 8 + 3], 0.2);
    assert_eq!(ao[0], 1.0);
    assert_eq!(&rgb[0..3], &[0.0, 0.0, 0.0]);
    let shifted = a.frame_lighting(0, 8, 8, [4.6, 6.0]).unwrap();
    assert_eq!(shifted.occlusion.unwrap()[1 * 8 + 2], 1.0);
    let mode = poku_pixel_fx_player::asset::resolve_asset_render_options(
        &serde_json::json!({"renderMode":"linear-transparent","renderProfile":{"cinematic":{"exposure":7}}}),
        &serde_json::json!({})).unwrap();
    assert_eq!(mode["bloom"], false);
    assert_eq!(mode["exposure"], 1);
    let mode = poku_pixel_fx_player::asset::resolve_asset_render_options(
        &serde_json::json!({"renderMode":"cinematic","renderProfile":{"cinematic":{"exposure":1.3}},"project":{"kind":"3d"}}),
        &serde_json::json!({})).unwrap();
    assert_eq!(mode["exposure"], 1.3);
    let mode = poku_pixel_fx_player::asset::resolve_asset_render_options(
        &serde_json::json!({"renderMode":"cinematic","renderProfile":{"cinematic":{"finalPalette":[4294967295u32]}}}),
        &serde_json::json!({}),
    ).unwrap();
    assert_eq!(mode["finalPalette"], serde_json::json!([4294967295u32]));
}
