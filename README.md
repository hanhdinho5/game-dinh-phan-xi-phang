# ⛰️ Đường Lên Đỉnh Phan Xi Păng

Mini-game nối từ tiếng Việt cho TikTok LIVE. Màn hình hiện một từ ghép (vd **HỌC SINH**), người xem comment **1 tiếng** để nối thành từ mới (**VIÊN** → SINH VIÊN). Ai nối đúng nhanh hơn được nhiều điểm hơn, bảng xếp hạng tự sắp theo điểm (huy hiệu đỏ là điểm của từng người), không ai bị loại. Có MC đọc đề, đọc kết quả và vinh danh Top 4 cuối mỗi cuộc đua.

## Luật chơi

- Comment `join` (hoặc `tham gia`) để nhận ghế. Trả lời đúng mà chưa join thì tự vào game (tắt được trong Cấu hình).
- Mỗi chặng 15 giây. Gõ 1 tiếng (`viên`) hoặc cả từ (`sinh viên`) đều được. Phải gõ có dấu; dấu kiểu cũ/mới (`hóa`/`hoá`) như nhau.
- Mọi đáp án đúng (có trong từ điển, chưa dùng trong cuộc đua) đều được tính. Hết giờ mới chốt, xếp theo giờ TikTok gắn lúc người xem gửi.
- Điểm: Top 1 +9, Top 2 +7, Top 3 +5, Top 4 +3, Top 5–10 +2, Top 11–20 +1 (đổi trong Cấu hình).
- Mỗi người chỉ được tính 1 lần mỗi chặng. Sai không bị trừ điểm, nhưng sai quá 3 lần trong 1 chặng thì chặng đó thôi nhận.
- **Từ mỗi chặng do hệ thống chọn ngẫu nhiên** (không lấy đáp án người chơi, không nối với từ chặng trước): một từ phổ biến chưa dùng, tiếng cuối khác từ trước, và vẫn còn từ để nối. Nhờ vậy bình luận trễ của chặng trước không lẫn sang chặng sau.
- **Cuộc đua**: đặt số chặng mỗi cuộc đua (0 = bấm Kết thúc bằng tay). Kết thúc thì vinh danh Top 4, MC đọc tên hạng 4 → 3 → 2 → vô địch, rồi tự mở cuộc đua mới (giữ người chơi, điểm về 0, dọn người không bình luận 10 phút). Tắt được trong Cấu hình hoặc bấm "Huỷ tự mở".

## Cài và chạy

Cần Node.js 20.19+ (khuyên dùng 22 LTS).

- **Windows**: bấm đúp `BAT-LIVE.bat`.
- **Linux / Mac**: `./chay-live.sh` (hoặc `pnpm install` rồi `pnpm start`).

