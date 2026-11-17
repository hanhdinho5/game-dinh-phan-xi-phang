import type { PlayerView, RoundResult, ServerToClientEvents, VoiceLine } from '../../shared/types';
import { speakableName } from '../../shared/names';
import { LineBag, MC, joinNames } from './mc-lines';
import type { PhanXiPangEngine } from './phan-xi-pang-engine';

type EventArgs<K extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[K]>;

/** Cảm ơn quà: mỗi người 1 lần mỗi 30 giây (combo x10 chỉ cảm ơn 1 lần); quà to (>= 99 xu) luôn cảm ơn */
const GIFT_COOLDOWN_MS = 30_000;
const BIG_GIFT = 99;
const GREET_EVERY_MS = 7_000;
const TIP_EVERY_MS = 100_000;
const IDLE_EVERY_MS = 60_000;
const MILESTONES = [30, 50, 100, 150, 200, 300, 500];

/**
 * "Đạo diễn" của MC: nghe sự kiện game, quyết định MC nói câu gì, lúc nào. Chạy ở server (1 nơi duy nhất),
 * overlay chỉ việc phát. Đồng hồ chặng KHÔNG chờ MC đọc (server giữ nhịp), nên câu phải ngắn.
 *
 *  - Lời chính (main): đọc đề, kết quả, vinh danh. Xếp hàng, có hạn: đọc đề quá trễ (sắp hết giờ) thì bỏ.
 *  - Nói thêm (chatter): chào người mới, cảm ơn quà, khen dẫn đầu, mẹo. Chỉ nói lúc rảnh
 *    (đang nhận đáp án và còn > 5 giây, hoặc lúc chờ xuất phát), có lời chính tới là bỏ.
 */
export class McDirector {
  private seq = 0;
  private bag: LineBag;
  private pendingGreet: { id: string; name: string }[] = [];
  private greeted = new Set<string>();
  private pendingGifts: { name: string; gift: string; at: number }[] = [];
  private lastGiftAt = new Map<string, number>();
  private lastGreetAt = 0;
  private lastTipAt = 0;
  private lastIdleAt = 0;
  private hurriedRound = 0;
  private raceStartPending = 0;
  private leaderId = '';
  private streak = { userId: '', count: 0 };
  private milestoneDone = new Map<string, number>();
  private prepareAnnounced = false;
  private prepareLineId = 0;

  constructor(
    private readonly engine: PhanXiPangEngine,
    private readonly out: (line: VoiceLine) => void,
    rng: () => number = Math.random,
  ) {
    this.bag = new LineBag(rng);
  }

  private get cfg() {
    return this.engine.config;
  }

  private say(text: string, kind: VoiceLine['kind'], expiresAt: number, extra: Partial<VoiceLine> = {}) {
    if (!this.cfg.voiceEnabled && !extra.front) return;
    if (kind === 'chatter' && !this.cfg.voiceChatter) return;
    this.out({ id: ++this.seq, text, kind, expiresAt, voice: this.cfg.voiceGender, rate: this.cfg.voiceRate, ...extra });
  }

  /** Cuộc đua mới bị huỷ: trả về mã câu "Tất cả chuẩn bị" (nếu đã gửi) để overlay bỏ câu đó */
  cancelPrepare(): number {
    const id = this.prepareLineId;
    this.prepareLineId = 0;
    this.prepareAnnounced = true;
    return id;
  }

  /** Admin gõ cho MC đọc ngay */
  speak(text: string, now: number) {
    const t = text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    if (!t) throw new Error('Chưa nhập câu cần đọc');
    this.say(t, 'main', now + 60_000, { front: true });
  }

  /** Lúc rảnh để nói thêm: đang chờ xuất phát, hoặc đang nhận đáp án mà còn > 5 giây */
  private chatterWindow(now: number) {
    const e = this.engine;
    if (e.phase === 'idle') return true;
    return e.phase === 'running' && e.roundPhase === 'answering' && !!e.round && e.round.endsAt - now > 5_000;
  }

