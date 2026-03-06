import type { Envelope } from '@telagent/protocol';
import type { ClawNetGatewayService } from '../clawnet/gateway-service.js';

const logger = console;

const TOPIC = 'telagent/envelope';
const RECONNECT_DELAY_MS = 3_000;

export class ClawNetTransportService {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private ws?: WebSocket;
  private lastSeq = 0;
  private stopping = false;
  private onEnvelopeCallback?: (raw: Record<string, unknown>) => Promise<unknown>;

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
      topic: TOPIC,
      payload: JSON.stringify(envelope),
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
      topic: TOPIC,
      payload: JSON.stringify(envelope),
      ttlSec: envelope.ttlSec,
      priority: envelope.contentType.startsWith('control/') ? 3 : 1,
      compress: true,
      idempotencyKey: envelope.envelopeId,
    });
  }

  // ── inbound (WebSocket subscribe) ─────────────────────────

  startListening(
    onEnvelope: (raw: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.stopping = false;
    this.onEnvelopeCallback = onEnvelope;
    this.connect();
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
      + `/api/v1/messaging/subscribe?topic=${encodeURIComponent(TOPIC)}`;
    if (this.apiKey) {
      wsUrl += `&apiKey=${encodeURIComponent(this.apiKey)}`;
    }
    if (this.lastSeq > 0) {
      wsUrl += `&sinceSeq=${this.lastSeq}`;
    }

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
            const envelope = JSON.parse(frame.data.payload) as Record<string, unknown>;
            await this.onEnvelopeCallback?.(envelope);
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
}
