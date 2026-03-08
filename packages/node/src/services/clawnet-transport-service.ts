import type { Envelope } from '@telagent/protocol';
import type { ProfileCardPayload } from '@telagent/protocol';
import type { ClawNetGatewayService } from '../clawnet/gateway-service.js';

const logger = console;

const TOPIC_ENVELOPE = 'telagent/envelope';
const TOPIC_RECEIPT = 'telagent/receipt';
const TOPIC_GROUP_SYNC = 'telagent/group-sync';
const TOPIC_PROFILE_CARD = 'telagent/profile-card';
const TOPIC_ATTACHMENT = '_attachment';
const RECONNECT_DELAY_MS = 3_000;

/** JSON replacer that converts BigInt to string (needed for Envelope.seq). */
const bigintReplacer = (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v;

export interface DeliveryReceipt {
  envelopeId: string;
  status: 'delivered' | 'read';
  timestampMs: number;
}

export interface GroupSyncPayload {
  groupId: string;
  epoch: number;
  commitHash: string;
  memberDids: string[];
}

export interface AttachmentNotification {
  attachmentId: string;
  sourceDid: string;
  contentType: string;
  fileName?: string;
  totalSize: number;
}

export type TopicCallbacks = {
  onEnvelope?: (raw: Record<string, unknown>, sourceDid: string) => Promise<unknown>;
  onReceipt?: (receipt: DeliveryReceipt, sourceDid: string) => Promise<unknown>;
  onGroupSync?: (payload: GroupSyncPayload, sourceDid: string) => Promise<unknown>;
  onProfileCard?: (payload: ProfileCardPayload, sourceDid: string) => Promise<unknown>;
  onAttachment?: (info: AttachmentNotification, sourceDid: string) => Promise<void>;
};

export class ClawNetTransportService {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private ws?: WebSocket;
  private lastSeq = 0;
  private stopping = false;
  private callbacks: TopicCallbacks = {};

  constructor(
    private readonly gateway: ClawNetGatewayService,
    opts: { baseUrl: string; apiKey?: string },
  ) {
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
  }

  // ── outbound ──────────────────────────────────────────────

  async sendEnvelope(targetDid: string, envelope: Envelope): Promise<{ messageId: string; delivered: boolean }> {
    const result = await this.gateway.client.messaging.send({
      targetDid,
      topic: TOPIC_ENVELOPE,
      payload: JSON.stringify(envelope, bigintReplacer),
      ttlSec: envelope.ttlSec,
      priority: envelope.contentType.startsWith('control/') ? 3 : 1,
      compress: true,
      idempotencyKey: envelope.envelopeId,
    });
    if (!result.delivered) {
      logger.info('[p2p-transport] Envelope %s queued for offline delivery to %s', envelope.envelopeId, targetDid);
    }
    return result;
  }

  async sendEnvelopeMulticast(
    targetDids: string[],
    envelope: Envelope,
  ): Promise<void> {
    await this.gateway.client.messaging.sendBatch({
      targetDids,
      topic: TOPIC_ENVELOPE,
      payload: JSON.stringify(envelope, bigintReplacer),
      ttlSec: envelope.ttlSec,
      priority: envelope.contentType.startsWith('control/') ? 3 : 1,
      compress: true,
      idempotencyKey: envelope.envelopeId,
    });
  }

  // ── inbound (WebSocket subscribe) ─────────────────────────

  startListening(callbacks: TopicCallbacks): void {
    this.stopping = false;
    this.callbacks = callbacks;
    this.connect();
  }

  // ── additional outbound topics ────────────────────────────

  async sendReceipt(targetDid: string, receipt: DeliveryReceipt): Promise<void> {
    await this.gateway.client.messaging.send({
      targetDid,
      topic: TOPIC_RECEIPT,
      payload: JSON.stringify(receipt),
      ttlSec: 86_400,
      priority: 1,
      compress: false,
      idempotencyKey: `receipt:${receipt.envelopeId}:${receipt.status}`,
    });
  }

  async sendGroupSync(targetDids: string[], payload: GroupSyncPayload): Promise<void> {
    await this.gateway.client.messaging.sendBatch({
      targetDids,
      topic: TOPIC_GROUP_SYNC,
      payload: JSON.stringify(payload),
      ttlSec: 86_400,
      priority: 2,
      compress: true,
      idempotencyKey: `group-sync:${payload.groupId}:${payload.epoch}`,
    });
  }

  async sendProfileCard(targetDid: string, payload: ProfileCardPayload): Promise<void> {
    await this.gateway.client.messaging.send({
      targetDid,
      topic: TOPIC_PROFILE_CARD,
      payload: JSON.stringify(payload),
      ttlSec: 7 * 24 * 3600, // 7 days
      priority: 1,
      compress: false,
      idempotencyKey: `profile-card:${payload.did}:${Date.now()}`,
    });
  }
  /**
   * Relay an attachment to a target DID via ClawNet P2P.
   * The file is stored on the receiver's ClawNet node under `attachmentId`.
   * Returns { delivered: true } when the receiver's node accepted the file.
   */
  async relayAttachment(
    targetDid: string,
    data: Buffer,
    contentType: string,
    attachmentId: string,
    fileName?: string,
  ): Promise<{ delivered: boolean }> {
    return this.gateway.client.messaging.relayAttachment({
      targetDid,
      data: data.toString('base64'),
      contentType,
      fileName,
      attachmentId,
    });
  }

  /**
   * Download a previously-relayed attachment from this node's local ClawNet instance.
   * Returns the raw binary, or null if not found.
   */
  async downloadAttachment(attachmentId: string): Promise<Buffer | null> {
    try {
      const arrayBuf = await this.gateway.client.messaging.getAttachment(attachmentId);
      return Buffer.from(arrayBuf as ArrayBuffer);
    } catch {
      return null;
    }
  }
  stopListening(): void {
    this.stopping = true;
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  // ── private ───────────────────────────────────────────────

  private connect(): void {
    if (this.stopping) return;

    let wsUrl = this.baseUrl.replace(/^http/, 'ws')
      + '/api/v1/messaging/subscribe';
    const params = new URLSearchParams();
    // Subscribe to telagent app topics AND the _attachment relay notification from ClawNet P2P.
    params.set('topic', 'telagent/*,_attachment');
    if (this.apiKey) {
      params.set('apiKey', this.apiKey);
    }
    if (this.lastSeq > 0) {
      params.set('sinceSeq', String(this.lastSeq));
    }
    const qs = params.toString();
    if (qs) wsUrl += `?${qs}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.addEventListener('open', () => {
      logger.info('[p2p-transport] WS connected to ClawNet (sinceSeq=%d)', this.lastSeq);
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      void this.handleFrame(String(event.data));
    });

    ws.addEventListener('close', () => {
      if (!this.stopping) {
        logger.warn('[p2p-transport] WS closed, reconnecting in %dms...', RECONNECT_DELAY_MS);
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    });

    ws.addEventListener('error', (event: Event) => {
      logger.error('[p2p-transport] WS error: %s', (event as ErrorEvent).message ?? 'unknown');
    });
  }

  private async handleFrame(raw: string): Promise<void> {
    try {
      const frame = JSON.parse(raw) as {
        type: string;
        seq?: number;
        lastSeq?: number;
        topicFilter?: string;
        data?: {
          sourceDid: string;
          topic: string;
          payload: string;
          messageId: string;
          seq: number;
        };
      };

      switch (frame.type) {
        case 'connected':
          if (frame.seq && this.lastSeq === 0) {
            this.lastSeq = frame.seq;
          }
          logger.info('[p2p-transport] Subscribed topic=%s seq=%d', frame.topicFilter, frame.seq);
          break;

        case 'message':
          if (frame.data) {
            await this.routeMessage(frame.data);
            if (frame.data.seq > this.lastSeq) {
              this.lastSeq = frame.data.seq;
            }
            await this.gateway.client.messaging.ack(frame.data.messageId);
          }
          break;

        case 'replay_done':
          if (frame.lastSeq && frame.lastSeq > this.lastSeq) {
            this.lastSeq = frame.lastSeq;
          }
          logger.info('[p2p-transport] Replay done, caught up to seq %d', frame.lastSeq);
          break;

        case 'receipt':
          // delivery receipt — informational only at this stage
          break;
      }
    } catch (err) {
      logger.error('[p2p-transport] Failed to process WS frame: %s', (err as Error).message);
    }
  }

  private async routeMessage(data: { sourceDid: string; topic: string; payload: string }): Promise<void> {
    const parsed = JSON.parse(data.payload) as Record<string, unknown>;
    switch (data.topic) {
      case TOPIC_ENVELOPE:
        await this.callbacks.onEnvelope?.(parsed, data.sourceDid);
        break;
      case TOPIC_RECEIPT:
        await this.callbacks.onReceipt?.(parsed as unknown as DeliveryReceipt, data.sourceDid);
        break;
      case TOPIC_GROUP_SYNC:
        await this.callbacks.onGroupSync?.(parsed as unknown as GroupSyncPayload, data.sourceDid);
        break;
      case TOPIC_PROFILE_CARD:
        await this.callbacks.onProfileCard?.(parsed as unknown as ProfileCardPayload, data.sourceDid);
        break;
      case TOPIC_ATTACHMENT:
        await this.callbacks.onAttachment?.(parsed as unknown as AttachmentNotification, data.sourceDid);
        break;
      default:
        logger.warn('[p2p-transport] Unknown topic: %s', data.topic);
    }
  }
}
