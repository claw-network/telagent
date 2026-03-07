import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const logger = console;

async function getListeningPids(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-n',
      '-P',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ]);
    return stdout
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
}

async function getCommandLine(pid: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function killClawnetdOnPort(port: number): Promise<boolean> {
  const pids = await getListeningPids(port);
  if (!pids.length) {
    return false;
  }

  let killed = false;
  for (const pid of pids) {
    if (pid === process.pid) {
      continue;
    }
    const command = (await getCommandLine(pid)).toLowerCase();
    if (!command.includes('clawnetd')) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
      killed = true;
      logger.warn('[telagent] Stopped clawnetd (pid=%d) on port %d', pid, port);
    } catch (error) {
      logger.warn('[telagent] Failed to stop clawnetd (pid=%d): %s', pid, (error as Error).message);
    }
  }

  return killed;
}
