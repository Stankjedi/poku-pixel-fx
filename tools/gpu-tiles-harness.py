"""Actual DrawIR/tile WGSL parity and candidate accounting on the available wgpu adapter.
Optional validation dependency: python -m pip install --target .qa/python wgpu==0.32.0
PYTHONPATH=.qa/python GPU_TILES_REQUIRED=1 python tools/gpu-tiles-harness.py
"""
import base64
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys


def finish(report):
    encoded = json.dumps(report, indent=2)
    print(encoded)
    if os.getenv("GPU_TILES_REPORT_PATH"):
        Path(os.environ["GPU_TILES_REPORT_PATH"]).write_text(encoded + "\n")
    if report["status"] == "failed" or os.getenv("GPU_TILES_REQUIRED") == "1" and report["status"] != "passed":
        sys.exit(1)


try:
    import wgpu
except ImportError:
    finish({"status": "unavailable", "reason": "Optional validation dependency wgpu==0.32.0 is not installed"})
    sys.exit(0)

checks = []
dispatches = 0
adapter_info = None
try:
    fixtures = json.loads(subprocess.check_output([os.getenv("NODE", "node"), "tools/gpu-tiles-fixtures.mjs"], text=True, timeout=180))
    adapter = wgpu.gpu.request_adapter_sync(power_preference="low-power")
    adapter_info = dict(adapter.info)
    device = adapter.request_device_sync()

    def pipeline(path):
        module = device.create_shader_module(code=Path(path).read_text())
        return device.create_compute_pipeline(layout="auto", compute={"module": module, "entry_point": "main"})

    raster = pipeline("src/render/shaders/draw-ir.wgsl")
    cull = pipeline("src/render/shaders/draw-tiles.wgsl")
    storage = wgpu.BufferUsage.STORAGE
    copy_src = wgpu.BufferUsage.COPY_SRC
    copy_dst = wgpu.BufferUsage.COPY_DST

    for fixture in fixtures:
        width, height, count = fixture["width"], fixture["height"], fixture["count"]
        columns, rows, capacity = math.ceil(width / 16), math.ceil(height / 16), 256
        tile_count = columns * rows
        allocated = []

        def buffer(size, usage, data=None):
            result = device.create_buffer(size=size, usage=usage) if data is None else device.create_buffer_with_data(data=data, usage=usage)
            allocated.append(result)
            return result

        def source(name):
            data = base64.b64decode(fixture[name])
            return buffer(len(data), storage, data)

        params = buffer(16, wgpu.BufferUsage.UNIFORM | copy_dst)
        commands, assets, emission = source("commands"), source("assets"), source("emission")
        color = buffer(width * height * 4, storage | copy_src)
        light = buffer(width * height * 4, storage | copy_src)
        hdr = buffer(width * height * 12, storage | copy_src)
        tiles = buffer(tile_count * (capacity + 1) * 4, storage | copy_src)

        def group(p, buffers):
            return device.create_bind_group(layout=p.get_bind_group_layout(0), entries=[{"binding": i, "resource": {"buffer": b, "size": b.size}} for i, b in enumerate(buffers)])

        raster_group = group(raster, [params, commands, assets, emission, color, light, hdr, tiles])
        cull_group = group(cull, [params, commands, tiles])

        def render(tiled):
            global dispatches
            device.queue.write_buffer(params, 0, struct.pack("4I", width, height, count, capacity if tiled else 0))
            encoder = device.create_command_encoder()
            compute = encoder.begin_compute_pass()
            if tiled:
                compute.set_pipeline(cull)
                compute.set_bind_group(0, cull_group)
                compute.dispatch_workgroups(math.ceil(tile_count / 64))
                dispatches += 1
            compute.set_pipeline(raster)
            compute.set_bind_group(0, raster_group)
            compute.dispatch_workgroups(math.ceil(width / 4), math.ceil(height / 4))
            dispatches += 1
            compute.end()
            device.queue.submit([encoder.finish()])
            return {name: bytes(device.queue.read_buffer(b)) for name, b in [("color", color), ("light", light), ("hdr", hdr)]}

        direct, tiled = render(False), render(True)
        assert direct == tiled, fixture["name"] + ": tiled rasterization changed exact GPU output bytes"
        color_delta = max(abs(a - b) for a, b in zip(tiled["color"], base64.b64decode(fixture["expected"]["color"])))
        light_delta = max(abs(a - b) for a, b in zip(tiled["light"], base64.b64decode(fixture["expected"]["light"])))
        actual_hdr = struct.unpack("<" + "f" * (width * height * 3), tiled["hdr"])
        expected_hdr = struct.unpack("<" + "f" * (width * height * 3), base64.b64decode(fixture["expected"]["hdr"]))
        hdr_delta = max(abs(a - b) for a, b in zip(actual_hdr, expected_hdr))
        hdr_tolerance = .0005 + max(expected_hdr) * .00001
        assert color_delta <= 1 and light_delta <= 1 and hdr_delta <= hdr_tolerance, fixture["name"] + ": CPU/GPU reference mismatch " + str((color_delta, light_delta, hdr_delta))
        tile_data = bytes(device.queue.read_buffer(tiles))
        visits = 0
        overflow = 0
        peak = 0
        for ty in range(rows):
            for tx in range(columns):
                header = struct.unpack_from("<I", tile_data, (ty * columns + tx) * (capacity + 1) * 4)[0]
                if header == 0xffffffff:
                    candidates = count
                    overflow += 1
                else:
                    assert header <= capacity and header <= count, "Invalid bin header"
                    candidates = header
                    indices = struct.unpack_from("<" + "I" * header, tile_data, ((ty * columns + tx) * (capacity + 1) + 1) * 4)
                    assert list(indices) == sorted(set(indices)), "Tile command IDs lost stable original order"
                visits += candidates * min(16, width - tx * 16) * min(16, height - ty * 16)
                peak = max(peak, candidates)
        full_visits = width * height * count
        if fixture["name"] == "sparse-512":
            assert visits < full_visits * .08, "Sparse scene failed to reduce candidate work"
        if fixture["name"] == "dense-overflow-301":
            assert overflow > 0, "Dense fixture did not exercise overflow fallback"
        if fixture["name"] == "offscreen-80":
            assert visits == 0, "Off-screen commands leaked into visible tiles"
        checks.append({"name": fixture["name"], "primitives": count, "tiles": tile_count, "overflowTiles": overflow, "maxCandidates": peak,
                       "directPixelVisits": full_visits, "candidatePixelVisits": visits, "binningBoundsUpperBound": tile_count * count,
                       "candidateReductionPercent": round(100 * (1 - visits / full_visits), 4) if full_visits else 0,
                       "directVsTiledBytesExact": True, "cpuColorMaxDelta": color_delta, "cpuLightMaxDelta": light_delta,
                       "cpuHdrMaxDelta": hdr_delta, "comparedGpuBytes": sum(len(data) for data in tiled.values())})
        for item in allocated:
            item.destroy()
    report = {"status": "passed", "adapter": adapter_info, "software": adapter_info.get("adapter_type") == "CPU", "computeDispatches": dispatches,
              "checks": checks, "scope": "Actual canonical WGSL execution; exact same-device direct/tiled color, light and HDR bytes. CPU reference permits 1 encoded channel value and stated float accumulation tolerance. Candidate counts are actual captured GPU bins, not hardware speedup measurements. Browser presentation and Rust host compilation are separate checks."}
except Exception as error:
    report = {"status": "failed", "reason": str(error), "adapter": adapter_info, "checks": checks, "computeDispatches": dispatches}
finish(report)
