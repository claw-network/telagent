/**
 * 启动时 Passphrase 验证
 *
 * 对所有场景都做一次验证（包括嵌入式启动）。
 * 验证方式：用 passphrase 尝试一个需要签名的操作。
 *
 * 结果：
 * - valid=true, error=undefined → 验证通过
 * - valid=false, error="..." → 验证失败（passphrase 不匹配）→ 拒绝启动
 * - valid=true, error="..." → 验证不确定（网络问题等）→ 打印警告，不阻塞
 */
export async function verifyPassphrase(
  nodeUrl: string,
  passphrase: string,
): Promise<{ valid: boolean; did?: string; error?: string }> {
  try {
    const { ClawNetClient } = await import('@claw-network/sdk');
    const client = new ClawNetClient({ baseUrl: nodeUrl });
    const unsafeClient = client as any;

    // 1. 获取 Node 的 DID（只读，不需要 passphrase）
    const nodeResp = await fetch(`${nodeUrl}/api/v1/node`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!nodeResp.ok) {
      return { valid: true, error: `ClawNet Node returned ${nodeResp.status}` };
    }
    const nodeBody = await nodeResp.json() as { data?: { did?: string } };
    const did = nodeBody?.data?.did;
    if (!did) {
      return { valid: true, error: 'Cannot retrieve DID from ClawNet Node' };
    }

    // 2. 用 passphrase 尝试获取 nonce（内部会解密 keystore 验证密码）
    await unsafeClient.wallet.getNonce({ did, passphrase });

    return { valid: true, did };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);

    // 解密失败 = passphrase 不匹配
    if (msg.includes('decrypt') || msg.includes('passphrase') || msg.includes('password')) {
      return { valid: false, error: `Passphrase mismatch: ${msg}` };
    }

    // 其他错误（网络问题等）不阻塞启动
    return { valid: true, error: `Passphrase verification inconclusive: ${msg}` };
  }
}
