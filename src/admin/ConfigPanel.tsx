import { useEffect, useMemo, useRef, useState } from 'react';
import { SEAT_OPTIONS, type GameConfig, type ScoreTier, type SeatCount } from '../../shared/types';
import { formatTiers, parseTiers } from '../../server/game/scoring-service';
import { useAdmin, useCommand } from './context';
import { Badge, Button, Card, Field, Toggle, inputCls } from './ui';

/** Bản nháp trong form: số để dạng chữ cho người dùng gõ thoải mái */
interface Draft {
  seatCount: SeatCount;
  roundSeconds: string;
  revealSeconds: string;
  lateGraceSec: string;
  maxWrongPerRound: string;
  tiers: string;
  startWord: string;
  autoAdvance: boolean;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  autoJoinOnAnswer: boolean;
  roundsPerRace: string;
  raceBreakSeconds: string;
  autoNewRace: boolean;
  voiceEnabled: boolean;
  voiceChatter: boolean;
  voiceGender: 'f' | 'm';
  voiceRate: string;
}
type NumKey = 'roundSeconds' | 'revealSeconds' | 'lateGraceSec' | 'maxWrongPerRound' | 'roundsPerRace' | 'raceBreakSeconds' | 'voiceRate';
type BoolKey = 'autoAdvance' | 'effectsEnabled' | 'soundEnabled' | 'autoJoinOnAnswer' | 'autoNewRace' | 'voiceEnabled' | 'voiceChatter';

const RANGES: Record<NumKey, { min: number; max: number; step?: number }> = {
  roundSeconds: { min: 5, max: 120 },
  revealSeconds: { min: 1, max: 30 },
  lateGraceSec: { min: 0, max: 10, step: 0.5 },
  maxWrongPerRound: { min: 1, max: 20 },
  roundsPerRace: { min: 0, max: 500 },
  raceBreakSeconds: { min: 10, max: 600 },
  voiceRate: { min: 0.7, max: 1.6, step: 0.05 },
};

const toDraft = (c: GameConfig): Draft => ({
  seatCount: c.seatCount,
  roundSeconds: String(c.roundSeconds),
  revealSeconds: String(c.revealSeconds),
  lateGraceSec: String(c.lateGraceMs / 1000),
  maxWrongPerRound: String(c.maxWrongPerRound),
  tiers: formatTiers(c.scoreTiers),
  startWord: c.startWord,
  autoAdvance: c.autoAdvance,
  effectsEnabled: c.effectsEnabled,
  soundEnabled: c.soundEnabled,
  autoJoinOnAnswer: c.autoJoinOnAnswer,
  roundsPerRace: String(c.roundsPerRace),
  raceBreakSeconds: String(c.raceBreakSeconds),
  autoNewRace: c.autoNewRace,
  voiceEnabled: c.voiceEnabled,
  voiceChatter: c.voiceChatter,
  voiceGender: c.voiceGender,
  voiceRate: String(c.voiceRate),
});

function numError(key: NumKey, raw: string): string | undefined {
  const { min, max } = RANGES[key];
  const n = Number(raw.replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(n)) return 'Phải là số';
  if (n < min || n > max) return `Phải từ ${min} tới ${max}`;
  return undefined;
}
const num = (raw: string) => Number(raw.replace(',', '.'));

function tierPreview(tiers: ScoreTier[]): string {
  return tiers.map((t) => `Hạng ${t.from === t.to ? t.from : `${t.from}–${t.to}`}: ${t.points}`).join(' · ');
}

