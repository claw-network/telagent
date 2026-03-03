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
import { GroupRepository } from './storage/group-repository.js';

export class TelagentNode {
  private mailboxCleanupTimer: NodeJS.Timeout | null = null;
  private readonly contracts: ContractProvider;
  private readonly repo: GroupRepository;
  private readonly identityService: IdentityAdapterService;
  private readonly gasService: GasService;
  private readonly groupService: GroupService;
  private readonly messageService: MessageService;
  private readonly attachmentService: AttachmentService;
  private readonly federationService: FederationService;
  private readonly indexer: GroupIndexer;
  private readonly apiServer: ApiServer;

  constructor(private readonly config: AppConfig) {
    this.contracts = new ContractProvider(config.chain);
    this.repo = new GroupRepository(resolveDataPath(config.dataDir, 'group-indexer.sqlite'));

    this.identityService = new IdentityAdapterService(this.contracts);
    this.gasService = new GasService(this.contracts);
    this.groupService = new GroupService(this.contracts, this.identityService, this.gasService, this.repo);
    this.messageService = new MessageService(this.groupService);
    this.attachmentService = new AttachmentService();
    this.federationService = new FederationService();

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
    };

    this.apiServer = new ApiServer(runtime);
  }

  async start(): Promise<void> {
    await this.indexer.start();
    await this.apiServer.start();
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
      this.messageService.cleanupExpired();
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
