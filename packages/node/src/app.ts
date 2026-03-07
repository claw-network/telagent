import { ApiServer } from './api/server.js';
import type { RuntimeContext } from './api/types.js';
import type { AppConfig } from './config.js';
import { discoverOrStartClawNet, type ClawNetDiscoveryResult } from './clawnet/discovery.js';
import { ClawNetGatewayService } from './clawnet/gateway-service.js';
import { killClawnetdOnPort } from './clawnet/clawnetd-process.js';
import { NonceManager } from './clawnet/nonce-manager.js';
import { SessionManager } from './clawnet/session-manager.js';
import { verifyPassphrase } from './clawnet/verify-passphrase.js';
import { GroupIndexer } from './indexer/group-indexer.js';
import { AttachmentService } from './services/attachment-service.js';
import { ClawNetTransportService } from './services/clawnet-transport-service.js';
import { ContractProvider } from './services/contract-provider.js';
import { GroupService } from './services/group-service.js';
import { IdentityAdapterService } from './services/identity-adapter-service.js';
import { KeyLifecycleService } from './services/key-lifecycle-service.js';
import { MessageService } from './services/message-service.js';
import { NodeMonitoringService } from './services/node-monitoring-service.js';
import { OwnerPermissionService } from './services/owner-permission-service.js';
import { ContactService } from './services/contact-service.js';
import { resolvePassphrase as resolvePassphraseFromSources } from './storage/passphrase-resolver.js';
import { savePassphrase } from './storage/passphrase-store.js';
import type { TelagentStoragePaths } from './storage/telagent-paths.js';
import { ensureTelagentDirs, resolveTelagentPaths, verifySecretsPermissions } from './storage/telagent-paths.js';
import { GroupRepository } from './storage/group-repository.js';
import type { MailboxStore } from './storage/mailbox-store.js';
import { MessageRepository } from './storage/message-repository.js';
import { ContactRepository } from './storage/contact-repository.js';
import { PostgresMessageRepository } from './storage/postgres-message-repository.js';

const logger = console;
const SESSION_RENEW_MS = 23 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

export class TelagentNode {
  private mailboxCleanupTimer: NodeJS.Timeout | null = null;
  private contracts: ContractProvider | null = null;
  private repo: GroupRepository | null = null;
  private mailboxStore: MailboxStore | null = null;
  private identityService!: IdentityAdapterService;
  private keyLifecycleService: KeyLifecycleService | null = null;
  private groupService: GroupService | null = null;
  private messageService: MessageService | null = null;
  private attachmentService: AttachmentService | null = null;
  private clawnetTransportService: ClawNetTransportService | null = null;
  private monitoringService: NodeMonitoringService | null = null;
  private ownerPermissionService: OwnerPermissionService | null = null;
  private indexer: GroupIndexer | null = null;
  private apiServer: ApiServer | null = null;

  private paths!: TelagentStoragePaths;
  private managedClawNet?: any;
  private sessionManager!: SessionManager;
  private nonceManager!: NonceManager;
  private clawnetGateway!: ClawNetGatewayService;
  private autoSessionToken?: string;
  private renewTimer?: ReturnType<typeof setInterval>;
  private clawnetApiPort?: number;

  constructor(private readonly config: AppConfig) {}

