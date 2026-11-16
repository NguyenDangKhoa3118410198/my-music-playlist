const COLORS = ['#08d4df', '#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#60a5fa', '#f97316'];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const last = parts[parts.length - 1];
  return (parts.length > 1 ? parts[0][0] + last[0] : last.slice(0, 2)).toUpperCase();
}

export function Avatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  return (
    <span
      className="avatar"
      title={name}
      style={{ width: size, height: size, background: colorFor(id), fontSize: size * 0.38 }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
}: {
  people: { id: string; name: string }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <div className="avatar-stack" aria-label={`${people.length} người đang nghe`}>
      {shown.map((person) => (
        <Avatar key={person.id} id={person.id} name={person.name} size={32} />
      ))}
      {extra > 0 && <span className="avatar more">+{extra}</span>}
    </div>
  );
}
