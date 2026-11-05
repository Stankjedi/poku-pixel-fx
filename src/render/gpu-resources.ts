import { GPU_BUFFER, type GpuBuffer, type GpuDevice } from './gpu-types.js';
export interface DirtyBufferRange { offset: number; size: number }
interface Entry { buffer: GpuBuffer; bytes: number; revision: string | number; usage: number }
/** Explicit revisions make immutable assets resident; mutating data requires a new revision. */
export class ResidentGpuBuffers {
  private entries = new Map<string, Entry>();
  private uploaded = 0;
  private writes = 0;
  private saved = 0;
  private bytes = 0;
  private disposed = false;
  constructor(readonly device: GpuDevice, readonly maxBytes = 128 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) throw new RangeError('Resident GPU budget must be a positive byte count');
  }
  beginFrame(): void {
    if (this.disposed) throw new Error('Resident GPU buffers are disposed');
    this.uploaded = this.writes = this.saved = 0;
  }
  upload(key: string, data: ArrayBufferView, revision: string | number, dirty?: readonly DirtyBufferRange[], usage: number = GPU_BUFFER.STORAGE): GpuBuffer {
    if (this.disposed) throw new Error('Resident GPU buffers are disposed');
    const bytes = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    if (bytes > (this.device.limits.maxBufferSize ?? Infinity)) throw new RangeError('GPU asset exceeds buffer size limit');
    if (bytes > (this.device.limits.maxStorageBufferBindingSize ?? Infinity) && (usage & GPU_BUFFER.STORAGE)) throw new RangeError('GPU asset exceeds storage binding limit');
    const previous = this.entries.get(key);
    const fresh = !previous || previous.bytes !== bytes || previous.usage !== usage;
    if (!fresh && previous.revision === revision) { this.saved += data.byteLength; return previous.buffer; }
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const partial = !fresh && !!dirty?.length;
    // Validate the entire request before the first queue write: a bad later range
    // must not leave a half-updated resident asset with its old revision.
    if (partial) for (const range of dirty!) {
      if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.size) || range.offset < 0 || range.size < 0 || range.offset + range.size > source.length || range.offset % 4 || range.size % 4)
        throw new RangeError('Dirty uploads need aligned in-bounds byte ranges');
    }
    if (fresh && this.bytes - (previous?.bytes ?? 0) + bytes > this.maxBytes) throw new RangeError('Resident GPU asset budget exceeded');
    const buffer = fresh ? this.device.createBuffer({ size: bytes, usage: usage | GPU_BUFFER.COPY_DST, label: key }) : previous.buffer;
    try {
      if (partial) {
        for (const range of dirty!) if (range.size > 0) {
          this.device.queue.writeBuffer(buffer, range.offset, source.subarray(range.offset, range.offset + range.size));
          this.uploaded += range.size; this.writes++;
        }
      } else if (source.byteLength) {
        if (source.byteLength % 4) { const padded = new Uint8Array(bytes); padded.set(source); this.device.queue.writeBuffer(buffer, 0, padded); }
        else this.device.queue.writeBuffer(buffer, 0, source);
        this.uploaded += bytes; this.writes++;
      }
    } catch (error) { if (fresh) buffer.destroy(); throw error; }
    if (fresh) {
      previous?.buffer.destroy(); this.bytes += bytes - (previous?.bytes ?? 0);
      this.entries.set(key, { buffer, bytes, revision, usage });
    } else previous.revision = revision;
    return buffer;
  }
  release(key: string): void {
    const item = this.entries.get(key);
    if (item) { item.buffer.destroy(); this.bytes -= item.bytes; this.entries.delete(key); }
  }
  retain(keys: ReadonlySet<string>): void { for (const key of this.entries.keys()) if (!keys.has(key)) this.release(key); }
  get resources() { return { buffers: this.entries.size, bytes: this.bytes, uploadedBytes: this.uploaded, writes: this.writes, avoidedUploadBytes: this.saved }; }
  dispose(): void { if (this.disposed) return; for (const key of this.entries.keys()) this.release(key); this.disposed = true; }
}
