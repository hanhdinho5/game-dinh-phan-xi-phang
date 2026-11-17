// Trang nào đang mở?
//   /?view=overlay  -> trang đưa vào TikTok LIVE Studio (1080x1920). Chỉ trang này phát tiếng.
//   /               -> trang Admin (điều khiển + xem trước im lặng)
const params = new URLSearchParams(window.location.search);
const view = params.get('view');
export const IS_OVERLAY = view === 'overlay' || view === 'stage';
/** ?mute=1: overlay không phát tiếng (để thử) */
export const MUTED = params.get('mute') === '1';
/** ?token=...: mã admin khi server đặt ADMIN_TOKEN */
export const URL_TOKEN = params.get('token') ?? '';

export const STAGE_W = 1080;
export const STAGE_H = 1920;
