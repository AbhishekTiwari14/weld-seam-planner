import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { _roots, advance, createRoot, type RootState } from '@react-three/fiber';

let now = 0;
beforeEach(() => {
  now = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { _roots.clear(); vi.restoreAllMocks(); });

function createTimingStore() {
  // A real R3F store/loop without mounting a DOM or allocating a WebGL context.
  const canvas = {} as HTMLCanvasElement;
  createRoot(canvas);
  return _roots.get(canvas)!.store;
}

it('constructs the renderer timing state without the deprecated Clock warning', () => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { clock } = createTimingStore().getState();
  expect(clock.getDelta()).toBe(0); // Auto-start keeps the first delta at zero.
  now += 16;
  expect(clock.getDelta()).toBeCloseTo(0.016, 12);
  expect(warnings).not.toHaveBeenCalled();
});

it('preserves seconds, elapsed time, stop and restart semantics', () => {
  const { clock } = createTimingStore().getState();
  clock.start();
  now += 250;
  expect(clock.getDelta()).toBe(0.25);
  expect(clock.getElapsedTime()).toBe(0.25);
  now += 500;
  clock.stop();
  expect(clock.elapsedTime).toBe(0.75);
  expect(clock.running).toBe(false);
  expect(clock.autoStart).toBe(false);
  now += 10_000;
  expect(clock.getDelta()).toBe(0);
  expect(clock.elapsedTime).toBe(0.75);
  clock.start();
  expect(clock.elapsedTime).toBe(0);
  now += 20;
  expect(clock.getDelta()).toBeCloseTo(0.02, 12);
});

it('retains demand-loop timing and manual advance when switching frameloops', () => {
  const store = createTimingStore();
  const state = store.getState();
  const deltas: number[] = [];
  const render = vi.fn();
  state.set({ gl: { render } as unknown as RootState['gl'] });
  const unsubscribe = state.internal.subscribe({ current: (_state, delta) => deltas.push(delta) }, 0, store);
  state.setFrameloop('demand');
  now += 16;
  advance(now, false, state.get());
  now += 5_000; // Demand rendering retains the existing time since the last rendered frame.
  advance(now, false, state.get());
  expect(deltas).toEqual([0.016, 5]);
  state.setFrameloop('never');
  advance(2, false, state.get());
  advance(2.25, false, state.get());
  expect(deltas.slice(2)).toEqual([2, 0.25]);
  expect(state.clock.elapsedTime).toBe(2.25);
  state.setFrameloop('demand');
  now += 32;
  advance(now, false, state.get());
  expect(deltas.at(-1)).toBeCloseTo(0.032, 12);
  expect(render).toHaveBeenCalledTimes(5);
  unsubscribe();
});
