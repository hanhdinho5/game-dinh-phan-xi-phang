/**
 * ĐƯỜNG LÊN ĐỈNH PHAN XI PĂNG: server.
 *
 *   TikTok LIVE ──> TikTokConnector (chuẩn hoá) ──> LivePipeline (chống trùng) ──> PhanXiPangEngine (luật chơi)
 *                                                                                      │
 *   Overlay (LIVE Studio) <── Socket.IO game:state ────────────────────────────────────┤
 *   Admin                 <── Socket.IO admin:state, ──> admin:* (kiểm tra quyền) ─────┘
 *
 * Chỉ nghe trên 127.0.0.1 (máy chủ kênh). Link cho LIVE Studio: http://lvh.me:<PORT>/?view=overlay
 */
import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import { Logger } from './logger';
import { JsonStore } from './storage/json-store';
import { WordBank, emptyOverrides } from './game/word-bank';
import { PhanXiPangEngine } from './game/phan-xi-pang-engine';
import { TikTokConnector } from './live/tiktok-connector';
import { LivePipeline } from './live/pipeline';
import { MockLive } from './live/mock-live';
import { setupSocket } from './socket';
import { McDirector } from './game/mc-director';
import { setupTts } from './tts';

dotenv.config({ quiet: true });

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3007; // Lớp Học Chữ dùng 3006
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() ?? '';
// Giả lập: mặc định bật (chỉ khi CHƯA kết nối TikTok thật). DISABLE_MOCK=1 để tắt hẳn.
const MOCK_ENABLED = process.env.DISABLE_MOCK !== '1';

const log = new Logger(path.join(DATA_DIR, 'logs'));
const store = new JsonStore(DATA_DIR, log);

// ---------- ngân hàng từ ----------
const readWords = (file: string) => {
  try {
    return WordBank.parseList(fs.readFileSync(path.join(ROOT, 'words', file), 'utf8'));
  } catch (err) {
    log.error(`Không đọc được words/${file}. Chạy "pnpm tu-dien" để dựng từ điển`, err);
    return [];
  }
};
const bank = new WordBank(readWords('tu-dien.txt'), readWords('tu-pho-bien.txt'), store.loadOverrides() ?? emptyOverrides());
log.info(`📚 Ngân hàng từ: ${bank.size} từ ghép (${bank.allCommon().length} từ phổ biến)`);

// ---------- game ----------
const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  // chặn trang web lạ (DNS rebinding) mở socket tới máy mình
  allowRequest: (req, cb) => cb(null, requestOk(req.headers.host, req.headers.origin)),
  pingInterval: 10_000,
});

let scheduleState = () => {};
let director: McDirector | null = null;
const saveSnapshot = () => store.writeSoon('current-session.json', () => engine.snapshot(), 1000);

const engine = new PhanXiPangEngine({
  bank,
  log,
  emit: (event, ...args) => {
    // đáp án sai (kèm chữ người chơi gõ) chỉ admin thấy
    const target = event === 'answer:rejected' ? io.to('admin') : io;
    (target.emit as (e: string, ...a: unknown[]) => boolean)(event, ...args);
    try {
      director?.onEvent(event, args as never, Date.now());
    } catch (err) {
      log.error('Lỗi MC', err);
    }
  },
  onChanged: () => {
    scheduleState();
    saveSnapshot();
  },
  onRoundEnded: (sessionId, r) => store.appendRound(sessionId, r),
  onSessionEnded: (rec) => store.saveSession(rec),
});

const savedConfig = store.loadConfig();
if (savedConfig) {
  try {
    engine.updateConfig(savedConfig);
  } catch (err) {
    log.warn(`Cấu hình đã lưu không hợp lệ, dùng mặc định: ${(err as Error).message}`);
  }
}
const snap = store.loadSnapshot();
if (snap) {
  try {
    engine.restore(snap, Date.now());
    log.info(`♻ Khôi phục phiên ${engine.sessionId}: ${engine.players.count} người chơi, ${engine.roundNo} lượt${engine.phase === 'paused' ? ' (đang TẠM DỪNG, bấm Tiếp tục)' : ''}`);
  } catch (err) {
    log.warn(`Không khôi phục được phiên cũ: ${(err as Error).message}`);
  }
}

