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
    fireError: (code) => players.forEach((p) => p.opts.events.onError({ data: code, target: p })),
  };

  class Player {
    constructor(el, opts) {
      this.opts = opts;
      this.state = -1;
      this.time = 0;
      this.videoId = null;
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
    loadVideoById(o) { this.log('loadVideoById', [o]); this.videoId = o.videoId; this.time = o.startSeconds || 0; this.state = 1; this.box.textContent = 'video ' + o.videoId; }
    cueVideoById(o) { this.log('cueVideoById', [o]); this.videoId = o.videoId; this.time = o.startSeconds || 0; this.state = 5; this.box.textContent = 'video ' + o.videoId; }
    playVideo() { this.log('playVideo', []); this.state = 1; this.emit(1); }
    emit(data) { setTimeout(() => this.opts.events.onStateChange && this.opts.events.onStateChange({ data, target: this }), 0); }
    pauseVideo() { this.log('pauseVideo', []); this.state = 2; this.emit(2); }
    stopVideo() { this.log('stopVideo', []); this.state = 5; }
    seekTo(s) { this.log('seekTo', [s]); this.time = s; }
    getCurrentTime() { return this.time; }
    getDuration() { return 215; }
    getPlayerState() { return this.state; }
    destroy() { this.log('destroy', []); clearInterval(this.timer); this.box.remove(); }
  }

  window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
})();
`;
