import type { PlanningDocument } from '../domain/contracts.ts';
import { requireValidPlanning } from '../validation/planning.ts';

export const HISTORY_LIMITS = { entries: 50, bytes: 16 * 1024 ** 2 } as const;
export type HistoryDirection = 'undo' | 'redo';
export interface HistorySummary { undoCount: number; redoCount: number; retainedBytes: number }

/** Controller-owned immutable JSON snapshots: no mesh buffers, camera or editor
 * state. Budget accounts conservatively for two bytes per UTF-16 code unit. */
export class PlanHistory {
  private past: string[] = [];
  private future: string[] = [];

  summary(): HistorySummary {
    return { undoCount: this.past.length, redoCount: this.future.length,
      retainedBytes: [...this.past, ...this.future].reduce((sum, snapshot) => sum + snapshot.length * 2, 0) };
  }
  clear(): void { this.past = []; this.future = []; }
  record(content: PlanningDocument['content']): void {
    this.past.push(JSON.stringify(content)); this.future = []; this.trim();
  }
  restore(current: PlanningDocument, direction: HistoryDirection): PlanningDocument {
    const source = direction === 'undo' ? this.past : this.future;
    const destination = direction === 'undo' ? this.future : this.past;
    const snapshot = source.at(-1);
    if (snapshot === undefined) return current;
    // Validate before mutating either stack, including safe-integer revision bounds.
    const restored = requireValidPlanning({ ...current, revision: current.revision + 1, content: JSON.parse(snapshot) as unknown });
    if (JSON.stringify(restored.content.workpiece) !== JSON.stringify(current.content.workpiece)) {
      throw new Error('History belongs to a different workpiece.');
    }
    const leaving = JSON.stringify(current.content);
    source.pop(); destination.push(leaving); this.trim();
    return restored;
  }
  private trim(): void {
    let stats = this.summary();
    while (stats.undoCount + stats.redoCount > HISTORY_LIMITS.entries || stats.retainedBytes > HISTORY_LIMITS.bytes) {
      // Oldest undo first, then furthest redo; nearest remaining states stay usable.
      if (this.past.length) this.past.shift(); else this.future.shift();
      stats = this.summary();
    }
  }
}