export function ConfigPanel({ config }: { config: GameConfig }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [draft, setDraft] = useState<Draft>(() => toDraft(config));
  // sau khi lưu: lấy lại cấu hình server gửi về (server có thể làm tròn số)
  const resyncNext = useRef(false);
  useEffect(() => {
    if (resyncNext.current) {
      resyncNext.current = false;
      setDraft(toDraft(config));
    }
  }, [config]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const tierResult = useMemo((): { tiers: ScoreTier[]; error?: undefined } | { tiers?: undefined; error: string } => {
    try {
      return { tiers: parseTiers(draft.tiers) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft.tiers]);

  const errors: Partial<Record<NumKey, string>> = {};
  for (const k of Object.keys(RANGES) as NumKey[]) {
    const e = numError(k, draft[k]);
    if (e) errors[k] = e;
  }
  const valid = Object.keys(errors).length === 0 && !tierResult.error;
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(config));

  const save = async () => {
    if (!tierResult.tiers) return;
    const patch: GameConfig = {
      seatCount: draft.seatCount,
      roundSeconds: Math.round(num(draft.roundSeconds)),
      revealSeconds: Math.round(num(draft.revealSeconds)),
      lateGraceMs: Math.round(num(draft.lateGraceSec) * 1000),
      maxWrongPerRound: Math.round(num(draft.maxWrongPerRound)),
      scoreTiers: tierResult.tiers,
      startWord: draft.startWord.trim(),
      autoAdvance: draft.autoAdvance,
      effectsEnabled: draft.effectsEnabled,
      soundEnabled: draft.soundEnabled,
      autoJoinOnAnswer: draft.autoJoinOnAnswer,
      roundsPerRace: Math.round(num(draft.roundsPerRace)),
      raceBreakSeconds: Math.round(num(draft.raceBreakSeconds)),
      autoNewRace: draft.autoNewRace,
      voiceEnabled: draft.voiceEnabled,
      voiceChatter: draft.voiceChatter,
      voiceGender: draft.voiceGender,
      voiceRate: num(draft.voiceRate),
    };
    // chỉ gửi những ô đã sửa: không ghi đè cấu hình mới hơn (vd đổi ở tab khác, hoặc server vừa khôi phục)
    const changed: Partial<GameConfig> = {};
    for (const k of Object.keys(patch) as (keyof GameConfig)[]) {
      if (JSON.stringify(patch[k]) !== JSON.stringify(config[k])) (changed as Record<string, unknown>)[k] = patch[k];
    }
    if (Object.keys(changed).length === 0) return toast('Không có gì thay đổi', 'info');
    const r = await cmd('admin:update_config', changed);
    if (r.ok) {
      resyncNext.current = true;
      toast('Đã lưu cấu hình');
    }
  };
  const reload = () => {
    setDraft(toDraft(config));
    toast('Đã tải lại cấu hình đang dùng', 'info');
  };

  const numInput = (k: NumKey) => (
    <input
      type="number"
      inputMode="decimal"
      min={RANGES[k].min}
      max={RANGES[k].max}
      step={RANGES[k].step ?? 1}
      className={`${inputCls} ${errors[k] ? 'border-rose-500' : ''}`}
      value={draft[k]}
      onChange={(e) => set(k, e.target.value)}
    />
  );
  const toggle = (k: BoolKey, label: string, hint?: string) => (
    <Toggle checked={draft[k]} onChange={(v) => set(k, v)} label={label} hint={hint} />
  );

  return (
    <Card
      title="Cấu hình game"
      right={
        <div className="flex items-center gap-2">
          {dirty && <Badge tone="amber">Có thay đổi chưa lưu</Badge>}
          <Button size="sm" onClick={reload}>
            Tải lại
          </Button>
          <Button size="sm" tone="emerald" disabled={!valid} onClick={save}>
            Lưu cấu hình
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Số ghế trên màn hình" hint="Hết ghế thì vào hàng chờ.">
          <select className={inputCls} value={draft.seatCount} onChange={(e) => set('seatCount', Number(e.target.value) as SeatCount)}>
            {SEAT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} ghế
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thời gian mỗi chặng (giây)" error={errors.roundSeconds} hint="Nên 10–15 giây.">
          {numInput('roundSeconds')}
        </Field>
        <Field label="Thời gian hiện kết quả (giây)" error={errors.revealSeconds} hint="1–30 giây.">
          {numInput('revealSeconds')}
        </Field>
        <Field
          label="Bù độ trễ hình TikTok (giây)"
          error={errors.lateGraceSec}
          hint="Nhận thêm sau khi hết giờ. Nên 3 giây."
        >
          {numInput('lateGraceSec')}
        </Field>
        <Field label="Số lần sai tối đa mỗi chặng" error={errors.maxWrongPerRound} hint="Chống đoán bừa.">
          {numInput('maxWrongPerRound')}
        </Field>
        <Field label="Từ khởi đầu" hint="Để trống = tự chọn.">
          <input className={inputCls} placeholder="tự chọn" value={draft.startWord} onChange={(e) => set('startWord', e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Bảng điểm theo thứ hạng"
            error={tierResult.error}
            hint={
              <>
                Viết kiểu <code className="text-sky-300">9,7,5,3,2x6,1x10</code> (2x6 = 6 hạng tiếp theo mỗi người 2 điểm).
                {tierResult.tiers && <span className="mt-1 block text-emerald-300">{tierPreview(tierResult.tiers)}</span>}
              </>
            }
          >
            <input className={`${inputCls} font-mono ${tierResult.error ? 'border-rose-500' : ''}`} value={draft.tiers} onChange={(e) => set('tiers', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-1 border-t border-slate-800 pt-4 md:grid-cols-2">
        {toggle('autoAdvance', 'Tự chuyển chặng')}
        {toggle('effectsEnabled', 'Hiệu ứng')}
        {toggle('soundEnabled', 'Âm thanh trên overlay')}
        {toggle('autoJoinOnAnswer', 'Nối đúng là tự vào game')}
      </div>

      <h3 className="mt-5 border-t border-slate-800 pt-4 font-semibold text-amber-300">🏁 Cuộc đua &amp; vinh danh</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <Field label="Số chặng mỗi cuộc đua" error={errors.roundsPerRace} hint="0 = tự bấm Kết thúc.">
          {numInput('roundsPerRace')}
        </Field>
        <Field label="Thời gian vinh danh (giây)" error={errors.raceBreakSeconds} hint="Nên 25–40 giây.">
          {numInput('raceBreakSeconds')}
        </Field>
      </div>
      <div className="mt-2 grid gap-1 md:grid-cols-2">
        {toggle('autoNewRace', 'Tự mở cuộc đua mới sau vinh danh')}
      </div>

      <h3 className="mt-5 border-t border-slate-800 pt-4 font-semibold text-amber-300">🎙️ Giọng MC</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <Field label="Giọng" hint="Cần mạng internet.">
          <select className={inputCls} value={draft.voiceGender} onChange={(e) => set('voiceGender', e.target.value as 'f' | 'm')}>
            <option value="f">Nữ (Hoài My)</option>
            <option value="m">Nam (Nam Minh)</option>
          </select>
        </Field>
        <Field label="Tốc độ đọc" error={errors.voiceRate} hint="Nên 1.1–1.25.">
          {numInput('voiceRate')}
        </Field>
      </div>
      <div className="mt-2 grid gap-1 md:grid-cols-2">
        {toggle('voiceEnabled', 'Bật giọng MC')}
        {toggle('voiceChatter', 'MC chào, cảm ơn quà, nhắc luật')}
      </div>
    </Card>
  );
}
