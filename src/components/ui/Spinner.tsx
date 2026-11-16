type Props = {
  size?: number;
  /** Có nhãn thì là trạng thái độc lập cho trình đọc màn hình; không có thì chỉ để trang trí (trong nút...). */
  label?: string;
};

export function Spinner({ size = 18, label }: Props) {
  const style = { '--spinner-size': `${size}px` } as React.CSSProperties;
  if (!label) return <span className="spinner" style={style} aria-hidden="true" />;

  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" style={style} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
