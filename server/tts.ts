/**
 * Giọng đọc tiếng Việt cho MC: GET /api/tts?text=...&v=f|m&rate=1.15&hype=1
 * Edge TTS (msedge-tts, giọng neural, miễn phí, cần mạng); lỗi thì chuyển Google TTS. Lấy từ Lớp Học Chữ.
 * Chỉ nhận đúng 2 giọng định sẵn, không cho truyền tên giọng tuỳ ý.
 */
import type { Express } from 'express';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { Logger } from './logger';

const VOICES = {
  f: process.env.TTS_VOICE_F || 'vi-VN-HoaiMyNeural',
  m: process.env.TTS_VOICE_M || 'vi-VN-NamMinhNeural',
};
const PITCH = process.env.TTS_PITCH || '+0%';

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function splitText(text: string, max = 190): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = Math.max(win.lastIndexOf('. '), win.lastIndexOf('! '), win.lastIndexOf('? '));
    if (cut < max / 2) cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '));
    if (cut < max / 2) cut = win.lastIndexOf(' ');
    if (cut <= 0) cut = max - 1;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// hype = câu hô ("Xuất phát!"): chỉ to hơn, giữ cao độ (đổi cao độ nghe như người khác nói)
async function edgeTts(text: string, voice: string, rate: number, hype: boolean): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), {
      rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`,
      pitch: PITCH,
      volume: hype ? '+40%' : '+0%',
    });
    const chunks: Buffer[] = [];
    const read = (async () => {
      for await (const c of audioStream) chunks.push(c as Buffer);
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('Edge TTS quá 15 giây')), 15_000)));
    try {
      await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (chunks.length === 0) throw new Error('Edge TTS không trả âm thanh');
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
}

async function googleTts(text: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const chunk of splitText(text)) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });
    if (!r.ok) throw new Error(`Google TTS lỗi ${r.status}`);
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(parts);
}

export function setupTts(app: Express, log: Logger) {
  const cache = new Map<string, Buffer>();
  // cùng 1 câu được xin 2 lần cùng lúc (overlay tải trước + phát): chỉ tạo giọng 1 lần
  const inflight = new Map<string, Promise<Buffer>>();

  app.get('/api/tts', async (req, res) => {
    const text = String(req.query.text ?? '').trim().slice(0, 600);
    if (!text) return res.status(400).send('Thiếu text');
    const rate = Math.min(1.6, Math.max(0.6, Number(req.query.rate) || 1));
    const hype = req.query.hype === '1';
    const voice = req.query.v === 'm' ? VOICES.m : VOICES.f;
    const key = `${voice}|${rate}|${hype}|${text}`;
    try {
      let audio = cache.get(key);
      if (!audio) {
        let p = inflight.get(key);
        if (!p) {
          p = edgeTts(text, voice, rate, hype)
            .catch((err) => {
              log.warn(`Edge TTS lỗi, chuyển Google: ${err instanceof Error ? err.message : err}`);
              return googleTts(text);
            })
            .finally(() => inflight.delete(key));
          inflight.set(key, p);
        }
        audio = await p;
        cache.set(key, audio);
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(audio);
    } catch (err) {
      log.error('TTS lỗi', err);
      res.status(502).json({ error: 'TTS lỗi' });
    }
  });
}
