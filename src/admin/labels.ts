import type { ChainItem, GamePhase, LogEntry, RejectReason, RoundPhase } from '../../shared/types';
import type { BadgeTone } from './ui';

export const PHASE_LABEL: Record<GamePhase, string> = {
  idle: 'Chưa bắt đầu',
  running: 'Đang chơi',
  paused: 'Tạm dừng',
  ended: 'Đã kết thúc',
};
export const PHASE_TONE: Record<GamePhase, BadgeTone> = { idle: 'slate', running: 'emerald', paused: 'amber', ended: 'violet' };

export const ROUND_PHASE_LABEL: Record<RoundPhase, string> = {
  answering: 'Đang nhận đáp án',
  locking: 'Đang chốt',
  reveal: 'Hiện kết quả',
  waiting: 'Chờ chặng tiếp',
};

export const REJECT_LABEL: Record<RejectReason, string> = {
  not_in_bank: 'Không có trong từ điển',
  used: 'Đã dùng',
  banned_word: 'Từ bị cấm',
  same_word: 'Trùng từ hiện tại',
};

export const SOURCE_LABEL: Record<ChainItem['source'], string> = {
  start: 'Khởi đầu',
  auto: 'Nối tiếp',
  jump: 'Đổi từ (bí đường)',
  admin: 'Admin đổi',
  end: 'Chặng cuối',
};
export const SOURCE_TONE: Record<ChainItem['source'], BadgeTone> = {
  start: 'violet',
  auto: 'sky',
  jump: 'amber',
  admin: 'rose',
  end: 'emerald',
};

export const LOG_TONE: Record<LogEntry['level'], string> = {
  info: 'text-slate-300',
  warn: 'text-amber-300',
  error: 'text-rose-400',
};

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtNum = (n: number) => n.toLocaleString('vi-VN');
