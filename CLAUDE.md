# Đường Lên Đỉnh Phan Xi Păng: ghi chú cho Claude

Game nối từ tiếng Việt cho TikTok LIVE. Bản yêu cầu gốc do GPT viết; nhiều chỗ đã được chỉnh (xem "Quyết định"). Học hỏi từ dự án `~/Projects/lop-hoc-chu-master` (Lớp Học Chữ): kết nối TikTok, `createTime`, chuẩn hoá dấu, từ cấm, `lvh.me`, âm thanh tự tạo.
Khi chủ kênh chốt quyết định mới, ghi vào mục "Quyết định".

## Kiến trúc

- **Server quyết định mọi thứ** (khác Lớp Học Chữ, nơi game chạy trên trang stage). Overlay và admin chỉ hiển thị trạng thái server gửi; reload overlay không mất gì.
- Luồng: `server/live/tiktok-connector.ts` (chuẩn hoá, KHÔNG xử lý luật) → `server/live/pipeline.ts` (chống trùng msgId) → `server/game/phan-xi-pang-engine.ts` → Socket.IO (`server/socket.ts`).
- Lõi game là hàm/lớp thuần, nhận `now` truyền vào (không tự gọi Date.now trong luật) để test được: `word-validator.ts`, `word-bank.ts`, `round-manager.ts` (Round, ClockSync, chọn từ tiếp), `player-manager.ts` (xếp hạng / ghế), `scoring-service.ts`.
- Kiểu dữ liệu dùng chung + tên sự kiện socket: `shared/types.ts`. Chuẩn hoá tiếng Việt: `shared/vietnamese.ts`.
- Client: `src/overlay/*` (1080x1920, `?view=overlay`), `src/admin/*` (trang `/`, có xem trước overlay im lặng).
- Lưu trữ: file JSON trong `data/` (`server/storage/json-store.ts`). Không dùng MySQL (không có sẵn, game chạy 1 máy).
- Chạy live: `pnpm start` (build rồi phục vụ `dist/`, cờ `--prod`); phát triển: `pnpm dev` (Vite dev server).
- File JSON trong `data/` bị hỏng: `JsonStore.read` đổi tên thành `*.corrupt-<giờ>` rồi dùng mặc định (không bị ghi đè). Log quá 30 ngày tự xoá lúc bật server.
- Test: `pnpm test` (node:test qua tsx, thư mục `tests/`). Typecheck: `pnpm lint`.
- Cổng 3007 (Lớp Học Chữ 3006). HMR Vite cổng 24684 (`HMR_PORT`).

## Quyết định (khác bản yêu cầu GPT)