Cần cài [pnpm](https://pnpm.io) trước (`corepack enable` hoặc `npm i -g pnpm`). Hai file chạy live dùng `pnpm start`: tự build rồi chạy bản đã build (nhẹ, ổn định). Sửa code khi đang phát triển thì dùng `pnpm dev`.

Trang Admin: http://localhost:3007. Overlay cho **TikTok LIVE Studio**: thêm nguồn **Link** `http://lvh.me:3007/?view=overlay`, khổ **1080 × 1920**. LIVE Studio không nhận `localhost`; `lvh.me` trỏ về chính máy mình.

## Giọng MC

- Đọc bằng Edge TTS (giọng neural tiếng Việt, cần mạng; lỗi thì tự chuyển Google). Chọn giọng nữ/nam, tốc độ trong tab Cấu hình.
- MC đọc đề, kết quả chặng, vinh danh; lúc rảnh thì chào người mới, cảm ơn quà, báo người dẫn đầu (tắt được). Tab Điều khiển có ô **Đọc ngay**.
- Chỉ **một** overlay phát tiếng: overlay mở sau cùng. Mở thêm overlay để xem thử thì thêm `&mute=1` vào link, nếu không sẽ giành tiếng của LIVE Studio.
- Đồng hồ chặng không chờ MC đọc xong; câu đọc trễ quá thì tự bỏ.

## Lên live

1. Bấm **Phát trực tiếp** trong LIVE Studio trước.
2. Trang Admin → tab **Điều khiển** → nhập username TikTok → **Kết nối**. Rớt mạng thì server tự kết nối lại.
3. Bấm **Bắt đầu**. Trong lúc chơi có thể Tạm dừng / Tiếp tục / Lượt tiếp / Đổi từ / Kết thúc.
4. **Kết thúc** → vinh danh Top 4 (MC đọc tên), rồi tự mở cuộc đua mới nếu bật. **Phiên mới** → điểm về 0, lịch sử cũ vẫn giữ.

Tắt server giữa chừng (hoặc mất điện) rồi bật lại: điểm và chuỗi từ được khôi phục, game về **Tạm dừng**, bấm **Tiếp tục**.

## Từ điển

- `words/tu-dien.txt`: khoảng 44.000 từ ghép 2 tiếng, lọc từ [Viet74K](https://github.com/duyet/vietnamese-wordlist) (giấy phép **GPL-2.0**) + danh sách từ phổ biến. Dựng lại: `pnpm tu-dien`.
- `words/tu-pho-bien.txt`: từ phổ biến viết tay. Hệ thống chỉ **tự ra** từ trong danh sách này; người chơi thì nối được mọi từ trong từ điển.
- Từ điển không đủ hết từ ghép tiếng Việt (vd thiếu "con mèo", "leo núi", "trà sữa"). Trong lúc live, tab Điều khiển có bảng **Từ bị từ chối**: bấm **✓ Duyệt** là thêm vào từ điển, ai đã gửi từ đó trong chặng đang mở được tính đúng theo thứ tự cũ.
- Tab **Từ**: tìm (gõ không dấu cũng được), thêm, sửa, xoá, đánh dấu không hợp lệ. Thay đổi lưu ở `data/word-overrides.json`, dựng lại từ điển không mất.

## Thử khi chưa live

Tab Điều khiển → **Giả lập**: thêm người join, 20/100/1000 người cùng trả lời (bình luận tới trễ, lệch thứ tự như thật), comment tay, tặng quà. Giả lập **tự khoá khi đang kết nối TikTok thật**, người chơi giả không vào hồ sơ người chơi. Tắt hẳn: đặt `DISABLE_MOCK=1`.

Chạy thử mà không đụng dữ liệu thật: `DATA_DIR=/tmp/pxp-test pnpm dev`.

## Dữ liệu (`data/`)

| File | Nội dung |
|---|---|
| `current-session.json` | phiên đang chơi (để khôi phục) |
| `sessions/<id>.json` | kết quả từng cuộc đua: bảng xếp hạng, chuỗi từ, Top 4 |
| `sessions/<id>.rounds.jsonl` | từng chặng: từ, ai đúng, hạng, điểm |
| `players.json` | hồ sơ người chơi qua mọi phiên (tổng điểm, số lần vô địch...) |
| `config.json`, `word-overrides.json`, `settings.json` | cấu hình, từ đã sửa, tài khoản TikTok |
| `logs/<ngày>.log` | log (đặt `DEBUG_LOG=1` để in cả từng bình luận ra màn hình) |

## Tuỳ chỉnh (`.env`, xem `.env.example`)

`PORT` (mặc định 3007), `ADMIN_TOKEN` (đặt thì trang admin phải mở bằng `?token=...`), `DISABLE_MOCK`, `DATA_DIR`.

## Kiểm tra code

```bash
pnpm test       # nối từ, tính điểm, chống trùng, xếp hạng, tạm dừng, khôi phục...
pnpm lint   # TypeScript
```

## Lưu ý

- Kết nối TikTok dùng [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) (không phải thư viện chính thức của TikTok). Phòng quá đông thì TikTok có thể không gửi đủ 100% bình luận.
- Server chỉ nghe trên máy này (127.0.0.1), chặn trang web lạ gửi lệnh tới.
- Từ điển dùng dữ liệu GPL-2.0: nếu đưa mã nguồn lên mạng công khai thì cần ghi rõ nguồn và giấy phép của file từ điển.
