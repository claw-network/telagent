import type { NodeTarget } from './types';

export const TARGET_STORAGE_KEY = 'telagent.owner.console.targets.v1';

const BUILTIN_TARGETS: NodeTarget[] = [
  {
    id: 'alex',
    label: 'Alex Node',
    baseUrl: 'https://alex.telagent.org',
    enabled: true,
  },
  {
    id: 'bess',
    label: 'Bess Node',
    baseUrl: 'https://bess.telagent.org',
    enabled: true,
  },
];

function slugifyId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeTarget(target: Partial<NodeTarget>, index: number): NodeTarget {
  const fallbackId = `node-${index + 1}`;
  const idFromTarget = typeof target.id === 'string' ? slugifyId(target.id) : '';
  const labelFromTarget = typeof target.label === 'string' ? target.label.trim() : '';
  const baseUrl = normalizeBaseUrl(typeof target.baseUrl === 'string' ? target.baseUrl : '');

  const id = idFromTarget || slugifyId(labelFromTarget) || fallbackId;
  const label = labelFromTarget || id;
  const enabled = typeof target.enabled === 'boolean' ? target.enabled : true;

  return {
    id,
    label,
    baseUrl,
    enabled,
  };
}

export function createDefaultTargets(): NodeTarget[] {
  return BUILTIN_TARGETS.map((target) => ({ ...target }));
}

export function sanitizeTargets(targets: Array<Partial<NodeTarget>>): NodeTarget[] {
  const seen = new Set<string>();
  const sanitized: NodeTarget[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const normalized = normalizeTarget(targets[index], index);
    if (seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    sanitized.push(normalized);
  }

  if (sanitized.length === 0) {
    return createDefaultTargets();
  }

  return sanitized;
}

function resolveStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTargets(storage: Pick<Storage, 'getItem'> | null = resolveStorage()): NodeTarget[] {
  if (!storage) {
    return createDefaultTargets();
  }

  const raw = storage.getItem(TARGET_STORAGE_KEY);
  if (!raw) {
    return createDefaultTargets();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return createDefaultTargets();
    }
    return sanitizeTargets(parsed as Array<Partial<NodeTarget>>);
  } catch {
    return createDefaultTargets();
  }
}

export function writeStoredTargets(
  targets: Array<Partial<NodeTarget>>,
  storage: Pick<Storage, 'setItem'> | null = resolveStorage(),
): void {
  if (!storage) {
    return;
  }

  const sanitized = sanitizeTargets(targets);
  try {
    storage.setItem(TARGET_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // best-effort persistence
  }
}
