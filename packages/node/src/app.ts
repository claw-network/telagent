import { ApiServer } from './api/server.js';
import type { RuntimeContext } from './api/types.js';
import { resolveDataPath, type AppConfig } from './config.js';
import { GroupIndexer } from './indexer/group-indexer.js';
import { AttachmentService } from './services/attachment-service.js';
import { ContractProvider } from './services/contract-provider.js';
import { FederationService } from './services/federation-service.js';
import { GasService } from './services/gas-service.js';
import { GroupService } from './services/group-service.js';
import { IdentityAdapterService } from './services/identity-adapter-service.js';
import { MessageService } from './services/message-service.js';
import { NodeMonitoringService } from './services/node-monitoring-service.js';
import { GroupRepository } from './storage/group-repository.js';
import { MessageRepository } from './storage/message-repository.js';

export class TelagentNode {
  private mailboxCleanupTimer: NodeJS.Timeout | null = null;
  private readonly contracts: ContractProvider;
  private readonly repo: GroupRepository;
  private readonly messageRepo: MessageRepository;
  private readonly identityService: IdentityAdapterService;
  private readonly gasService: GasService;
  private readonly groupService: GroupService;
  private readonly messageService: MessageService;
  private readonly attachmentService: AttachmentService;
  private readonly federationService: FederationService;
  private readonly monitoringService: NodeMonitoringService;
  private readonly indexer: GroupIndexer;
  private readonly apiServer: ApiServer;

  constructor(private readonly config: AppConfig) {
    this.contracts = new ContractProvider(config.chain);
    this.repo = new GroupRepository(resolveDataPath(config.dataDir, 'group-indexer.sqlite'));
    this.messageRepo = new MessageRepository(resolveDataPath(config.dataDir, 'mailbox.sqlite'));

    this.identityService = new IdentityAdapterService(this.contracts);
    this.gasService = new GasService(this.contracts);
    this.groupService = new GroupService(this.contracts, this.identityService, this.gasService, this.repo);
    this.messageService = new MessageService(this.groupService, {
      repository: this.messageRepo,
    });
    this.attachmentService = new AttachmentService();
    this.federationService = new FederationService(config.federation);
    this.monitoringService = new NodeMonitoringService({
      thresholds: {
        errorRateWarnRatio: config.monitoring.errorRateWarnRatio,
        errorRateCriticalRatio: config.monitoring.errorRateCriticalRatio,
        requestP95WarnMs: config.monitoring.requestP95WarnMs,
        requestP95CriticalMs: config.monitoring.requestP95CriticalMs,
        maintenanceStaleWarnSec: config.monitoring.maintenanceStaleWarnSec,
        maintenanceStaleCriticalSec: config.monitoring.maintenanceStaleCriticalSec,
      },
    });

    this.indexer = new GroupIndexer(this.contracts, this.repo, {
      finalityDepth: config.chain.finalityDepth,
    });

    const runtime: RuntimeContext = {
      config: {
        host: config.host,
        port: config.port,
      },
      identityService: this.identityService,
      groupService: this.groupService,
      gasService: this.gasService,
      messageService: this.messageService,
      attachmentService: this.attachmentService,
      federationService: this.federationService,
      monitoringService: this.monitoringService,
    };

    this.apiServer = new ApiServer(runtime);
  }

  async start(): Promise<void> {
    await this.indexer.start();
    await this.apiServer.start();
    this.monitoringService.recordMailboxMaintenance(this.messageService.runMaintenance());
    this.startMailboxCleaner();
  }

  async stop(): Promise<void> {
    this.stopMailboxCleaner();
    await this.apiServer.stop();
    await this.indexer.stop();
    await this.contracts.destroy();
  }

  private startMailboxCleaner(): void {
    if (this.mailboxCleanupTimer) {
      return;
    }

    const intervalSec = Number.isFinite(this.config.mailboxCleanupIntervalSec)
      ? Math.max(5, Math.floor(this.config.mailboxCleanupIntervalSec))
      : 60;
    this.mailboxCleanupTimer = setInterval(() => {
      const report = this.messageService.runMaintenance();
      this.monitoringService.recordMailboxMaintenance(report);
    }, intervalSec * 1000);
    this.mailboxCleanupTimer.unref();
  }

  private stopMailboxCleaner(): void {
    if (!this.mailboxCleanupTimer) {
      return;
    }
    clearInterval(this.mailboxCleanupTimer);
    this.mailboxCleanupTimer = null;
  }
}
