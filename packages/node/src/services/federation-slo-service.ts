import type {
  FederationDlqEntry,
  FederationDlqReplayReport,
  ReplayFederationDlqOptions,
} from './federation-service.js';
import type { NodeMonitoringService } from './node-monitoring-service.js';

export interface FederationSloRuntime {
  listDlqEntries(options?: { status?: 'PENDING' | 'REPLAYED' | 'ALL'; limit?: number }): FederationDlqEntry[];
  replayDlq(options?: ReplayFederationDlqOptions): FederationDlqReplayReport;
}

export interface FederationSloConfig {
  replayIntervalSec: number;
  replayBatchSize: number;
  replayStopOnError: boolean;
}

export interface FederationSloClock {
  nowMs(): number;
}

export interface FederationSloRunReport {
  ranAtMs: number;
  pendingBefore: number;
  pendingAfter: number;
  replay: FederationDlqReplayReport;
}

const SYSTEM_CLOCK: FederationSloClock = {
  nowMs: () => Date.now(),
};

export class FederationSloService {
  private readonly clock: FederationSloClock;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly federationService: FederationSloRuntime,
    private readonly monitoringService: NodeMonitoringService,
    private readonly config: FederationSloConfig,
    options?: { clock?: FederationSloClock },
  ) {
    this.clock = options?.clock ?? SYSTEM_CLOCK;
  }

  runOnce(): FederationSloRunReport {
    const ranAtMs = this.clock.nowMs();
    const pendingBefore = this.federationService.listDlqEntries({ status: 'PENDING' }).length;
    const replay = this.federationService.replayDlq({
      maxItems: this.config.replayBatchSize,
      stopOnError: this.config.replayStopOnError,
    });
    const pendingAfter = this.federationService.listDlqEntries({ status: 'PENDING' }).length;

    this.monitoringService.recordFederationDlqReplay({
      processed: replay.processed,
      replayed: replay.replayed,
      failed: replay.failed,
      pendingBefore,
      pendingAfter,
      atMs: ranAtMs,
    });

    return {
      ranAtMs,
      pendingBefore,
      pendingAfter,
      replay,
    };
  }

  start(): void {
    if (this.interval) {
      return;
    }

    const intervalSec = Number.isFinite(this.config.replayIntervalSec)
      ? Math.max(1, Math.floor(this.config.replayIntervalSec))
      : 60;

    this.interval = setInterval(() => {
      try {
        this.runOnce();
      } catch {
        // keep scheduler alive and rely on metrics/logs for visibility
      }
    }, intervalSec * 1000);
    this.interval.unref();
  }

  stop(): void {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
  }
}
