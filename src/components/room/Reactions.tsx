import { type FloatingReaction, REACTIONS } from '../../lib/reactions';

// Lớp emoji bay lên trên video. Chỉ trang trí nên ẩn với trình đọc màn hình.
export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="reaction-layer" aria-hidden="true">
      {reactions.map((reaction) => (
        <span key={reaction.id} className="reaction-float" style={{ left: `${reaction.left}%` }}>
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({ onSend, disabled }: { onSend: (emoji: string) => void; disabled: boolean }) {
  return (
    <div className="reaction-bar" role="group" aria-label="Gửi cảm xúc">
      {REACTIONS.map(({ emoji, label }) => (
        <button key={emoji} className="icon-btn" type="button" aria-label={label} title={label} disabled={disabled} onClick={() => onSend(emoji)}>
          <span className="reaction-emoji" aria-hidden="true">
            {emoji}
          </span>
        </button>
      ))}
    </div>
  );
}
