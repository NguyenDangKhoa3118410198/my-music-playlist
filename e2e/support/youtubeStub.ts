// Thay YouTube IFrame API bằng bản giả chạy được trong test (không cần mạng, không bị chặn autoplay).
// window.__yt.calls ghi lại mọi lệnh app gọi vào player để test kiểm tra.
export const YOUTUBE_STUB = `
(() => {
  const calls = [];
  const players = [];
  window.__yt = {
    calls,
    players,
    last: (name) => [...calls].reverse().find((c) => c.method === name),
    count: (name) => calls.filter((c) => c.method === name).length,
    fireEnded: () => players.forEach((p) => p.opts.events.onStateChange({ data: 0, target: p })),
    // Video không phát được: player ở trạng thái chưa bắt đầu rồi báo lỗi.
    fireError: (code) => players.forEach((p) => { p.state = -1; p.opts.events.onError({ data: code, target: p }); }),
    // Sự kiện lỗi ĐẾN MUỘN của video trước, trong khi video hiện tại đang phát bình thường (không đổi trạng thái player).
    fireStaleError: (code) => players.forEach((p) => p.opts.events.onError({ data: code, target: p })),
    // Các video id luôn lỗi 101 (không cho nhúng) mỗi lần được tải.
    failIds: new Set(),
  };

  class Player {
    constructor(el, opts) {
      this.opts = opts;
      this.state = -1;
      this.time = 0;
      this.videoId = null;
      this.muted = false;
      this.box = document.createElement('div');
      this.box.className = 'fake-yt';
      this.box.setAttribute('data-testid', 'fake-yt');
      this.box.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:600 18px sans-serif;background:linear-gradient(135deg,#0f766e,#312e81)';
      el.replaceWith(this.box);
      this.timer = setInterval(() => {
        if (this.state === 1) this.time += 0.25;
      }, 250);
      players.push(this);
      setTimeout(() => opts.events.onReady({ target: this }), 20);
    }
    log(method, args) { calls.push({ method, args, at: Date.now() }); }
    // Khắt khe hơn player thật: tải video mới thì đặt lại tiếng, để test chứng minh app tự áp lại trạng thái tắt tiếng.
    loadVideoById(o) { this.log('loadVideoById', [o]); if (window.__yt.failIds.has(o.videoId)) { this.muted = false; this.videoId = o.videoId; this.time = 0; this.state = -1; setTimeout(() => this.opts.events.onError({ data: 101, target: this }), 40); return; } this.muted = false; this.videoId = o.videoId; this.time = o.startSeconds || 0; this.state = 1; this.box.textContent = 'video ' + o.videoId; }
    cueVideoById(o) { this.log('cueVideoById', [o]); this.videoId = o.videoId; this.time = o.startSeconds || 0; this.state = 5; this.box.textContent = 'video ' + o.videoId; }
    // Video không nhúng được thì playVideo() không làm nó phát (đúng như YouTube thật).
    playVideo() { this.log('playVideo', []); if (window.__yt.failIds.has(this.videoId)) return; this.state = 1; this.emit(1); }
    emit(data) { setTimeout(() => this.opts.events.onStateChange && this.opts.events.onStateChange({ data, target: this }), 0); }
    pauseVideo() { this.log('pauseVideo', []); this.state = 2; this.emit(2); }
    stopVideo() { this.log('stopVideo', []); this.state = 5; }
    seekTo(s) { this.log('seekTo', [s]); this.time = s; }
    mute() { this.log('mute', []); this.muted = true; }
    unMute() { this.log('unMute', []); this.muted = false; }
    isMuted() { return this.muted; }
    getCurrentTime() { return this.time; }
    getDuration() { return 215; }
    getPlayerState() { return this.state; }
    destroy() { this.log('destroy', []); clearInterval(this.timer); this.box.remove(); }
  }

  window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
})();
`;
