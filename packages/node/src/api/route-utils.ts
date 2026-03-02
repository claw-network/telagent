import type { ServerResponse } from 'node:http';

import { asProblemDetail } from '@telagent/protocol';

import { problem } from './response.js';

export function handleError(res: ServerResponse, error: unknown, instance?: string): void {
  problem(res, asProblemDetail(error, instance));
}
