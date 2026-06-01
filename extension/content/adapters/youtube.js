class YouTubeAdapter {
  constructor() {
    this._video = null; this._onPlayCb = null; this._onPauseCb = null;
    this._onSeekCb = null; this._onVideoChangeCb = null;
    this._seekDebounce = null; this._suppressEvents = false;
    this._lastVideoId = null; this._listeners = [];
  }
  getVideoId() { return new URLSearchParams(location.search).get('v') || ''; }
  getPlatform() { return 'youtube'; }
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
  init() { this._findVideo(); this._watchVideoElement(); this._watchSPANavigation(); this._lastVideoId = this.getVideoId(); }
  destroy() { for (const [el,t,f] of this._listeners) el.removeEventListener(t,f); this._listeners = []; this._video = null; }
  _findVideo() {
    this._video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (this._video) this._attachVideoListeners();
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
  _watchVideoElement() {
    new MutationObserver(() => {
      const nv = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (nv && nv !== this._video) {
        for (const [el,t,f] of this._listeners) el.removeEventListener(t,f);
        this._listeners = []; this._video = nv; this._attachVideoListeners();
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  _watchSPANavigation() {
    document.addEventListener('yt-navigate-finish', () => {
      const newId = this.getVideoId();
      if (newId !== this._lastVideoId) {
        this._lastVideoId = newId; this._findVideo();
        this._onVideoChangeCb && this._onVideoChangeCb(newId, this.isLive());
      }
    });
  }
}
