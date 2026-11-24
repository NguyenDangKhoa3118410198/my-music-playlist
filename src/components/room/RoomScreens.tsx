import { DoorClosed } from 'lucide-react';

// Khung chờ khi đang mở phòng.
export function RoomSkeleton({ message }: { message: string }) {
  return (
    <main className="room-shell">
      <div className="room-skeleton" aria-busy="true" aria-label="Đang mở phòng">
        <span className="sk sk-title" />
        <span className="sk sk-video" />
        <span className="sk sk-line" />
        {message && <p className="form-message">{message}</p>}
      </div>
    </main>
  );
}

export function RoomClosedScreen({ name, onHome }: { name: string; onHome: () => void }) {
  return (
    <main className="center-shell">
      <div className="room-ambient" aria-hidden="true" />
      <section className="center-card">
        <div className="center-icon is-warning">
          <DoorClosed size={36} />
        </div>
        <h1>Phòng đã đóng</h1>
        <p>“{name}” đã được chủ phòng đóng, không thể vào lại nữa. Bạn có thể tạo một phòng mới từ trang chủ.</p>
        <button className="btn btn-primary btn-lg btn-block" type="button" onClick={onHome}>
          Về trang chủ
        </button>
      </section>
    </main>
  );
}
