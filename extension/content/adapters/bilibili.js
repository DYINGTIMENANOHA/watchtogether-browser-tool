class BilibiliAdapter {
  constructor() {
    this._video = null; this._onPlayCb = null; this._onPauseCb = null;
    this._onSeekCb = null; this._onVideoChangeCb = null;
    this._seekDebounce = null; this._suppressEvents = false;
    this._lastVideoId = null; this._listeners = []; this._urlObserver = null;
  }
  getVideoId() {
    const m = location.pathname.match(/\/video\/((?:BV|AV|av|bv)\w+)/i);
    if (!m) return '';
    return m[1].slice(0, 2).toUpperCase() + m[1].slice(2);
  }
  getPlatform() { return 'bilibili'; }
  getCurrentTime() { return this._video ? this._video.currentTime : 0; }
  isPaused() { return this._video ? this._video.paused : true; }
  isLive() { return this._video ? this._video.duration === Infinity : false; }
  play() {
    if (!this._video) return;
    this._suppressEvents = true;
    this._video.play().finally(() => setTimeout(() => { this._suppressEvents = false; }, 300));
  }
  pause() {
    if (!this._video) return;
    this._suppressEvents = true; this._video.pause();
    setTimeout(() => { this._suppressEvents = false; }, 300);
  }
  seekTo(time) {
    if (!this._video) return false;
    this._suppressEvents = true; this._video.currentTime = time;
    setTimeout(() => { this._suppressEvents = false; }, 500);
    return true;
  }
  onPlay(cb) { this._onPlayCb = cb; }
  onPause(cb) { this._onPauseCb = cb; }
  onSeek(cb) { this._onSeekCb = cb; }
  onVideoChange(cb) { this._onVideoChangeCb = cb; }
  init() { this._findVideo(); this._watchSPANavigation(); this._lastVideoId = this.getVideoId(); }
  destroy() { for (const [el,t,f] of this._listeners) el.removeEventListener(t,f); this._listeners = []; if (this._urlObserver) this._urlObserver.disconnect(); this._video = null; }
  _findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) { setTimeout(() => this._findVideo(), 1000); return; }
    const main = videos.reduce((a,b) => (a.duration||0) >= (b.duration||0) ? a : b);
    if (main && main !== this._video) {
      for (const [el,t,f] of this._listeners) el.removeEventListener(t,f);
      this._listeners = []; this._video = main; this._attachVideoListeners();
    }
  }
  _attachVideoListeners() {
    const v = this._video;
    const onPlay = () => { if (!this._suppressEvents) this._onPlayCb && this._onPlayCb(); };
    const onPause = () => { if (!this._suppressEvents) this._onPauseCb && this._onPauseCb(); };
    const onSeeked = () => {
      if (this._suppressEvents) return;
      clearTimeout(this._seekDebounce);
      this._seekDebounce = setTimeout(() => this._onSeekCb && this._onSeekCb(v.currentTime), 300);
    };
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('seeked', onSeeked);
    this._listeners.push([v,'play',onPlay],[v,'pause',onPause],[v,'seeked',onSeeked]);
  }
  _watchSPANavigation() {
    let lastUrl = location.href;
    this._urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        const newId = this.getVideoId();
        if (newId !== this._lastVideoId) {
          this._lastVideoId = newId;
          setTimeout(() => { this._findVideo(); this._onVideoChangeCb && this._onVideoChangeCb(newId, this.isLive()); }, 1500);
        }
      }
    });
    this._urlObserver.observe(document.body, { childList: true, subtree: true });
  }
}
