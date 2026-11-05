import { cloneJSON } from './project.js';
/** Bounded immutable editing history. A continuous drag can be committed as one operation. */
export class EditHistory<T> {
  private past: T[] = []; private future: T[] = []; private current: T;
  constructor(initial: T, readonly limit = 80) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be positive');
    this.current = cloneJSON(initial);
  }
  get value(): T { return cloneJSON(this.current); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  commit(next: T): boolean {
    const copy = cloneJSON(next);
    if (JSON.stringify(copy) === JSON.stringify(this.current)) return false;
    this.past.push(this.current); if (this.past.length > this.limit) this.past.shift();
    this.current = copy; this.future = []; return true;
  }
  undo(): T { const previous = this.past.pop(); if (previous !== undefined) { this.future.push(this.current); this.current = previous; } return this.value; }
  redo(): T { const next = this.future.pop(); if (next !== undefined) { this.past.push(this.current); this.current = next; } return this.value; }
  reset(value: T): void { this.current = cloneJSON(value); this.past = []; this.future = []; }
}