// MC: câu đọc gửi tới mọi trang, chỉ overlay được chọn làm "loa" phát tiếng
director = new McDirector(engine, (line) => {
  log.debug(`🎙 ${line.kind}: ${line.text}`);
  io.emit('voice:say', line);
});

const pipeline = new LivePipeline(engine, log);
const tiktok = new TikTokConnector(
  {
    onComment: (c) => pipeline.comment(c),
    onGift: (g) => pipeline.gift(g),
    onStatus: (st) => {
      // vào được phòng live thật (kể cả lúc tự kết nối lại): người chơi giả không được ở lại ghế / lên bục
      if (st.isConnected) engine.removeMockPlayers();
      scheduleState();
    },
  },
  log,
);
const mock = new MockLive(pipeline, engine, bank);

({ scheduleState } = setupSocket(io, {
  engine,
  bank,
  tiktok,
  mock,
  director,
  store,
  log,
  adminToken: ADMIN_TOKEN,
  // đang giữ kết nối TikTok (kể cả lúc rớt mạng chờ nối lại) thì không cho giả lập
  mockAllowed: () => MOCK_ENABLED && !tiktok.status.target && !tiktok.isConnected,
  onConfigChanged: () => store.saveConfig(engine.config),
  onWordsChanged: () => store.saveOverrides(bank.overrides()),
}));

// nhịp game: 10 lần/giây
const ticker = setInterval(() => {
  try {
    const now = Date.now();
    engine.tick(now);
    director?.tick(now);
  } catch (err) {
    log.error('Lỗi nhịp game', err);
  }
}, 100);

// ---------- HTTP ----------
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'lvh.me']);
const hostOk = (h?: string) => !!h && LOCAL_HOSTS.has(h.replace(/:\d+$/, '').toLowerCase());
function requestOk(host?: string, origin?: string) {
  return hostOk(host) && (!origin || hostOk(origin.replace(/^https?:\/\//, '')));
}
app.use((req, res, next) => (requestOk(req.headers.host, req.headers.origin) ? next() : res.status(403).end()));
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, session: engine.sessionId, phase: engine.phase, players: engine.players.count, tiktok: tiktok.status.isConnected }),
);
app.use('/assets', express.static(path.join(ROOT, 'public', 'assets')));
setupTts(app, log);

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: ROOT,
      // LIVE_MODE=1: tắt tự tải lại để sửa code không làm overlay reset giữa live
      server:
        process.env.LIVE_MODE === '1'
          ? { middlewareMode: true, hmr: false, ws: false }
          : { middlewareMode: true, ws: { port: Number(process.env.HMR_PORT) || 24684 } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(ROOT, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
  }

  server.listen(PORT, '127.0.0.1', () => {
    log.info(`⛰  Server chạy ở http://localhost:${PORT}  (trang Admin)`);
    log.info(`   Link cho TikTok LIVE Studio: http://lvh.me:${PORT}/?view=overlay  (1080 x 1920)`);
    if (ADMIN_TOKEN) log.info(`   Trang admin cần mã: http://localhost:${PORT}/?token=<ADMIN_TOKEN>`);
    const user = store.loadSettings().tiktokUser;
    if (user && !process.env.DATA_DIR) tiktok.resume(user);
  });
}

// tắt server: ghi ngay ảnh chụp phiên
const shutdown = () => {
  clearInterval(ticker);
  mock.stopAll();
  store.flush({ 'current-session.json': () => engine.snapshot() });
  log.info('Đã lưu phiên, tắt server');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => log.error('Lỗi không bắt được', err));
process.on('unhandledRejection', (err) => log.error('Promise lỗi không bắt được', err));

void start();
