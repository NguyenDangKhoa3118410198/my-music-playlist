// Ba thanh nhảy nhịp cho bài đang phát; đứng yên khi tạm dừng hoặc người dùng giảm chuyển động.
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'eq on' : 'eq'} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
