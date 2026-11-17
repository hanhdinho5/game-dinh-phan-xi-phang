/**
 * Chống xử lý trùng sự kiện. TikTok đôi khi gửi lại cùng một bình luận (kết nối lại, processInitialData...).
 * Nhớ `capacity` mã gần nhất; mã cũ nhất bị quên trước.
 */
export class EventDeduper {
  private seen = new Set<string>();
  constructor(private readonly capacity = 5000) {}

  /** true = lần đầu thấy (xử lý), false = trùng (bỏ) */
  check(key: string): boolean {
    if (!key) return true;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > this.capacity) this.seen.delete(this.seen.values().next().value!);
    return true;
  }

  clear() {
    this.seen.clear();
  }
}