  async start(): Promise<void> {
    this.paths = resolveTelagentPaths(this.config.paths.root);
    await ensureTelagentDirs(this.paths);
    await verifySecretsPermissions(this.paths);
    logger.info('[telagent] TELAGENT_HOME: %s', this.paths.root);

    const passphrase = await resolvePassphraseFromSources(this.paths);
    const discovery: ClawNetDiscoveryResult = await discoverOrStartClawNet(
      this.config.clawnet.nodeUrl,
      passphrase ?? undefined,
      {
        autoStart: this.config.clawnet.autoStart,
        autoDiscover: this.config.clawnet.autoDiscover,
        killClawnetdOnStart: this.config.clawnet.killClawnetdOnStart,
      },
    );
    this.managedClawNet = discovery.managedNode;
    logger.info('[telagent] ClawNet: %s -> %s', discovery.source, discovery.nodeUrl);

    if (discovery.nodeUrl) {
      try {
        const url = new URL(discovery.nodeUrl);
        const port = url.port
          ? Number.parseInt(url.port, 10)
          : (url.protocol === 'https:' ? 443 : 80);
        if (Number.isInteger(port)) {
          this.clawnetApiPort = port;
        }
      } catch {
        this.clawnetApiPort = undefined;
      }
    }

    if (!discovery.nodeUrl) {
      throw new Error('[telagent] FATAL: ClawNet discovery returned no nodeUrl');
    }

    if (passphrase) {
      const check = await verifyPassphrase(discovery.nodeUrl, passphrase);
      if (!check.valid) {
        if (this.managedClawNet) {
          await this.managedClawNet.stop();
        }
        throw new Error(
          `[telagent] FATAL: Passphrase verification failed - ${check.error}. `
          + 'Ensure TELAGENT_CLAWNET_PASSPHRASE matches the ClawNet Node keystore.',
        );
      }
      if (check.error) {
        logger.warn('[telagent] %s', check.error);
      }
      logger.info('[telagent] Passphrase verified - DID: %s', check.did);
      await savePassphrase(this.paths, passphrase);
    }

    this.sessionManager = new SessionManager();
    this.nonceManager = new NonceManager(
      discovery.managedNode?.getEventStore?.(),
    );
    this.clawnetGateway = new ClawNetGatewayService(
      {
        baseUrl: discovery.nodeUrl,
        apiKey: this.config.clawnet.apiKey,
        timeoutMs: this.config.clawnet.timeoutMs,
      },
      this.sessionManager,
      this.nonceManager,
    );

    logger.info('[telagent] Waiting for ClawNet Node to sync...');
    const clawnetClient = this.clawnetGateway.client as unknown as {
      node?: {
        waitForSync?: () => Promise<void>;
      };
    };
    if (clawnetClient.node?.waitForSync) {
      await clawnetClient.node.waitForSync();
    }
    logger.info('[telagent] ClawNet Node synced');

    this.identityService = new IdentityAdapterService(this.clawnetGateway);
    await this.identityService.init();
    logger.info('[telagent] Identity: %s', this.identityService.getSelfDid());

    if (passphrase) {
      const selfDid = this.identityService.getSelfDid();
      const result = await this.sessionManager.unlock({
        passphrase,
        did: selfDid,
        ttlSeconds: SESSION_TTL_SECONDS,
        validatePassphrase: async () => true,
      });
      this.autoSessionToken = result.sessionToken;
      logger.info('[telagent] Auto-session expires: %s', result.expiresAt.toISOString());

      this.renewTimer = setInterval(async () => {
        try {
          const old = this.autoSessionToken;
          const renew = await this.sessionManager.unlock({
            passphrase,
            did: selfDid,
            ttlSeconds: SESSION_TTL_SECONDS,
            validatePassphrase: async () => true,
          });
          this.autoSessionToken = renew.sessionToken;
          if (old) {
            this.sessionManager.lock(old);
          }
          logger.info('[telagent] Auto-session renewed - expires: %s', renew.expiresAt.toISOString());
        } catch (error) {
          logger.error('[telagent] Auto-session renewal failed: %s', (error as Error).message);
        }
      }, SESSION_RENEW_MS);
      if (this.renewTimer.unref) {
        this.renewTimer.unref();
      }
    }

    logger.info('[telagent] [startup] creating ContractProvider + repos...');
    this.contracts = new ContractProvider(this.config.chain);
    this.repo = new GroupRepository(this.paths.groupIndexerDb);
    this.mailboxStore = this.createMailboxStore(this.config);

    this.groupService = new GroupService(
      this.contracts,
      this.identityService,
      this.repo,
    );
    this.keyLifecycleService = new KeyLifecycleService();
    this.messageService = new MessageService(this.groupService, {
      repository: this.mailboxStore,
      keyLifecycleService: this.keyLifecycleService,
      identityService: this.identityService,
    });
    this.ownerPermissionService = new OwnerPermissionService({
      mode: this.config.owner.mode,
      interventionScopes: this.config.owner.scopes,
      privateConversations: this.config.owner.privateConversations,
    });
    this.attachmentService = new AttachmentService();
    const contactRepository = new ContactRepository(this.paths.contactsDb);
    const contactService = new ContactService(contactRepository);
    this.clawnetTransportService = new ClawNetTransportService(
      this.clawnetGateway,
      { baseUrl: discovery.nodeUrl, apiKey: this.config.clawnet.apiKey },
    );
    this.monitoringService = new NodeMonitoringService({
      thresholds: {
        errorRateWarnRatio: this.config.monitoring.errorRateWarnRatio,
        errorRateCriticalRatio: this.config.monitoring.errorRateCriticalRatio,
        requestP95WarnMs: this.config.monitoring.requestP95WarnMs,
        requestP95CriticalMs: this.config.monitoring.requestP95CriticalMs,
        maintenanceStaleWarnSec: this.config.monitoring.maintenanceStaleWarnSec,
        maintenanceStaleCriticalSec: this.config.monitoring.maintenanceStaleCriticalSec,
      },
    });

    this.indexer = new GroupIndexer(this.contracts, this.repo, {
      finalityDepth: this.config.chain.finalityDepth,
    });

    const runtime: RuntimeContext = {
      config: {
        host: this.config.host,
        port: this.config.port,
      },
      identityService: this.identityService,
      groupService: this.groupService,
      messageService: this.messageService,
      attachmentService: this.attachmentService,
      monitoringService: this.monitoringService,
      keyLifecycleService: this.keyLifecycleService,
      clawnetGateway: this.clawnetGateway,
      clawnetTransportService: this.clawnetTransportService,
      sessionManager: this.sessionManager,
      nonceManager: this.nonceManager,
      ownerPermissionService: this.ownerPermissionService,
      contactService,
      configuredPassphrase: passphrase ?? undefined,
    };

    this.apiServer = new ApiServer(runtime);

    logger.info('[telagent] [startup] initializing mailbox store...');
    if (this.mailboxStore.init) {
      await this.mailboxStore.init();
    }
    logger.info('[telagent] [startup] starting indexer...');
    await this.indexer.start();
    logger.info('[telagent] [startup] starting API server...');
    await this.apiServer.start();
    this.clawnetTransportService.startListening({
      onEnvelope: (raw, sourceDid) => this.messageService!.ingestFederatedEnvelope(raw, sourceDid),
    });
    logger.info('[telagent] P2P transport listener started');
    this.monitoringService.recordMailboxMaintenance(await this.messageService.runMaintenance());
    this.startMailboxCleaner();

    logger.info('[telagent] Node started on :%d', this.config.port);
  }