  // =========================================================
  //  Sự kiện game (gọi ngay sau khi engine phát sự kiện)
  // =========================================================
  onEvent<K extends keyof ServerToClientEvents>(name: K, args: EventArgs<K>, now: number) {
    switch (name) {
      case 'game:started':
        this.raceStartPending = this.engine.raceNo;
        this.prepareAnnounced = false;
        this.prepareLineId = 0;
        this.leaderId = '';
        this.streak = { userId: '', count: 0 };
        this.milestoneDone.clear();
        break;
      case 'game:round_started':
        this.onRoundStarted(...(args as EventArgs<'game:round_started'>), now);
        break;
      case 'game:round_ended':
        this.onRoundEnded(...(args as EventArgs<'game:round_ended'>), now);
        break;
      case 'game:paused':
        this.say(this.bag.pick('paused', MC.paused), 'main', now + 8_000);
        break;
      case 'game:resumed':
        this.say(this.bag.pick('resumed', MC.resumed), 'main', now + 6_000);
        break;
      case 'game:ended':
        this.onEnded((args as EventArgs<'game:ended'>)[0].winners, now);
        break;
      case 'player:joined': {
        const p = (args as EventArgs<'player:joined'>)[0];
        if (!this.greeted.has(p.userId)) {
          this.greeted.add(p.userId);
          if (this.greeted.size > 20_000) this.greeted.clear();
          this.pendingGreet.push({ id: p.userId, name: speakableName(p.nickname) });
          if (this.pendingGreet.length > 30) this.pendingGreet.shift();
        }
        break;
      }
      case 'gift:received': {
        const g = (args as EventArgs<'gift:received'>)[0];
        const key = g.userId || g.nickname;
        const big = (g.diamondCount ?? 0) * (g.repeatCount || 1) >= BIG_GIFT;
        if (!big && now - (this.lastGiftAt.get(key) ?? -Infinity) < GIFT_COOLDOWN_MS) break;
        this.lastGiftAt.set(key, now);
        if (this.lastGiftAt.size > 5000) this.lastGiftAt.clear();
        this.pendingGifts.push({ name: speakableName(g.nickname), gift: g.giftName, at: now });
        if (this.pendingGifts.length > 4) this.pendingGifts.shift();
        break;
      }
      default:
        break;
    }
  }

  private onRoundStarted(d: EventArgs<'game:round_started'>[0], now: number) {
    const e = this.engine;
    const word = d.word;
    const parts: string[] = [];
    if (this.raceStartPending) {
      parts.push(this.bag.pick('raceStart', MC.raceStart)(String(this.raceStartPending)));
      this.raceStartPending = 0;
    }
    // từ không phải do kết quả chặng trước đưa ra (đã đọc ở phần kết quả): đổi đường / admin đổi từ
    const last = e.chain.at(-1);
    const announced = e.lastResult?.nextWord === word && e.lastResult.no === d.roundNo - 1;
    if (!announced && last?.word === word) {
      if (last.source === 'jump') parts.push(this.bag.pick('deadEndJump', MC.deadEndJump));
      if (last.source === 'admin') parts.push(this.bag.pick('adminChanged', MC.adminChanged));
    }
    const ask = d.roundNo === 1 && parts.length > 0 ? this.bag.pick('askFirst', MC.askFirst)(word, d.linkSyllable) : this.bag.pick('ask', MC.ask)(String(d.roundNo), word, d.linkSyllable);
    parts.push(ask);
    // đọc đề trễ quá (còn < 3 giây) thì thôi
    this.say(parts.join(' | '), 'main', d.endsAt - 3_000);
  }

  private onRoundEnded(r: RoundResult, now: number) {
    const reveal = this.cfg.revealSeconds * 1000;
    const parts: string[] = [];
    const w = r.winners[0];
    if (w) {
      parts.push(this.bag.pick('winner', MC.winner)(speakableName(w.nickname), String(w.points)));
      if (r.winners.length > 1) parts.push(this.bag.pick('many', MC.manyCorrect)(String(r.winners.length)));
    }
    if (r.nextSource === 'end') {
      if (!w) parts.push(MC.nobodyFinal[0]);
    } else if (r.nextSource === 'auto') parts.push(w ? this.bag.pick('next', MC.nextWord)(r.nextWord) : this.bag.pick('nobody', MC.nobody)(r.nextWord));
    else if (r.nextSource === 'jump') parts.push(this.bag.pick('jump', MC.jump)(r.nextWord));
    this.say(parts.join(' | '), 'main', now + reveal + 3_000);

    // 1 câu nói thêm: đổi người dẫn đầu > chuỗi về nhất > cán mốc điểm
    const extra = this.highlight(r);
    if (extra) this.say(extra, 'chatter', now + reveal);
  }

  private highlight(r: RoundResult): string | null {
    const ranking = this.engine.players.ranking();
    const leader = ranking[0];
    let line: string | null = null;
    // chuỗi về nhất
    const first = r.winners[0]?.userId ?? '';
    this.streak = first && first === this.streak.userId ? { userId: first, count: this.streak.count + 1 } : { userId: first, count: first ? 1 : 0 };
    if (leader && leader.score > 0 && leader.userId !== this.leaderId) {
      const hadLeader = this.leaderId !== '';
      this.leaderId = leader.userId;
      if (hadLeader) line = this.bag.pick('leader', MC.newLeader)(speakableName(leader.nickname));
    }
    if (!line && this.streak.count >= 3 && this.streak.count % 2 === 1) {
      const p = this.engine.players.get(first);
      if (p) line = this.bag.pick('streak', MC.streak)(speakableName(p.nickname), String(this.streak.count));
    }
    if (!line) {
      for (const w of r.winners.slice(0, 10)) {
        const p = this.engine.players.get(w.userId);
        if (!p) continue;
        const m = [...MILESTONES].reverse().find((x) => p.score >= x);
        if (m && (this.milestoneDone.get(p.userId) ?? 0) < m) {
          this.milestoneDone.set(p.userId, m);
          line = this.bag.pick('milestone', MC.milestone)(speakableName(p.nickname), String(m));
          break;
        }
      }
    }
    return line;
  }

