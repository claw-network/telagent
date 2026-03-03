import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

interface PendingUpload {
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  manifestHash: string;
  createdAtMs: number;
  expiresAtMs: number;
  completed: boolean;
  completedAtMs?: number;
  checksum?: string;
}

export interface AttachmentServiceClock {
  now(): number;
}

const SystemClock: AttachmentServiceClock = {
  now: () => Date.now(),
};

const INIT_UPLOAD_TTL_SEC = 900;

export class AttachmentService {
  private readonly uploads = new Map<string, PendingUpload>();
  private readonly clock: AttachmentServiceClock;

  constructor(options?: { clock?: AttachmentServiceClock }) {
    this.clock = options?.clock ?? SystemClock;
  }

  initUpload(input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    manifestHash: string;
  }): {
    objectKey: string;
    uploadUrl: string;
    expiresInSec: number;
  } {
    const safeFilename = this.toSafeFilename(input.filename);
    const nowMs = this.clock.now();
    const objectKey = `attachments/${nowMs}-${randomUUID()}-${safeFilename}`;

    this.uploads.set(objectKey, {
      objectKey,
      filename: safeFilename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      manifestHash: input.manifestHash,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + INIT_UPLOAD_TTL_SEC * 1000,
      completed: false,
    });

    return {
      objectKey,
      uploadUrl: `https://uploads.telagent.local/${encodeURIComponent(objectKey)}`,
      expiresInSec: INIT_UPLOAD_TTL_SEC,
    };
  }

  completeUpload(input: { objectKey: string; manifestHash: string; checksum: string }): {
    objectKey: string;
    manifestHash: string;
    checksum: string;
    completedAtMs: number;
  } {
    this.cleanupExpiredSessions();
    this.assertObjectKey(input.objectKey);
    this.assertChecksum(input.checksum);

    const upload = this.uploads.get(input.objectKey);
    if (!upload) {
      throw new TelagentError(ErrorCodes.NOT_FOUND, 'Upload session not found');
    }
    if (this.clock.now() > upload.expiresAtMs) {
      this.uploads.delete(input.objectKey);
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'Upload session expired');
    }
    if (upload.manifestHash.toLowerCase() !== input.manifestHash.toLowerCase()) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'Manifest hash mismatch');
    }
    if (upload.completed) {
      if (upload.checksum?.toLowerCase() === input.checksum.toLowerCase()) {
        return {
          objectKey: input.objectKey,
          manifestHash: upload.manifestHash,
          checksum: upload.checksum,
          completedAtMs: upload.completedAtMs ?? this.clock.now(),
        };
      }
      throw new TelagentError(ErrorCodes.CONFLICT, 'Upload already completed with different checksum');
    }

    upload.completed = true;
    upload.completedAtMs = this.clock.now();
    upload.checksum = input.checksum;

    return {
      objectKey: input.objectKey,
      manifestHash: input.manifestHash,
      checksum: input.checksum,
      completedAtMs: upload.completedAtMs,
    };
  }

  cleanupExpiredSessions(nowMs = this.clock.now()): number {
    let removed = 0;
    for (const [objectKey, session] of this.uploads) {
      if (session.completed) {
        continue;
      }
      if (session.expiresAtMs <= nowMs) {
        this.uploads.delete(objectKey);
        removed++;
      }
    }
    return removed;
  }

  private assertObjectKey(objectKey: string): void {
    if (!objectKey.startsWith('attachments/')) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'objectKey must start with attachments/');
    }
  }

  private assertChecksum(checksum: string): void {
    const normalized = checksum.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'checksum must be 32-byte hex string');
    }
  }

  private toSafeFilename(filename: string): string {
    const normalized = basename(filename).replace(/[^A-Za-z0-9._-]/g, '_');
    if (!normalized || normalized === '.' || normalized === '..') {
      throw new TelagentError(ErrorCodes.VALIDATION, 'filename is invalid');
    }
    return normalized;
  }
}
