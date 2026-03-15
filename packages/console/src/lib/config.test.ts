import { describe, expect, it } from 'vitest';

import {
  TARGET_STORAGE_KEY,
  createDefaultTargets,
  normalizeBaseUrl,
  readStoredTargets,
  sanitizeTargets,
  writeStoredTargets,
} from './config';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('config utilities', () => {
  it('normalizes base url and strips trailing slashes', () => {
    expect(normalizeBaseUrl(' https://alex.telagent.org/// ')).toBe('https://alex.telagent.org');
  });

  it('sanitizes targets and deduplicates ids', () => {
    const sanitized = sanitizeTargets([
      {
        id: 'Alex',
        label: 'Alex Node',
        baseUrl: 'https://alex.telagent.org/',
        enabled: true,
      },
      {
        id: 'alex',
        label: 'Duplicate',
        baseUrl: 'https://should-be-dropped.example',
        enabled: false,
      },
    ]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]).toEqual({
      id: 'alex',
      label: 'Alex Node',
      baseUrl: 'https://alex.telagent.org',
      enabled: true,
    });
  });

  it('falls back to defaults when storage value is invalid', () => {
    const memory = new MemoryStorage();
    memory.setItem(TARGET_STORAGE_KEY, '{"not":"array"}');

    expect(readStoredTargets(memory)).toEqual(createDefaultTargets());
  });

  it('writes and reads sanitized storage payload', () => {
    const memory = new MemoryStorage();

    writeStoredTargets(
      [
        {
          id: 'BESS',
          label: 'Bess Node',
          baseUrl: 'https://bess.telagent.org/',
          enabled: true,
        },
      ],
      memory,
    );

    expect(readStoredTargets(memory)).toEqual([
      {
        id: 'bess',
        label: 'Bess Node',
        baseUrl: 'https://bess.telagent.org',
        enabled: true,
      },
    ]);
  });
});
