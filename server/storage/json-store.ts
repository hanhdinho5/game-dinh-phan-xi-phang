import fs from 'node:fs';
import path from 'node:path';
import type { GameConfig, RoundResult, SessionSummary } from '../../shared/types';
import type { EngineSnapshot, SessionRecord } from '../game/phan-xi-pang-engine';
import type { WordOverrides } from '../game/word-bank';
import type { Logger } from '../logger';

/**
 * Lưu dữ liệu ra file JSON trong thư mục data/ (máy chủ kênh, không cần MySQL).
 *
 *   data/config.json                 cấu hình game lần cuối
 *   data/current-session.json        ảnh chụp phiên đang chơi (tắt server bật lại không mất điểm)
 *   data/word-overrides.json         từ admin thêm / xoá / đánh dấu không hợp lệ
 *   data/players.json                hồ sơ người chơi qua mọi phiên (không bao giờ tự xoá)
 *   data/sessions/<id>.json          kết quả từng cuộc đua (bảng xếp hạng, chuỗi từ, top 4)
 *   data/sessions/<id>.rounds.jsonl  từng lượt: từ, ai đúng, hạng, điểm (mỗi dòng 1 lượt)
 *   data/settings.json               tài khoản TikTok đang kết nối
 *   data/logs/<ngày>.log             log
 */
export interface PlayerProfile {
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  firstSeen: number;
  lastSeen: number;
  sessions: number;
  totalPoints: number;
  totalCorrect: number;
  bestScore: number;
  wins: number;
}

export interface Settings {
  tiktokUser?: string;
}

export class JsonStore {
  readonly sessionsDir: string;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    readonly dir: string,
    private readonly log: Logger,
  ) {
    this.sessionsDir = path.join(dir, 'sessions');
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  private file(name: string) {
    return path.join(this.dir, name);
  }

  read<T>(name: string, fallback: T): T {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file(name), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.log.warn(`Không đọc được ${name}: ${(err as Error).message}`);
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      this.quarantine(name, err);
      return fallback;
    }
  }

  /** File JSON hỏng: giữ lại bản hỏng (đổi tên) để lần ghi sau không đè mất, rồi dùng giá trị mặc định */
  private quarantine(name: string, err: unknown) {
    const from = this.file(name);
    const to = `${from}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(from, to);
      this.log.error(`${name} bị hỏng (${(err as Error).message}). Đã giữ bản hỏng ở ${path.basename(to)}, dùng giá trị mặc định`);
    } catch (e) {
      this.log.error(`${name} bị hỏng và không đổi tên được`, e);
    }
  }

  /** Ghi file an toàn: ghi ra file tạm rồi đổi tên (mất điện giữa chừng không hỏng file cũ) */
  write(name: string, data: unknown) {
    const target = this.file(name);
    const tmp = `${target}.tmp`;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, target);
    } catch (err) {
      this.log.error(`Không lưu được ${name}`, err);
    }
  }

  /** Gom nhiều lần ghi liền nhau thành 1 lần (sau `ms`) */
  writeSoon(name: string, getData: () => unknown, ms = 1000) {
    if (this.timers.has(name)) return;
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        this.write(name, getData());
      }, ms),
    );
  }

  /** Tắt server: ghi ngay những gì đang chờ */
  flush(pending: Record<string, () => unknown>) {
    for (const [name, get] of Object.entries(pending)) {
      const t = this.timers.get(name);
      if (t) clearTimeout(t);
      this.timers.delete(name);
      this.write(name, get());
    }
  }

  // ---------- từng loại dữ liệu ----------
  loadConfig() {
    return this.read<Partial<GameConfig> | null>('config.json', null);
  }
  saveConfig(c: GameConfig) {
    this.write('config.json', c);
  }

  loadSnapshot() {
    return this.read<EngineSnapshot | null>('current-session.json', null);
  }

  loadOverrides() {
    return this.read<WordOverrides | null>('word-overrides.json', null);
  }
  saveOverrides(o: WordOverrides) {
    this.write('word-overrides.json', o);
  }

  loadSettings() {
    return this.read<Settings>('settings.json', {});
  }
  saveSettings(patch: Settings) {
    this.write('settings.json', { ...this.loadSettings(), ...patch });
  }

  appendRound(sessionId: string, r: RoundResult) {
    try {
      fs.appendFileSync(path.join(this.sessionsDir, `${safeId(sessionId)}.rounds.jsonl`), `${JSON.stringify(r)}\n`);
    } catch (err) {
      this.log.error('Không lưu được lịch sử lượt', err);
    }
  }

  /** Lưu kết quả phiên + cộng dồn vào hồ sơ người chơi. Lưu lại cùng phiên thì ghi đè, không cộng 2 lần. */
  saveSession(rec: SessionRecord) {
    const name = `sessions/${safeId(rec.id)}.json`;
    const already = this.read<SessionRecord | null>(name, null);
    this.write(name, rec);
    const profiles = this.read<Record<string, PlayerProfile>>('players.json', {});
    const prevRanking = new Map((already?.ranking ?? []).map((p) => [p.userId, p]));
    const winnerId = rec.winners[0]?.score ? rec.winners[0].userId : null;
    const prevWinner = already?.winners[0]?.score ? already.winners[0].userId : null;
    for (const p of rec.ranking) {
      if (p.isMock || !safeKey(p.userId)) continue; // người chơi giả không vào hồ sơ
      const prev = prevRanking.get(p.userId);
      const cur: PlayerProfile = Object.hasOwn(profiles, p.userId)
        ? profiles[p.userId]
        : { userId: p.userId, uniqueId: p.uniqueId, nickname: p.nickname, avatar: p.avatar, firstSeen: p.joinedAt, lastSeen: 0, sessions: 0, totalPoints: 0, totalCorrect: 0, bestScore: 0, wins: 0 };
      cur.uniqueId = p.uniqueId || cur.uniqueId;
      cur.nickname = p.nickname || cur.nickname;
      cur.avatar = p.avatar || cur.avatar;
      cur.lastSeen = rec.endedAt ?? Date.now();
      if (!prev) cur.sessions += 1;
      cur.totalPoints += p.score - (prev?.score ?? 0);
      cur.totalCorrect += p.correct - (prev?.correct ?? 0);
      cur.bestScore = Math.max(cur.bestScore, p.score);
      if (p.userId === winnerId && prevWinner !== winnerId) cur.wins += 1;
      if (prevWinner === p.userId && winnerId !== p.userId) cur.wins = Math.max(0, cur.wins - 1);
      profiles[p.userId] = cur;
    }
    this.write('players.json', profiles);
    this.log.info(`💾 Đã lưu phiên ${rec.id} (${rec.ranking.length} người chơi, ${rec.rounds} lượt)`);
  }

  listSessions(limit = 30): SessionSummary[] {
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    return files
      .sort()
      .reverse()
      .slice(0, limit)
      .map((f) => {
        const r = this.read<SessionRecord | null>(`sessions/${f}`, null);
        return r
          ? { id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, rounds: r.rounds, players: r.ranking.length, winner: r.winners[0]?.score ? `${r.winners[0].nickname} (${r.winners[0].score} điểm)` : null }
          : null;
      })
      .filter((x): x is SessionSummary => !!x);
  }
}

const safeId = (id: string) => id.replace(/[^\w-]/g, '_').slice(0, 60);
// userId có thể là "__proto__": không cho làm khoá
const safeKey = (k: string) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
