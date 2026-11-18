import { useEffect, useState } from 'react';

type Props = { value: string; size?: number; label: string };

// Mã QR vẽ bằng thư viện `qrcode`, nạp khi cần để không làm nặng bản tải đầu tiên.
// Nền trắng, chữ đen cố định: máy quét QR cần độ tương phản cao, không theo giao diện tối.
export function QrCode({ value, size = 220, label }: Props) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    void import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(value, { margin: 2, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
      )
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(''));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return src ? (
    <img className="qr" src={src} width={size} height={size} alt={label} />
  ) : (
    <span className="qr qr-loading" style={{ width: size, height: size }} aria-busy="true" />
  );
}
