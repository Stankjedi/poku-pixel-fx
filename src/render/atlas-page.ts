/** Grow one streaming atlas page without allocating the configured maximum up front. */
export interface AtlasPageChannels {
  emission?: boolean;
  radiance?: boolean;
  occlusion?: boolean;
}

export class AtlasPageBuffer {
  width = 0;
  height = 0;
  color: Uint8ClampedArray = new Uint8ClampedArray(0);
  emission?: Float32Array;
  radiance?: Float32Array;
  occlusion?: Float32Array;
  private readonly channels: Readonly<AtlasPageChannels>;

  constructor(readonly maxTextureSize: number, channels: AtlasPageChannels = {}) {
    if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1 || maxTextureSize > 16384)
      throw new RangeError('Atlas page limit must be an integer within 1..16384');
    this.channels = { ...channels };
  }

  /** Capacity in bytes, excluding encoded output and transient buffers during a growth. */
  get byteLength(): number {
    return this.color.byteLength + (this.emission?.byteLength ?? 0)
      + (this.radiance?.byteLength ?? 0) + (this.occlusion?.byteLength ?? 0);
  }

  /** Geometric growth amortizes copying; the packer still determines the exported dimensions. */
  ensure(width: number, height: number): void {
    if (![width, height].every(v => Number.isSafeInteger(v) && v > 0 && v <= this.maxTextureSize))
      throw new RangeError('Atlas page contents exceed its configured limit');
    if (width <= this.width && height <= this.height) return;
    const grow = (required: number, current: number) => Math.max(current,
      Math.min(this.maxTextureSize, 2 ** Math.ceil(Math.log2(required))));
    const nextWidth = grow(width, this.width), nextHeight = grow(height, this.height);
    const pixels = nextWidth * nextHeight, color = new Uint8ClampedArray(pixels * 4);
    const emission = this.channels.emission ? new Float32Array(pixels * 3) : undefined;
    const radiance = this.channels.radiance ? new Float32Array(pixels * 3) : undefined;
    const occlusion = this.channels.occlusion ? new Float32Array(pixels).fill(1) : undefined;
    const copy = (source: Uint8ClampedArray | Float32Array | undefined,
      target: Uint8ClampedArray | Float32Array | undefined, channels: number) => {
      if (!source || !target) return;
      const row = this.width * channels;
      for (let y = 0; y < this.height; y++)
        target.set(source.subarray(y * row, (y + 1) * row), y * nextWidth * channels);
    };
    copy(this.color, color, 4); copy(this.emission, emission, 3);
    copy(this.radiance, radiance, 3); copy(this.occlusion, occlusion, 1);
    // Publish only after every allocation/copy succeeded, so a failed growth is retryable.
    this.width = nextWidth; this.height = nextHeight; this.color = color;
    this.emission = emission; this.radiance = radiance; this.occlusion = occlusion;
  }
}
