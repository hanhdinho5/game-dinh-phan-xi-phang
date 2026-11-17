import fs from 'node:fs';
import path from 'node:path';
import type { LogEntry } from '../shared/types';

/**
 * Log ra console + file data/logs/<ngày>.log, giữ 200 dòng gần nhất để trang admin xem.
 * debug() chỉ ghi file (bình luận nhiều, in ra console sẽ ngập).
 */
export class Logger {
  private recent: LogEntry[] = [];
  private stream: fs.WriteStream | null = null;
  private day = '';

  constructor(
    private readonly dir: string | null,
    private readonly quiet = false,
  ) {}

  private write(level: string, msg: string) {
    if (!this.dir) return;
    const d = new Date().toLocaleDateString('sv');
    if (d !== this.day) {
      this.stream?.end();
      try {
        fs.mkdirSync(this.dir, { recursive: true });
        this.stream = fs.createWriteStream(path.join(this.dir, `${d}.log`), { flags: 'a' });
        this.stream.on('error', () => (this.stream = null));
      } catch {
        this.stream = null;
      }
      this.day = d;
    }
    this.stream?.write(`${new Date().toISOString()} [${level}] ${msg}\n`);
  }

  private push(level: LogEntry['level'], msg: string) {
    this.recent.push({ at: Date.now(), level, msg });
    if (this.recent.length > 200) this.recent.shift();
    this.write(level, msg);
  }

  info(msg: string) {
    if (!this.quiet) console.log(`[${time()}] ${msg}`);
    this.push('info', msg);
  }
  warn(msg: string) {
    if (!this.quiet) console.warn(`[${time()}] ⚠ ${msg}`);
    this.push('warn', msg);
  }
  error(msg: string, err?: unknown) {
    const full = err ? `${msg}: ${err instanceof Error ? err.stack || err.message : String(err)}` : msg;
    if (!this.quiet) console.error(`[${time()}] ✖ ${full}`);
    this.push('error', full);
  }
  debug(msg: string) {
    if (process.env.DEBUG_LOG === '1') console.log(`[${time()}] · ${msg}`);
    this.write('debug', msg);
  }

  entries(n = 80) {
    return this.recent.slice(-n);
  }
}

const time = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });

/** Logger im lặng cho test */
export const silentLogger = () => new Logger(null, true);
