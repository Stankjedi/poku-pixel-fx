"""Execute canonical WGSL on a real wgpu adapter (including explicitly labelled software adapters).
Optional validation dependency: python -m pip install wgpu==0.32.0
"""
import json
import math
import os
from pathlib import Path
import struct
import sys

try:
    import wgpu
except ImportError:
    print(json.dumps({"status": "unavailable", "reason": "Optional validation dependency wgpu==0.32.0 is not installed"}))
    sys.exit(1 if os.getenv("GPU_PARTICLE_REQUIRED") == "1" else 0)

checks = []
dispatches = 0
report = None
try:
    adapter = wgpu.gpu.request_adapter_sync(power_preference="low-power")
    device = adapter.request_device_sync()
    module = device.create_shader_module(code=Path("src/render/shaders/particles.wgsl").read_text())
    pipeline = device.create_compute_pipeline(layout="auto", compute={"module": module, "entry_point": "main"})

    def simulate(parts, seed=42, spread=.6):
        global dispatches
        raw = bytearray(160)
        for slot in range(2):
            offset = slot * 80
            struct.pack_into("4f", raw, offset, 10, 10, 1, 0)
            struct.pack_into("4f", raw, offset + 16, 3, -4, 0, 240)
            struct.pack_into("4f", raw, offset + 32, 1, 0, 1, 0)
            struct.pack_into("4I", raw, offset + 48, slot + 1, seed, 0xff4499ff, 3)
            struct.pack_into("4f", raw, offset + 64, 0, 8, 0, spread)
        particles = device.create_buffer_with_data(data=raw, usage=wgpu.BufferUsage.STORAGE | wgpu.BufferUsage.COPY_SRC)
        commands = device.create_buffer(size=256, usage=wgpu.BufferUsage.STORAGE | wgpu.BufferUsage.COPY_SRC)
        params = device.create_buffer(size=16, usage=wgpu.BufferUsage.UNIFORM | wgpu.BufferUsage.COPY_DST)
        group = device.create_bind_group(layout=pipeline.get_bind_group_layout(0), entries=[{"binding": i, "resource": {"buffer": b, "size": b.size}} for i, b in enumerate([params, particles, commands])])
        tick = 0
        for steps in parts:
            tick += steps
            device.queue.write_buffer(params, 0, struct.pack("fIII", 1 / 120, steps, 2, tick))
            encoder = device.create_command_encoder()
            compute = encoder.begin_compute_pass()
            compute.set_pipeline(pipeline)
            compute.set_bind_group(0, group)
            compute.dispatch_workgroups(1)
            compute.end()
            device.queue.submit([encoder.finish()])
            dispatches += 1
        state = bytes(device.queue.read_buffer(particles))
        output = bytes(device.queue.read_buffer(commands))
        particles.destroy()
        commands.destroy()
        params.destroy()
        return state, output

    a = simulate([60])
    b = simulate([1] * 60)
    assert a == b, "Fixed tick partition changed particle state or emitted DrawIR commands"
    checks.append("Identical state and command bytes for 60 ticks versus 60 single-tick submissions")
    c = simulate([60], seed=43)
    assert a != c, "Different seeds failed to change cosmetic trajectories"
    assert a[0][:16] != a[0][80:96], "Stable particle IDs failed to produce independent samples"
    checks.append("Seed and stable slot ID affect reproducible cosmetic trajectories")
    end = simulate([240])
    assert struct.unpack_from("I", end[0], 60)[0] == 0
    assert struct.unpack_from("I", end[0], 140)[0] == 0
    assert struct.unpack_from("I", end[1], 4)[0] == 0
    checks.append("Particles end exactly at their declared 240-tick lifetime")
    ballistic = simulate([60], spread=0)[0]
    x, y, z, age = struct.unpack_from("4f", ballistic)
    assert abs(x - 11.5) < .0001 and abs(y - (10 - 4 * .5 + 8 / 120**2 * (60 * 61 / 2))) < .0001
    assert z == 1 and abs(age - .5) < .00001
    checks.append("Fixed semi-implicit gravity agrees with the independent ballistic sum")
    info = dict(adapter.info)
    report = {"status": "passed", "adapter": info, "software": info.get("adapter_type") == "CPU", "checks": checks, "computeDispatches": dispatches, "scope": "Actual WGSL compute execution. No physical GPU or cross-device bit-exact claim."}
except Exception as error:
    report = {"status": "failed", "reason": str(error), "checks": checks, "computeDispatches": dispatches}

print(json.dumps(report, indent=2))
if os.getenv("GPU_PARTICLE_REPORT_PATH"):
    Path(os.environ["GPU_PARTICLE_REPORT_PATH"]).write_text(json.dumps(report, indent=2) + "\n")
if report["status"] != "passed":
    sys.exit(1)