  /** Mẹo về điểm lấy đúng bảng điểm đang cấu hình */
  private pointsTip() {
    const t = this.cfg.scoreTiers;
    const names = ['Nhất', 'nhì', 'ba'];
    const parts = [1, 2, 3].map((rank, i) => {
      const tier = t.find((x) => rank >= x.from && rank <= x.to);
      return tier && tier.points > 0 ? `${names[i]} cộng ${tier.points}` : '';
    });
    const text = parts.filter(Boolean).join(', ');
    return text ? `${text} điểm.` : 'Nối càng nhanh, điểm càng cao.';
  }

  private onEnded(winners: PlayerView[], now: number) {
    const scored = winners.filter((w) => w.score > 0);
    const parts: string[] = [];
    if (scored.length) {
      parts.push(this.bag.pick('open', MC.ceremonyOpen));
      // công bố ngược: hạng tư -> ba -> nhì -> vô địch (khớp với hiệu ứng trên overlay)
      if (scored[3]) parts.push(MC.place4[0](speakableName(scored[3].nickname)));
      if (scored[2]) parts.push(MC.place3[0](speakableName(scored[2].nickname)));
      if (scored[1]) parts.push(MC.place2[0](speakableName(scored[1].nickname)));
      parts.push(this.bag.pick('champion', MC.champion)(speakableName(scored[0].nickname), String(scored[0].score)));
    } else parts.push(MC.noChampion[0]);
    this.say(parts.join(' | '), 'main', now + 60_000, { flush: true });
    this.pendingGreet = [];
    this.pendingGifts = [];
    this.prepareAnnounced = false;
    if (!this.engine.nextRaceAt) this.say(MC.thanks[0], 'main', now + 60_000);
  }

  // =========================================================
  //  Nhịp: gom tên chào, cảm ơn quà, nhắc giờ, mẹo, báo cuộc đua mới
  // =========================================================
  tick(now: number) {
    const e = this.engine;
    if (!this.cfg.voiceEnabled) return;
    if (!this.lastIdleAt) this.lastIdleAt = now; // vừa bật server: chưa nhắc ngay

    // sắp tới cuộc đua mới: "Tất cả chuẩn bị!"
    if (e.phase === 'ended' && e.nextRaceAt && this.cfg.autoNewRace && !this.prepareAnnounced && e.nextRaceAt - now <= 11_000) {
      this.prepareAnnounced = true;
      const s = Math.max(3, Math.round((e.nextRaceAt - now) / 1000));
      this.say(this.bag.pick('prepareAuto', MC.prepareAuto)(String(s)), 'main', e.nextRaceAt);
      this.prepareLineId = this.seq;
    }

    // nhắc sắp hết giờ (thỉnh thoảng, chỉ khi MC rảnh)
    const r = e.round;
    if (e.phase === 'running' && e.roundPhase === 'answering' && r && this.hurriedRound !== r.no) {
      const left = r.endsAt - now;
      if (left <= 4_500 && left > 3_000) {
        this.hurriedRound = r.no;
        if (Math.random() < 0.35) this.say(this.bag.pick('hurry', MC.hurry), 'chatter', now + 1_500);
      }
    }

    if (!this.chatterWindow(now)) return;
    // quà trước, rồi chào người mới, rồi mẹo
    this.pendingGifts = this.pendingGifts.filter((g) => now - g.at < 40_000);
    const g = this.pendingGifts.shift();
    if (g) {
      this.say(this.bag.pick('gift', MC.gift)(g.name, g.gift), 'chatter', now + 8_000);
      return;
    }
    if (this.pendingGreet.length && now - this.lastGreetAt >= GREET_EVERY_MS) {
      this.lastGreetAt = now;
      const names = this.pendingGreet.splice(0).map((p) => p.name);
      this.say(this.bag.pick('greet', MC.greet)(joinNames(names)), 'chatter', now + 6_000);
      return;
    }
    if (e.phase === 'running' && now - this.lastTipAt >= TIP_EVERY_MS && r && r.endsAt - now > 7_000 && r.no > 2) {
      this.lastTipAt = now;
      this.say(this.bag.pick('tips', [...MC.tips, this.pointsTip()]), 'chatter', now + 4_000);
      return;
    }
    if (e.phase === 'idle' && now - this.lastIdleAt >= IDLE_EVERY_MS) {
      this.lastIdleAt = now;
      this.say(this.bag.pick('idle', MC.idle), 'chatter', now + 10_000);
    }
  }
}
