/**
 * 嵌入式 ClawNet Node 生命周期管理
 *
 * 当 TelAgent 自动启动 ClawNet Node 时，创建此实例。
 * TelAgent.stop() 时调用 managedNode.stop() 同步关闭。
 */
export class ManagedClawNetNode {
  private node: any = null;  // ClawNetNode 实例
  private readonly killClawnetdOnStart: boolean;

  constructor(
    private readonly dataDir: string,
    private readonly passphrase: string,
    private readonly apiPort: number = 9528,
    options?: { killClawnetdOnStart?: boolean },
  ) {
    this.killClawnetdOnStart = options?.killClawnetdOnStart ?? false;
  }

  /**
   * 在已有数据目录上启动 ClawNet Node
   * 如果指定端口被占用，自动尝试 +1 端口（最多 5 次）（RFC §7 风险表）
   */
  async start(): Promise<void> {
    const { killClawnetdOnPort } = await import('./clawnetd-process.js');
    const { ClawNetNode } = await import('@claw-network/node');
    let port = this.apiPort;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        this.node = new ClawNetNode({
          dataDir: this.dataDir,
          passphrase: this.passphrase,
          api: { host: '127.0.0.1', port, enabled: true },
        });
        await this.node.start();
        if (port !== this.apiPort) {
          console.warn('[telagent] ClawNet Node started on fallback port %d (original %d was busy)', port, this.apiPort);
        }
        return;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? '';
        if ((msg.includes('EADDRINUSE') || msg.includes('address already in use')) && attempt < maxAttempts - 1) {
          if (this.killClawnetdOnStart && await killClawnetdOnPort(port)) {
            continue;
          }
          port++;
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[telagent] FATAL: Could not start ClawNet Node — ports ${this.apiPort}-${port} all in use`);
  }

  /**
   * 获取实际使用的 API 端口（端口回退后可能与构造参数不同）
   */
  getApiPort(): number {
    return this.node?.apiPort ?? this.apiPort;
  }

  /**
   * 全新初始化 + 启动（首次运行）
   * ClawNetNode@0.4.0 的 start() 会自动检测数据目录，若为空则初始化密钥
   */
  async initAndStart(): Promise<void> {
    await this.start();
  }

  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
  }

  getDid(): string | null {
    if (!this.node) throw new Error('ClawNet Node not started');
    return this.node.getDid();
  }

  getEventStore(): any | undefined {
    return this.node?.eventStore;
  }

  isRunning(): boolean {
    return this.node !== null;
  }
}
