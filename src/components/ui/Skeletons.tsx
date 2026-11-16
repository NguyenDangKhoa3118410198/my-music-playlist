// Khung xương cho trạng thái chờ: giữ đúng hình dạng nội dung thật nên trang không giật khi dữ liệu về.

export function PlaylistCardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="pl-card is-skeleton" aria-hidden="true">
          <span className="sk sk-square" />
          <span className="sk-lines">
            <span className="sk sk-line-md" />
            <span className="sk sk-line-sm" />
          </span>
        </div>
      ))}
    </>
  );
}

export function SongRowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <ul className="song-list" aria-busy="true" aria-label="Đang tải bài hát">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="song-row is-skeleton" aria-hidden="true">
          <span className="song-num">
            <span className="sk sk-dot" />
          </span>
          <span className="sk sk-thumb" />
          <span className="sk-lines">
            <span className="sk sk-line-md" />
            <span className="sk sk-line-sm" />
          </span>
          <span className="song-tags">
            <span className="sk sk-chip" />
          </span>
          <span className="song-actions">
            <span className="sk sk-dot" />
            <span className="sk sk-dot" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PlaylistDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải playlist">
      <header className="pl-head section" aria-hidden="true">
        <span className="sk sk-cover" />
        <span className="sk-lines is-head">
          <span className="sk sk-line-sm" />
          <span className="sk sk-line-xl" />
          <span className="sk sk-line-md" />
        </span>
      </header>
      <div className="pl-actions" aria-hidden="true">
        <span className="sk sk-pill" />
        <span className="sk sk-circle" />
        <span className="sk sk-pill" />
      </div>
      <SongRowSkeletons />
    </div>
  );
}
