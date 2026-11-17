import type { VoiceLine } from '../../shared/types';

/**
 * Hàng đợi giọng MC, chỉ chạy trên overlay được chọn làm "loa". Lấy từ Lớp Học Chữ (đã chạy thật trên live).
 *  - Lời chính (main) đọc lần lượt; tới là bỏ hết câu nói thêm đang chờ, cắt luôn câu nói thêm đang đọc.
 *  - Nói thêm (chatter) chỉ đọc khi không còn lời chính nào; tối đa 3 câu chờ.
 *  - Câu quá hạn (giờ server) chưa tới lượt thì bỏ: không đọc chuyện đã cũ.
 *  - "|" tách đoạn, "^" đầu đoạn = hô to hơn.
 */
class Voice {
  enabled = false;
  volume = 1;
  /** giờ server - giờ máy này */
  serverOffset = () => 0;
  /** báo đang nói câu nào (null = im) để overlay hiện phụ đề / làm nhân vật nhún */
  onSpeaking?: (line: VoiceLine | null) => void;

  private main: VoiceLine[] = [];
  private chatter: VoiceLine[] = [];
  private playing: VoiceLine | null = null;
  private audio: HTMLAudioElement | null = null;
  private cancelled = false;

  push(line: VoiceLine) {
    if (!this.enabled) return;
    if (line.kind === 'main') {
      this.chatter = [];
      if (line.flush) {
        this.main = [];
        if (this.playing) this.cut();
      } else if (this.playing?.kind === 'chatter') this.cut();
      if (line.front) this.main.unshift(line);
      else this.main.push(line);
      // tạo giọng sẵn trong lúc chờ câu trước đọc xong
      for (const url of this.urls(line)) fetch(url).catch(() => {});
    } else {
      this.chatter.push(line);
      if (this.chatter.length > 3) this.chatter.shift();
    }
    void this.next();
  }

  /** Bỏ 1 câu: đang chờ thì xoá, đang đọc thì cắt */
  cancel(id: number) {
    this.main = this.main.filter((l) => l.id !== id);
    this.chatter = this.chatter.filter((l) => l.id !== id);
    if (this.playing?.id === id) this.cut();
  }

  stop() {
    this.main = [];
    this.chatter = [];
    if (this.playing) this.cut();
  }

  private cut() {
    this.cancelled = true;
    this.audio?.pause();
  }

  private parts(text: string) {
    return text
      .split('|')
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => ({ hype: raw.startsWith('^'), text: raw.replace(/^\^+/, '').trim() }))
      .filter((p) => p.text);
  }

  private urls(line: VoiceLine) {
    return this.parts(line.text).map(
      (p) => `/api/tts?v=${line.voice}&rate=${line.rate}${p.hype ? '&hype=1' : ''}&text=${encodeURIComponent(p.text)}`,
    );
  }

  private take(): VoiceLine | undefined {
    const now = Date.now() + this.serverOffset();
    let l: VoiceLine | undefined;
    while ((l = this.main.shift())) if (l.expiresAt > now) return l;
    while ((l = this.chatter.shift())) if (l.expiresAt > now) return l;
    return undefined;
  }

  private async next() {
    if (this.playing || !this.enabled) return;
    const line = this.take();
    if (!line) return;
    this.playing = line;
    this.cancelled = false;
    this.onSpeaking?.(line);
    try {
      for (const url of this.urls(line)) {
        if (this.cancelled) break;
        await this.playOne(url);
      }
    } finally {
      this.audio = null;
      this.playing = null;
      this.onSpeaking?.(null);
      void this.next();
    }
  }

  private playOne(url: string) {
    const audio = new Audio(url);
    audio.volume = this.volume;
    this.audio = audio;
    return new Promise<void>((resolve) => {
      // tự gỡ kẹt: 1 câu treo (không tải xong, không báo lỗi) sẽ làm MC im cả buổi live
      let guard = setTimeout(finish, 8000);
      function finish() {
        clearTimeout(guard);
        if (!audio.ended) audio.pause();
        resolve();
      }
      audio.onplaying = () => {
        clearTimeout(guard);
        const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 + 3000 : 30_000;
        guard = setTimeout(finish, ms);
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.onpause = () => this.cancelled && finish();
      // trình duyệt chặn tự phát tiếng: thử lại vài lần thay vì bỏ câu
      const tryPlay = (left: number) => audio.play().catch(() => (left > 0 && !this.cancelled ? setTimeout(() => tryPlay(left - 1), 1200) : finish()));
      void tryPlay(3);
    });
  }
}

export const voice = new Voice();