- 15 giây/chặng (chủ kênh chốt 2026-11-10), không phải 5: người xem thấy hình trễ 3-8 giây. Thêm `lateGraceMs` (mặc định 3 giây) = vẫn nhận bình luận GỬI trong 3 giây sau khi đồng hồ server về 0, rồi chờ thêm `ARRIVAL_BUFFER_MS` cho bình luận tới chậm.
- Xếp thứ tự theo `createTime` của TikTok (giờ gửi), không theo giờ server nhận. Để xét trong/ngoài giờ thì quy đổi sang đồng hồ server bằng độ trễ phân vị 10% (`ClockSync`).
- "Mỗi đáp án chỉ người đầu tiên được tính" (mâu thuẫn với "ai đúng cũng có điểm"): bỏ. Ai đúng cũng xếp hạng; điểm giảm dần nên chép đáp án trên khung chat chỉ được ít điểm.
- Tạm dừng vẫn nhận đáp án gửi trước lúc dừng (tới trễ do độ trễ hình). Admin xoá/khoá người hoặc đánh dấu từ không hợp lệ giữa chặng thì đáp án đó bị bỏ, người sau được đôn hạng.
- Overlay không hiện đáp án trong lúc chặng đang chạy (chỉ hiện ai đã nối + thứ tự), hết chặng mới hiện.
- Sai không trừ điểm, nhưng tối đa 3 lần sai mỗi chặng (chống đoán bừa hàng loạt). Nói chuyện thường (nhiều chữ, có số, có @, không phải âm tiết Việt) không tính là trả lời.
- Ghế = N người đứng đầu bảng xếp hạng (tie-break: điểm → ai đạt điểm đó trước → ai vào trước). Hàng chờ VẪN được trả lời và có điểm; ghi điểm vượt người đang ngồi thì lên ghế. Không ai bị loại hay bị xoá điểm.
- Trả lời đúng mà chưa join thì tự vào game (`autoJoinOnAnswer`). `join` / `tham gia`; KHÔNG dùng "vào" vì "vào" là tiếng nối được.
- Từ điển: Viet74K thiếu nhiều từ ghép thông dụng → admin duyệt từ bị từ chối ngay trong chặng, người đã gửi được tính lại đúng thứ tự (`Round.approveRejected`).
- Từ mỗi chặng LUÔN do hệ thống chọn NGẪU NHIÊN, không nối với từ trước (chủ kênh chốt 2026-11-17, thay quyết định 2026-11-10 "nối tiếp từ hiện tại"; lý do: bình luận trễ của chặng trước dễ bị tính nhầm vào chặng sau). `chooseNextWord` = `pickStartWord` + tránh cùng tiếng cuối với từ hiện tại: từ phổ biến, chưa dùng, chặng sau còn từ để nối. `nextSource` 'jump' chỉ còn dùng khi từ bí đường.
- Cuộc đua (2026-11-10): `roundsPerRace` chặng thì tự kết thúc. Kết thúc (tự hoặc admin bấm) = vinh danh Top 4 có khung vàng/bạc/đồng/ngọc, MC đọc hạng 4 -> 3 -> 2 -> vô địch, rồi "Tất cả chuẩn bị", sau `raceBreakSeconds` tự mở cuộc đua mới (giữ người chơi, điểm về 0, dọn người im 10 phút). Admin huỷ được.
- Giọng MC (2026-11-10): server quyết định MC nói gì (`server/game/mc-director.ts`, câu ở `mc-lines.ts`), overlay chỉ phát (`src/lib/voice.ts`), TTS ở `server/tts.ts` (Edge, lỗi thì Google). Đồng hồ KHÔNG chờ MC: câu có hạn, trễ thì bỏ. Lời chính (đề, kết quả, vinh danh) xếp hàng; nói thêm (chào, quà, dẫn đầu, mẹo) chỉ khi rảnh. Chỉ overlay mở sau cùng phát tiếng.
- Chữ trên màn hình và lời MC: ngắn gọn, chuyên nghiệp, không thừa (chủ kênh dặn 2026-11-10).
- Admin "Chặng tiếp" khi chặng đang chạy: chốt ngay (người đã đúng vẫn có điểm). "Đổi từ": huỷ chặng đang chạy, không ai được điểm.
- Kết thúc: chặng dở vẫn chốt và cộng điểm, là chặng cuối (không chọn từ tiếp, `nextSource: 'end'`). Bấm Bắt đầu sau khi kết thúc = cuộc đua mới giữ người chơi. "Chặng tiếp" không vượt `roundsPerRace`.
- Từ khởi đầu cấu hình chỉ dùng cho cuộc đua đầu của phiên; các cuộc đua sau hệ thống tự chọn. "Đổi từ" lúc chưa chạy = từ khởi đầu lần Bắt đầu tới. "Đổi từ" chỉ nhận từ có trong từ điển, chưa dùng, còn nối tiếp được.
- Tạm dừng: nhận đáp án gửi trước lúc dừng + `lateGraceMs`; gửi trong lúc dừng thì không tính (không được thêm giờ suy nghĩ).
- Danh sách bị khoá giữ suốt buổi (kể cả Phiên mới xoá người chơi). Mở cuộc đua mới tự động: dọn người không bình luận 10 phút.
- Tắt server: ảnh chụp `data/current-session.json`, bật lại về Tạm dừng, chặng dở được chơi lại.
- Giả lập bị chặn khi đang kết nối TikTok thật; người chơi giả (`mock_*`) không vào `players.json`.
- `processInitialData: false`: không lấy bình luận cũ trước lúc kết nối.
- Chưa làm: thưởng điểm theo quà (quà chỉ được MC cảm ơn + thông báo).

- Overlay (2026-11-17): chỉ cần xem tốt trên **điện thoại** (người xem TikTok). Khung 1080x1920 co về ~390px nên chữ tối thiểu ~24px (đừng dùng chữ nhỏ hơn). Bảng xếp hạng (`ContestantSeats`): ghế sắp theo điểm, hiện TÊN GỌI (từ cuối của tên) + huy hiệu điểm ĐỎ, không hiện số thứ tự; top 3 nền vàng/bạc/đồng, hạng 1 có vương miện. Bỏ dải "chuỗi từ" (từ không còn nối nhau).
- Admin (2026-11-17): giữ đơn giản. Tab Điều khiển chỉ hiện nút hợp trạng thái; việc ít dùng (phiên mới, đổi từ, cho MC đọc) trong "Nâng cao"; cảnh báo giọng MC và "Từ cần duyệt" chỉ hiện khi có vấn đề; giả lập chỉ 4 nút và ẩn khi đã nối TikTok thật. Từ điển + lịch sử/log nằm trong tab "Khác".
- Dấu trên avatar (2026-11-17): overlay hiện ✓ xanh (nối đúng) / ✕ đỏ (sai) trên avatar ở ghế và ở dải trả lời, chỉ trong lúc chặng chạy; không lộ đáp án. Server gửi `marks`, `wrong`, `wrongCount` trong OverlayState (Round.wrongUsers).
