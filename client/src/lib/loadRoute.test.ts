import { afterEach, expect, it, vi } from 'vitest';
import { loadRoute } from './loadRoute';
afterEach(() => vi.useRealTimers());
it('recovers a transient module download without a page reload', async () => {
  vi.useFakeTimers();
  const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /editor.js')).mockResolvedValue({ Editor: 'loaded' });
  const result = loadRoute(load);
  await vi.runAllTimersAsync();
  expect(await result).toEqual({ Editor: 'loaded' });
  expect(load).toHaveBeenCalledTimes(2);
});
it('does not retry code errors', async () => {
  const load = vi.fn().mockRejectedValue(new Error('Invalid hook call'));
  await expect(loadRoute(load)).rejects.toThrow('Invalid hook call');
  expect(load).toHaveBeenCalledTimes(1);
});
it('stops after three failed downloads', async () => {
  vi.useFakeTimers();
  const load = vi.fn().mockRejectedValue(new Error('Importing a module script failed'));
  const check = expect(loadRoute(load)).rejects.toThrow('Importing a module script failed');
  await vi.runAllTimersAsync();
  await check;
  expect(load).toHaveBeenCalledTimes(3);
});
