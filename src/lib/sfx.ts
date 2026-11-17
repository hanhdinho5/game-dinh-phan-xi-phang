/**
 * Hiệu ứng âm thanh tự tạo bằng WebAudio (không cần file, không lo bản quyền). Lấy từ Lớp Học Chữ.
 * Chỉ phát ở trang overlay. Muốn tiếng đẹp hơn: bỏ file mp3 cùng tên vào public/assets/sfx/ (vd ting.mp3).
 *   go      bắt đầu lượt mới
 *   ting    có người nối đúng
 *   tick    tích tắc 3 giây cuối
 *   bell    hết giờ
 *   pop     người chơi mới vào ghế
 *   fanfare công bố kết quả lượt / vinh danh
 */
export type SfxName = 'go' | 'ting' | 'tick' | 'bell' | 'pop' | 'fanfare' | 'win';
const NAMES: SfxName[] = ['go', 'ting', 'tick', 'bell', 'pop', 'fanfare', 'win'];

class Sfx {
  enabled = true;
  volume = 0.35;
  private ctx: AudioContext | null = null;
  private files: Partial<Record<SfxName, HTMLAudioElement>> = {};
  private lastAt: Partial<Record<SfxName, number>> = {};
  private loaded = false;

  loadFiles() {
    if (this.loaded) return;
    this.loaded = true;
    for (const n of NAMES) {
      const a = new Audio(`/assets/sfx/${n}.mp3`);
      a.preload = 'auto';
      a.addEventListener('canplaythrough', () => (this.files[n] = a), { once: true });
    }
  }

  play(name: SfxName, minGapMs = 80) {
    if (!this.enabled || this.volume <= 0) return;
    const now = performance.now();
    if (now - (this.lastAt[name] ?? -Infinity) < minGapMs) return;
    this.lastAt[name] = now;
    const file = this.files[name];
    if (file) {
      const a = file.cloneNode() as HTMLAudioElement;
      a.volume = Math.min(1, this.volume * 2);
      void a.play().catch(() => {});
      return;
    }
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      SYNTH[name](this.ctx, this.volume);
    } catch {
      // trình duyệt không cho phát tiếng
    }
  }
}

type Synth = (ctx: AudioContext, vol: number) => void;

function tone(ctx: AudioContext, vol: number, type: OscillatorType, freq: number, start: number, dur: number, gain = 1, slideTo?: number) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SYNTH: Record<SfxName, Synth> = {
  go: (c, v) => {
    tone(c, v, 'triangle', 659, 0, 0.12, 0.7);
    tone(c, v, 'triangle', 988, 0.1, 0.28, 0.7);
  },
  ting: (c, v) => {
    tone(c, v, 'sine', 1319, 0, 0.22, 0.5);
    tone(c, v, 'sine', 1760, 0.06, 0.3, 0.4);
  },
  tick: (c, v) => tone(c, v, 'square', 1000, 0, 0.05, 0.22),
  bell: (c, v) => {
    tone(c, v, 'sine', 880, 0, 0.8, 0.55);
    tone(c, v, 'sine', 1320, 0, 0.5, 0.22);
  },
  pop: (c, v) => tone(c, v, 'sine', 500, 0, 0.14, 0.7, 1200),
  fanfare: (c, v) => [523, 659, 784, 1047].forEach((f, i) => tone(c, v, 'triangle', f, i * 0.11, i === 3 ? 0.5 : 0.14, 0.55)),
  win: (c, v) => {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone(c, v, 'triangle', f, i * 0.14, i === notes.length - 1 ? 1.1 : 0.16, 0.6));
  },
};

export const sfx = new Sfx();
