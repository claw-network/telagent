import { randomUUID } from 'node:crypto';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

interface PendingUpload {
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  manifestHash: string;
  createdAtMs: number;
  completed: boolean;
}

export class AttachmentService {
  private readonly uploads = new Map<string, PendingUpload>();

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
    const objectKey = `attachments/${Date.now()}-${randomUUID()}-${input.filename}`;

    this.uploads.set(objectKey, {
      objectKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      manifestHash: input.manifestHash,
      createdAtMs: Date.now(),
      completed: false,
    });

    return {
      objectKey,
      uploadUrl: `https://uploads.telagent.local/${encodeURIComponent(objectKey)}`,
      expiresInSec: 900,
    };
  }

  completeUpload(input: { objectKey: string; manifestHash: string; checksum: string }): {
    objectKey: string;
    manifestHash: string;
    checksum: string;
    completedAtMs: number;
  } {
    const upload = this.uploads.get(input.objectKey);
    if (!upload) {
      throw new TelagentError(ErrorCodes.NOT_FOUND, 'Upload session not found');
    }
    if (upload.manifestHash.toLowerCase() !== input.manifestHash.toLowerCase()) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'Manifest hash mismatch');
    }

    upload.completed = true;

    return {
      objectKey: input.objectKey,
      manifestHash: input.manifestHash,
      checksum: input.checksum,
      completedAtMs: Date.now(),
    };
  }
}
