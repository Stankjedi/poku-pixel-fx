import { GPU_BUFFER, type GpuBuffer, type GpuDevice } from './gpu-types.js';
export interface DirtyBufferRange { offset: number; size: number }
interface Entry { buffer: GpuBuffer; bytes: number; revision: string | number; usage: number }
/** Explicit revisions make immutable assets resident; mutating data requires a new revision. */
export class ResidentGpuBuffers {
  private entries = new Map<string, Entry>();
  private uploaded = 0; private writes = 0; private saved = 0;
  constructor(readonly device: GpuDevice, readonly maxBytes = 128 * 1024 * 1024) {}
  beginFrame() { this.uploaded = this.writes = this.saved = 0; }
  upload(key: string, data: ArrayBufferView, revision: string | number, dirty?: readonly DirtyBufferRange[], usage: number = GPU_BUFFER.STORAGE): GpuBuffer {
    const bytes = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    if (bytes > (this.device.limits.maxStorageBufferBindingSize ?? Infinity) && (usage & GPU_BUFFER.STORAGE)) throw new RangeError('GPU asset exceeds storage binding limit');
    let item = this.entries.get(key);
    const fresh = !item || item.bytes !== bytes || item.usage !== usage;
    if (fresh) {
      if (this.resources.bytes - (item?.bytes ?? 0) + bytes > this.maxBytes) throw new RangeError('Resident GPU asset budget exceeded');
      item?.buffer.destroy();
      item = { buffer: this.device.createBuffer({ size: bytes, usage: usage | GPU_BUFFER.COPY_DST, label: key }), bytes, revision, usage };
      this.entries.set(key, item);
    } else if (item!.revision === revision) { this.saved += data.byteLength; return item!.buffer; }
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (!fresh && dirty?.length) {
      for (const range of dirty) {
        if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.size) || range.offset < 0 || range.size < 0 || range.offset + range.size > source.length || range.offset % 4 || range.size % 4)
          throw new RangeError('Dirty uploads need aligned in-bounds byte ranges');
        this.device.queue.writeBuffer(item!.buffer, range.offset, source.subarray(range.offset, range.offset + range.size));
        this.uploaded += range.size; this.writes++;
      }
    } else {
      if (source.byteLength % 4) { const padded = new Uint8Array(bytes); padded.set(source); this.device.queue.writeBuffer(item!.buffer, 0, padded); }
      else if (source.byteLength) this.device.queue.writeBuffer(item!.buffer, 0, source);
      this.uploaded += bytes; this.writes++;
    }
    item!.revision = revision; return item!.buffer;
  }
  release(key: string): void { this.entries.get(key)?.buffer.destroy(); this.entries.delete(key); }
  retain(keys: ReadonlySet<string>): void { for (const key of this.entries.keys()) if (!keys.has(key)) this.release(key); }
  get resources() { return { buffers: this.entries.size, bytes: [...this.entries.values()].reduce((sum, item) => sum + item.bytes, 0), uploadedBytes: this.uploaded, writes: this.writes, avoidedUploadBytes: this.saved }; }
  dispose(): void { for (const key of this.entries.keys()) this.release(key); }
}
