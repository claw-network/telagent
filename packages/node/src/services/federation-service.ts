interface FederationEnvelope {
  envelopeId: string;
  sourceDomain?: string;
  payload: Record<string, unknown>;
  receivedAtMs: number;
}

interface FederationReceipt {
  envelopeId: string;
  status: 'delivered' | 'read';
  receivedAtMs: number;
}

export class FederationService {
  private readonly envelopes: FederationEnvelope[] = [];
  private readonly receipts: FederationReceipt[] = [];
  private readonly groupStateSync: Array<{ groupId: string; state: string; updatedAtMs: number }> = [];

  receiveEnvelope(payload: Record<string, unknown>): { accepted: boolean; id: string } {
    const envelopeId = typeof payload.envelopeId === 'string' ? payload.envelopeId : `fed-${Date.now()}`;
    this.envelopes.push({
      envelopeId,
      sourceDomain: typeof payload.sourceDomain === 'string' ? payload.sourceDomain : undefined,
      payload,
      receivedAtMs: Date.now(),
    });
    return {
      accepted: true,
      id: envelopeId,
    };
  }

  syncGroupState(payload: { groupId: string; state: string }): { synced: boolean; updatedAtMs: number } {
    const item = {
      groupId: payload.groupId,
      state: payload.state,
      updatedAtMs: Date.now(),
    };
    this.groupStateSync.push(item);
    return {
      synced: true,
      updatedAtMs: item.updatedAtMs,
    };
  }

  recordReceipt(payload: { envelopeId: string; status: 'delivered' | 'read' }): { accepted: boolean } {
    this.receipts.push({
      envelopeId: payload.envelopeId,
      status: payload.status,
      receivedAtMs: Date.now(),
    });
    return { accepted: true };
  }

  nodeInfo(): {
    protocolVersion: string;
    capabilities: string[];
    envelopeCount: number;
    receiptCount: number;
  } {
    return {
      protocolVersion: 'v1',
      capabilities: ['identity', 'groups', 'messages', 'attachments', 'federation'],
      envelopeCount: this.envelopes.length,
      receiptCount: this.receipts.length,
    };
  }
}
