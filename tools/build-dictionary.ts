/**
 * Dựng từ điển nối từ: words/tu-dien.txt (mỗi dòng 1 từ ghép 2 tiếng, đã chuẩn hoá).
 *
 *   pnpm tu-dien                      # tự tải Viet74K về rồi lọc
 *   pnpm tu-dien -- duong/dan/file.txt # dùng file có sẵn (mỗi dòng 1 từ)
 *
 * Nguồn mặc định: https://github.com/duyet/vietnamese-wordlist (Viet74K, giấy phép GPL-2.0).
 * Lọc: đúng 2 tiếng, không viết hoa (bỏ tên riêng), tiếng phải giống âm tiết Việt, bỏ từ cấm.
 * Từ phổ biến (dùng để hệ thống tự ra từ) nằm riêng ở words/tu-pho-bien.txt, viết tay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalWord, looksLikeVietnameseSyllable } from '../shared/vietnamese';
import { containsBanned } from '../shared/banned-words';

const SOURCE_URL = 'https://raw.githubusercontent.com/duyet/vietnamese-wordlist/master/Viet74K.txt';
const root = path.join(import.meta.dirname, '..');
const outFile = path.join(root, 'words', 'tu-dien.txt');
const commonFile = path.join(root, 'words', 'tu-pho-bien.txt');

async function main() {
  const input = process.argv[2];
  let raw: string;
  if (input) raw = fs.readFileSync(input, 'utf8');
  else {
    console.log(`Đang tải ${SOURCE_URL} ...`);
    const r = await fetch(SOURCE_URL);
    if (!r.ok) throw new Error(`Tải từ điển lỗi ${r.status}`);
    raw = await r.text();
  }

  const words = new Set<string>();
  let skipped = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (/\p{Lu}/u.test(t)) {
      skipped++; // tên riêng: Hà Nội, An Vinh...
      continue;
    }
    const w = canonicalWord(t);
    if (!w || t.split(/\s+/).length !== 2 || /[^\p{L}\p{M}\s]/u.test(t)) continue;
    const [a, b] = w.split(' ');
    if (!looksLikeVietnameseSyllable(a) || !looksLikeVietnameseSyllable(b) || containsBanned(w)) {
      skipped++;
      continue;
    }
    words.add(w);
  }

  // từ phổ biến luôn có trong từ điển
  if (fs.existsSync(commonFile)) {
    for (const line of fs.readFileSync(commonFile, 'utf8').split(/\r?\n/)) {
      const w = line.trim().startsWith('#') ? null : canonicalWord(line);
      if (w) words.add(w);
    }
  }

  const sorted = [...words].sort((x, y) => x.localeCompare(y, 'vi'));
  const header = [
    '# Từ điển nối từ ĐƯỜNG LÊN ĐỈNH PHAN XI PĂNG: mỗi dòng 1 từ ghép 2 tiếng.',
    '# Dựng bằng: pnpm tu-dien. Nguồn: Viet74K (github.com/duyet/vietnamese-wordlist, GPL-2.0) + words/tu-pho-bien.txt.',
    '# Không sửa tay file này; thêm / xoá từ trong trang Admin (lưu ở data/word-overrides.json).',
  ];
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${header.join('\n')}\n${sorted.join('\n')}\n`);
  console.log(`Đã ghi ${sorted.length} từ vào ${path.relative(root, outFile)} (bỏ ${skipped} dòng)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