  async stop(): Promise<void> {
    logger.info('[telagent] Shutting down...');

    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = undefined;
    }

    this.sessionManager?.lockAll();

    this.stopMailboxCleaner();
    this.clawnetTransportService?.stopListening();
    await this.apiServer?.stop();
    await this.indexer?.stop();
    this.messageService?.dispose();
    if (this.mailboxStore?.close) {
      await this.mailboxStore.close();
    }
    await this.contracts?.destroy();

    if (this.managedClawNet) {
      await this.managedClawNet.stop();
      this.managedClawNet = undefined;
      logger.info('[telagent] Managed ClawNet Node stopped');
    }

    if (this.config.clawnet.killClawnetdOnStop && this.clawnetApiPort) {
      await killClawnetdOnPort(this.clawnetApiPort);
    }

    logger.info('[telagent] Node stopped');
  }

  getAutoSessionToken(): string {
    if (!this.autoSessionToken) {
      throw new Error('No auto-session available.');
    }
    return this.autoSessionToken;
  }

  private startMailboxCleaner(): void {
    if (this.mailboxCleanupTimer || !this.messageService || !this.monitoringService) {
      return;
    }

    const intervalSec = Number.isFinite(this.config.mailboxCleanupIntervalSec)
      ? Math.max(5, Math.floor(this.config.mailboxCleanupIntervalSec))
      : 60;
    this.mailboxCleanupTimer = setInterval(() => {
      void this.messageService!
        .runMaintenance()
        .then((report) => {
          this.monitoringService!.recordMailboxMaintenance(report);
        })
        .catch(() => {
          // keep cleaner loop alive even when one maintenance tick fails
        });
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

  private createMailboxStore(config: AppConfig): MailboxStore {
    if (config.mailboxStore.backend === 'postgres') {
      if (!config.mailboxStore.postgres) {
        throw new Error('mailbox postgres config is required when backend=postgres');
      }
      return new PostgresMessageRepository({
        connectionString: config.mailboxStore.postgres.connectionString,
        schema: config.mailboxStore.postgres.schema,
        ssl: config.mailboxStore.postgres.ssl,
        maxConnections: config.mailboxStore.postgres.maxConnections,
      });
    }

    return new MessageRepository(config.mailboxStore.sqlitePath);
  }
}
