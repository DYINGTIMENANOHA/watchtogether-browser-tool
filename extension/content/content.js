// content.js
const isYouTube = location.hostname.includes('youtube.com');
const isBilibili = location.hostname.includes('bilibili.com');
let adapter = isYouTube ? new YouTubeAdapter() : isBilibili ? new BilibiliAdapter() : null;

let isInRoom = false;
let isHost = false;
let isActiveTab = false;
let hostSearching = false;
let suppressEvents = false;
let currentMembers = [];
let currentHostName = '';
let currentToken = '';
let currentVideoId = '';
let currentPlatform = '';

let shadowHost = null;
let shadowRoot = null;
let bubble = null;
let panel = null;
let panelVisible = false;
let bubbleHidden = false;

let vetoBanner = null, vetoTimerId = null;
let switchBanner = null;
let infoBanner = null, infoTimerId = null;

function initOverlay() {
  shadowHost = document.createElement('div');
  shadowHost.id = '__wt_host__';
  shadowHost.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(shadowHost);
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  createBubble();
  createPanel();
  createBannerContainer();
}

function getStyles() {
  return `
    *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}

    .wt-bubble{
      position:fixed;right:0;top:50%;transform:translateY(-50%);
      width:48px;height:48px;border-radius:50% 0 0 50%;
      background:#9e9e9e;cursor:pointer;pointer-events:auto;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
      box-shadow:-2px 0 10px rgba(0,0,0,.3);transition:background .3s,width .2s;
      user-select:none;
    }
    .wt-bubble.in-room{background:#4caf50;}
    .wt-bubble.reconnecting{background:#ff9800;animation:wt-pulse .8s infinite alternate;}
    .wt-bubble.host-searching{background:#2196f3;}
    .wt-bubble-icon{font-size:18px;line-height:1;color:#fff;}
    .wt-bubble-label{font-size:9px;color:rgba(255,255,255,.85);line-height:1;text-align:center;max-width:44px;overflow:hidden;white-space:nowrap;}
    .wt-bubble-close{
      position:absolute;top:-5px;right:-5px;width:16px;height:16px;
      background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;
      font-size:11px;line-height:16px;text-align:center;cursor:pointer;
      display:none;pointer-events:auto;
    }
    .wt-bubble:hover .wt-bubble-close{display:block;}
    @keyframes wt-pulse{to{opacity:.5;}}

    .wt-panel{
      position:fixed;right:52px;top:50%;transform:translateY(-50%);
      background:#1e1e1e;color:#f0f0f0;border-radius:12px;
      width:240px;padding:14px;pointer-events:auto;
      box-shadow:-4px 0 20px rgba(0,0,0,.5);
      max-height:80vh;overflow-y:auto;
    }
    .wt-panel-title{font-size:13px;font-weight:600;color:#fff;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}
    .wt-panel-close{background:none;border:none;color:#888;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;}
    .wt-panel-close:hover{color:#ccc;}
    .wt-section{margin-bottom:10px;}
    .wt-section-label{font-size:11px;color:#888;margin-bottom:4px;}
    .wt-code-row{display:flex;align-items:center;gap:6px;background:#2a2a2a;border-radius:6px;padding:6px 8px;}
    .wt-code-val{flex:1;font-family:monospace;font-size:15px;font-weight:700;letter-spacing:2px;color:#fff;}
    .wt-copy-btn{background:none;border:1px solid #555;color:#ccc;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;}
    .wt-copy-btn:hover{background:#333;}
    .wt-link-row{display:flex;align-items:center;gap:6px;background:#2a2a2a;border-radius:6px;padding:6px 8px;}
    .wt-link-val{flex:1;font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .wt-members{margin-bottom:8px;}
    .wt-member-header{font-size:11px;color:#888;margin-bottom:4px;}
    .wt-member-item{display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;color:#ddd;}
    .wt-member-dot{width:6px;height:6px;border-radius:50%;background:#4caf50;flex-shrink:0;}
    .wt-member-dot.host{background:#ff9800;}
    .wt-btn{width:100%;padding:7px;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;margin-top:6px;transition:opacity .15s;}
    .wt-btn:hover{opacity:.85;}
    .wt-btn.primary{background:#4caf50;color:#fff;}
    .wt-btn.danger{background:#b71c1c;color:#fff;}
    .wt-btn.secondary{background:#333;color:#ddd;}
    .wt-btn.blue{background:#1565c0;color:#fff;}
    .wt-input{width:100%;padding:7px 9px;border:1px solid #444;border-radius:6px;background:#111;color:#fff;font-size:13px;margin-top:4px;}
    .wt-input:focus{outline:none;border-color:#4caf50;}
    .wt-input::placeholder{color:#666;}
    .wt-status-row{font-size:12px;color:#aaa;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
    .wt-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
    .wt-dot.green{background:#4caf50;}
    .wt-dot.orange{background:#ff9800;animation:wt-pulse .8s infinite alternate;}
    .wt-dot.blue{background:#2196f3;animation:wt-pulse .8s infinite alternate;}
    .wt-dot.gray{background:#9e9e9e;}
    .wt-info{font-size:11px;color:#888;margin-top:6px;line-height:1.5;}
    .wt-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:12px;color:#ccc;}
    .wt-toggle-row:last-child{border-bottom:none;}
    .wt-toggle-wrap{position:relative;width:34px;height:18px;flex-shrink:0;}
    .wt-toggle-wrap input{opacity:0;width:0;height:0;position:absolute;}
    .wt-toggle-slider{position:absolute;top:0;left:0;right:0;bottom:0;background:#444;border-radius:9px;cursor:pointer;transition:background .2s;}
    .wt-toggle-slider::after{content:'';position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;top:2px;left:2px;transition:transform .2s;}
    .wt-toggle-wrap input:checked+.wt-toggle-slider{background:#4caf50;}
    .wt-toggle-wrap input:checked+.wt-toggle-slider::after{transform:translateX(16px);}
    .wt-subsection{background:#1a1a1a;border-radius:6px;padding:6px 8px;margin-bottom:8px;}
    .wt-num-input{background:#111;border:1px solid #444;color:#fff;border-radius:4px;padding:2px 5px;font-size:12px;width:40px;}

    .wt-banners{position:fixed;top:64px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;pointer-events:auto;min-width:320px;max-width:500px;z-index:1;}
    .wt-banner{
      background:rgba(22,22,22,.95);color:#fff;font-size:13px;
      padding:10px 16px;border-radius:10px;display:flex;align-items:center;gap:10px;
      backdrop-filter:blur(6px);white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.5);
    }
    .wt-banner.veto{border-left:3px solid #ff9800;}
    .wt-banner.switch{border-left:3px solid #2196f3;}
    .wt-banner.lost{border-left:3px solid #f44336;background:rgba(80,0,0,.95);}
    .wt-banner.info{border-left:3px solid #4caf50;}
    .wt-banner.warn{border-left:3px solid #ff9800;}
    .wt-cd{font-weight:700;color:#ff9800;min-width:26px;text-align:center;}
    .wt-banner-text{flex:1;}
    .wt-bBtn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);color:#fff;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:12px;white-space:nowrap;}
    .wt-bBtn:hover{background:rgba(255,255,255,.22);}
    .wt-bBtn.ok{background:#4caf50;border-color:#4caf50;}
    .wt-bBtn.danger{border-color:#f44336;color:#ff6b6b;}
  `;
}

function createBubble() {
  bubble = document.createElement('div');
  bubble.className = 'wt-bubble';
  bubble.innerHTML = `
    <div class="wt-bubble-icon">></div>
    <div class="wt-bubble-label">${t('bubble_sync')}</div>
    <button class="wt-bubble-close" title="${t('bubble_close_title')}">x</button>
  `;
  bubble.style.display = 'none';

  bubble.addEventListener('click', (e) => {
    if (e.target.classList.contains('wt-bubble-close')) {
      hideBubbleForSession();
      return;
    }
    togglePanel();
  });
  shadowRoot.appendChild(bubble);
}

function createPanel() {
  panel = document.createElement('div');
  panel.className = 'wt-panel';
  panel.style.display = 'none';
  shadowRoot.appendChild(panel);
}

function createBannerContainer() {
  const container = document.createElement('div');
  container.className = 'wt-banners';
  container.id = 'wt-banners';
  shadowRoot.appendChild(container);
}

function getBanners() { return shadowRoot.getElementById('wt-banners'); }

function updateBubble() {
  if (!bubble) return;
  chrome.storage.local.get({ showBubble: true }, ({ showBubble }) => {
    if (!showBubble || bubbleHidden) {
      bubble.style.display = 'none';
      return;
    }
    bubble.style.display = 'flex';

    const iconEl = bubble.querySelector('.wt-bubble-icon');
    const labelEl = bubble.querySelector('.wt-bubble-label');

    if (!isInRoom) {
      bubble.className = 'wt-bubble';
      iconEl.textContent = '>';
      labelEl.textContent = t('bubble_sync');
    } else if (hostSearching && !isHost) {
      bubble.className = 'wt-bubble host-searching';
      iconEl.textContent = '?';
      labelEl.textContent = t('bubble_searching');
    } else {
      bubble.className = 'wt-bubble in-room';
      iconEl.textContent = isHost ? 'H' : '>';
      labelEl.textContent = isHost ? t('bubble_host') : t('bubble_syncing');
    }
  });
}

function setBubbleReconnecting() {
  if (!bubble) return;
  bubble.className = 'wt-bubble reconnecting';
  bubble.querySelector('.wt-bubble-icon').textContent = '...';
  bubble.querySelector('.wt-bubble-label').textContent = t('bubble_reconnecting');
}

function hideBubbleForSession() {
  bubbleHidden = true;
  if (bubble) bubble.style.display = 'none';
  if (panel) { panel.style.display = 'none'; panelVisible = false; }
}

function togglePanel() {
  panelVisible = !panelVisible;
  panel.style.display = panelVisible ? '' : 'none';
  if (panelVisible) renderPanel();
}

function renderPanel() {
  if (!panel) return;
  if (!isInRoom) {
    renderIdlePanel();
  } else if (isHost && !isActiveTab) {
    renderHostTransferPanel();
  } else if (isHost) {
    renderHostPanel();
  } else {
    renderGuestPanel();
  }
}

function renderIdlePanel() {
  const hashCode = getHashCode();
  const videoId = adapter?.getVideoId() || '';
  const platform = adapter?.getPlatform() || '';
  const hasVideo = !!videoId;

  panel.innerHTML = `
    <div class="wt-panel-title">
      ${t('panel_idle_title')}
      <button class="wt-panel-close" id="wt-pc-close">x</button>
    </div>

    ${hasVideo ? `
    <div class="wt-section">
      <button class="wt-btn primary" id="wt-create-btn">${t('panel_create_btn')}</button>
      <div id="wt-create-err" style="font-size:11px;color:#f66;margin-top:4px;min-height:14px;"></div>
    </div>
    <div style="height:1px;background:#333;margin:2px 0 10px;"></div>
    ` : `<div class="wt-info">${t('panel_no_create')}</div><div style="height:1px;background:#333;margin:8px 0;"></div>`}

    <div class="wt-section">
      <div class="wt-section-label">${t('panel_join_section')}</div>
      <input class="wt-input" id="wt-code-input" placeholder="${t('panel_code_placeholder')}" maxlength="8"
        value="${hashCode ? escHtml(hashCode) : ''}">
      <input class="wt-input" id="wt-nick-input" placeholder="${t('panel_nick_placeholder')}" maxlength="20" style="margin-top:6px">
      <button class="wt-btn secondary" id="wt-do-join-btn" style="margin-top:6px">${t('panel_join_btn')}</button>
      <div id="wt-join-err" style="font-size:11px;color:#f66;margin-top:4px;min-height:14px;"></div>
    </div>

    <div id="wt-history-wrap" style="display:none;margin-top:4px;">
      <div style="font-size:10px;color:#666;margin-bottom:4px;letter-spacing:.3px;">${t('history_title')}</div>
      <div id="wt-history-list"></div>
    </div>
  `;

  panel.querySelector('#wt-pc-close')?.addEventListener('click', () => {
    panelVisible = false; panel.style.display = 'none';
  });

  chrome.runtime.sendMessage({ type: 'get_nickname' }, r => {
    const nick = r?.nickname || '';
    const n = panel.querySelector('#wt-nick-input');
    if (n) n.value = nick;
  });

  panel.querySelector('#wt-create-btn')?.addEventListener('click', () => {
    const btn = panel.querySelector('#wt-create-btn');
    const errEl = panel.querySelector('#wt-create-err');
    btn.disabled = true; btn.textContent = t('panel_creating');
    if (errEl) errEl.textContent = '';

    chrome.runtime.sendMessage({ type: 'get_nickname' }, r => {
      const nickname = r?.nickname || '';
      chrome.runtime.sendMessage({
        type: 'api_create_room',
        videoId,
        platform,
        title: getVideoTitle(),
        currentTime: adapter?.getCurrentTime() || 0,
        paused: adapter?.isPaused() !== false,
        isLive: adapter?.isLive() || false,
        nickname,
      }, res => {
        if (!res?.ok) {
          if (errEl) errEl.textContent = res?.error || t('err_create_failed');
          btn.disabled = false; btn.textContent = t('panel_create_btn');
          return;
        }
        const data = res.data;
        currentToken = data.token;
        currentVideoId = videoId;
        currentPlatform = platform;
        chrome.runtime.sendMessage({
          type: 'connect_room',
          roomId: data.room_id,
          token: data.token,
          isHost: true,
          videoId, platform, nickname,
          tabId: null,
        });
        isInRoom = true; isHost = true; isActiveTab = true;
        panelVisible = false; panel.style.display = 'none';
        updateBubble();
      });
    });
  });

  panel.querySelector('#wt-do-join-btn')?.addEventListener('click', () => {
    const btn = panel.querySelector('#wt-do-join-btn');
    const errEl = panel.querySelector('#wt-join-err');
    const token = panel.querySelector('#wt-code-input')?.value.trim();
    const nickname = panel.querySelector('#wt-nick-input')?.value.trim();
    if (!token) { if (errEl) errEl.textContent = t('panel_err_code'); return; }
    if (!nickname) { if (errEl) errEl.textContent = t('panel_err_nick'); return; }
    if (errEl) errEl.textContent = '';
    btn.disabled = true; btn.textContent = t('panel_joining');

    chrome.runtime.sendMessage({ type: 'api_join_room', token, nickname }, res => {
      if (!res?.ok) {
        if (errEl) errEl.textContent = res?.error || t('panel_err_failed');
        btn.disabled = false; btn.textContent = t('panel_join_btn');
        return;
      }
      const info = res.data;
      chrome.runtime.sendMessage({
        type: 'connect_room',
        roomId: info.room_id,
        isHost: false,
        hostName: info.host_name,
        videoId: info.video_id,
        platform: info.platform,
        nickname,
        hostSearching: info.host_searching || false,
        tabId: null,
        joinToken: token,
        title: info.title || '',
      });
      if (hashCode) history.replaceState(null, '', location.pathname + location.search);
      isInRoom = true; isHost = false; isActiveTab = true;
      currentHostName = info.host_name;
      panelVisible = false; panel.style.display = 'none';
      updateBubble();
      if (info.video_id && !info.host_searching) {
        const url = getVideoUrl(info.video_id, info.platform);
        if (!location.href.includes(info.video_id)) location.href = url;
      }
    });
  });

  panel.querySelector('#wt-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') panel.querySelector('#wt-do-join-btn')?.click();
  });

  renderIdlePanelHistory();
}

function renderIdlePanelHistory() {
  chrome.storage.local.get({ joinHistory: [] }, ({ joinHistory }) => {
    if (!joinHistory.length) return;
    const wrap = panel?.querySelector('#wt-history-wrap');
    if (!wrap) return;
    const listEl = panel.querySelector('#wt-history-list');
    if (!listEl) return;

    wrap.style.display = '';
    const entries = joinHistory.slice(0, 3);
    listEl.innerHTML = entries.map((entry, i) => {
      const platLabel = entry.platform === 'youtube' ? 'YouTube' : 'Bilibili';
      const sub = entry.title ? escHtml(entry.title) : platLabel;
      return `
        <div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid #2a2a2a;">
          <span id="wt-hd-${i}" style="width:6px;height:6px;border-radius:50%;background:#555;flex-shrink:0;display:inline-block;" title="${t('history_checking')}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(entry.hostName || '-')}</div>
            <div style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub}  -  ${timeAgo(entry.joinedAt)}</div>
          </div>
          <button class="wt-bbtn" id="wt-hjoin-${i}" style="font-size:10px;padding:3px 7px;">${t('history_join_btn')}</button>
        </div>`;
    }).join('');

    entries.forEach((entry, i) => {
      panel.querySelector(`#wt-hjoin-${i}`)?.addEventListener('click', () => {
        const codeInput = panel?.querySelector('#wt-code-input');
        if (codeInput) { codeInput.value = entry.token; }
        panel?.querySelector('#wt-do-join-btn')?.click();
      });
    });

    entries.forEach((entry, i) => {
      chrome.runtime.sendMessage({ type: 'api_check_room', token: entry.token }, res => {
        const dot = panel?.querySelector(`#wt-hd-${i}`);
        const btn = panel?.querySelector(`#wt-hjoin-${i}`);
        if (!dot) return;
        const exists = !!res?.data?.exists;
        dot.style.background = exists ? '#4caf50' : '#555';
        dot.title = t(exists ? 'history_online' : 'history_offline');
        if (btn && !exists) btn.style.opacity = '0.45';
      });
    });
  });
}

function renderHostTransferPanel() {
  const videoId  = adapter?.getVideoId() || '';
  const platform = adapter?.getPlatform() || '';
  const hasVideo = !!videoId;

  panel.innerHTML = `
    <div class="wt-panel-title">
      WatchTogether
      <button class="wt-panel-close" id="wt-pc-close">x</button>
    </div>
    <div class="wt-info" style="margin-bottom:10px;line-height:1.6;">${t('transfer_already_host')}</div>
    ${hasVideo
      ? `<button class="wt-btn primary" id="wt-transfer-btn">${t('transfer_btn')}</button>
         <div id="wt-transfer-err" style="font-size:11px;color:#f66;margin-top:4px;min-height:14px;"></div>`
      : `<div class="wt-info" style="color:#888;">${t('transfer_no_video')}</div>`}
    <button class="wt-btn secondary" id="wt-transfer-cancel" style="margin-top:6px;">${t('cancel')}</button>
  `;

  panel.querySelector('#wt-pc-close')?.addEventListener('click', () => { panelVisible = false; panel.style.display = 'none'; });
  panel.querySelector('#wt-transfer-cancel')?.addEventListener('click', () => { panelVisible = false; panel.style.display = 'none'; });

  panel.querySelector('#wt-transfer-btn')?.addEventListener('click', () => {
    const btn   = panel.querySelector('#wt-transfer-btn');
    const errEl = panel.querySelector('#wt-transfer-err');
    btn.disabled = true; btn.textContent = t('transfer_btn_loading');
    if (errEl) errEl.textContent = '';

    chrome.runtime.sendMessage({ type: 'take_active_tab' }, res => {
      if (!res?.ok) {
        if (errEl) errEl.textContent = res?.error || t('err_create_failed');
        btn.disabled = false; btn.textContent = t('transfer_btn');
        return;
      }
      isActiveTab = true;
      currentVideoId = videoId;
      currentPlatform = platform;
      hostSearching = false;
      chrome.runtime.sendMessage({
        type: 'video_changed',
        videoId,
        platform,
        isLive: adapter?.isLive() || false,
        currentTime: adapter?.getCurrentTime() || 0,
        paused: adapter?.isPaused() !== false,
      });
      panelVisible = false; panel.style.display = 'none';
      renderHostPanel();
      updateBubble();
    });
  });
}

function renderHostPanel() {
  const memberCount = currentMembers.length;
  const inviteLink = currentVideoId && currentPlatform
    ? (currentPlatform === 'youtube'
        ? `https://www.youtube.com/watch?v=${currentVideoId}#wt-code=${currentToken}`
        : `https://www.bilibili.com/video/${currentVideoId}/?wt_code=${currentToken}`)
    : '';

  panel.innerHTML = `
    <div class="wt-panel-title">
      ${t('panel_host_title')}
      <button class="wt-panel-close" id="wt-pc-close">x</button>
    </div>
    <div class="wt-status-row">
      <div class="wt-dot green" id="wt-status-dot"></div>
      <span id="wt-status-text">${t('panel_status_syncing')}</span>
    </div>

    <div class="wt-section">
      <div class="wt-section-label">${t('invite_code_label')}</div>
      <div class="wt-code-row">
        <span class="wt-code-val">${currentToken || '-'}</span>
        <button class="wt-copy-btn" id="wt-copy-code">${t('copy')}</button>
      </div>
    </div>

    ${inviteLink ? `
    <div class="wt-section">
      <div class="wt-section-label">${t('invite_link_label')}</div>
      <div class="wt-link-row">
        <span class="wt-link-val" title="${inviteLink}">${inviteLink}</span>
        <button class="wt-copy-btn" id="wt-copy-link">${t('copy')}</button>
      </div>
    </div>
    ` : ''}

    <div class="wt-members">
      <div class="wt-member-header">${t('panel_members_header', { n: memberCount })}</div>
      <div id="wt-member-list">${renderMemberItems(currentMembers, true)}</div>
    </div>

    <div class="wt-section">
      <div class="wt-section-label">${t('panel_settings_section')}</div>
      <div class="wt-subsection">
        <div class="wt-toggle-row">
          <span>${t('panel_veto_label')}</span>
          <label class="wt-toggle-wrap">
            <input type="checkbox" id="wt-veto-chk">
            <div class="wt-toggle-slider"></div>
          </label>
        </div>
        <div id="wt-veto-sec-row" style="display:none;padding:6px 0;font-size:12px;color:#aaa;align-items:center;gap:6px;">
          ${t('panel_veto_cd')} <input type="number" class="wt-num-input" id="wt-veto-sec" min="3" max="30" value="5"> ${t('panel_veto_sec')}
        </div>
        <div class="wt-toggle-row">
          <span>${t('panel_guest_ctrl')}</span>
          <label class="wt-toggle-wrap">
            <input type="checkbox" id="wt-guest-ctrl-chk">
            <div class="wt-toggle-slider"></div>
          </label>
        </div>
      </div>
    </div>

    ${currentVideoId ? `<button class="wt-btn blue" id="wt-sync-all-btn" style="margin-bottom:4px;">${t('sync_all_btn')}</button>` : ''}
    <button class="wt-btn danger" id="wt-leave-btn">${t('leave_room')}</button>
  `;

  panel.querySelector('#wt-sync-all-btn')?.addEventListener('click', () => {
    const btn = panel.querySelector('#wt-sync-all-btn');
    chrome.runtime.sendMessage({ type: 'sync_all' });
    if (btn) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 3000); }
  });

  panel.querySelector('#wt-pc-close')?.addEventListener('click', () => { panelVisible = false; panel.style.display = 'none'; });

  panel.querySelector('#wt-copy-code')?.addEventListener('click', () => {
    const btn = panel.querySelector('#wt-copy-code');
    copyText(currentToken, btn);
    if (btn) { const orig = t('copy'); setTimeout(() => { btn.textContent = orig; }, 2000); }
  });
  if (inviteLink) {
    panel.querySelector('#wt-copy-link')?.addEventListener('click', () => {
      copyText(inviteLink, panel.querySelector('#wt-copy-link'));
    });
  }

  chrome.storage.local.get({ vetoEnabled: false, vetoSeconds: 5, allowGuestControl: false }, s => {
    const vetoChk = panel.querySelector('#wt-veto-chk');
    const secRow = panel.querySelector('#wt-veto-sec-row');
    const secInput = panel.querySelector('#wt-veto-sec');
    const guestChk = panel.querySelector('#wt-guest-ctrl-chk');
    if (!vetoChk) return;

    vetoChk.checked = s.vetoEnabled;
    secInput.value = s.vetoSeconds;
    if (guestChk) guestChk.checked = s.allowGuestControl;
    secRow.style.display = s.vetoEnabled ? 'flex' : 'none';

    // Always resync to server on panel render — covers video-change / service-worker-restart scenarios
    // where the server's room config may have drifted from stored preferences.
    chrome.runtime.sendMessage({ type: 'veto_config', enabled: s.vetoEnabled, seconds: s.vetoSeconds });
    chrome.runtime.sendMessage({ type: 'guest_control_config', allowed: s.allowGuestControl || false });

    vetoChk.addEventListener('change', () => {
      const enabled = vetoChk.checked;
      const secs = Math.max(3, Math.min(30, parseInt(secInput?.value) || 5));
      secRow.style.display = enabled ? 'flex' : 'none';
      chrome.storage.local.set({ vetoEnabled: enabled, vetoSeconds: secs });
      chrome.runtime.sendMessage({ type: 'veto_config', enabled, seconds: secs });
    });

    secInput.addEventListener('change', () => {
      const secs = Math.max(3, Math.min(30, parseInt(secInput.value) || 5));
      secInput.value = secs;
      chrome.storage.local.set({ vetoSeconds: secs });
      chrome.runtime.sendMessage({ type: 'veto_config', enabled: vetoChk.checked, seconds: secs });
    });

    guestChk?.addEventListener('change', () => {
      const allowed = guestChk.checked;
      chrome.storage.local.set({ allowGuestControl: allowed });
      chrome.runtime.sendMessage({ type: 'guest_control_config', allowed });
    });
  });

  panel.querySelector('#wt-member-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.wt-xfer-btn');
    if (!btn || btn.disabled) return;
    const targetSid = btn.dataset.sid;
    btn.disabled = true;
    btn.textContent = t('transfer_host_btn_loading');
    chrome.runtime.sendMessage({ type: 'transfer_host', targetSid }, res => {
      if (!res?.ok) {
        btn.disabled = false;
        btn.textContent = t('transfer_host_btn');
        const errKey = res?.error === 'transfer_target_offline' ? 'err_transfer_offline' : 'err_create_failed';
        showInfo(t(errKey), 4000);
      } else {
        isHost = false;
        panelVisible = false; panel.style.display = 'none';
        updateBubble();
        showTransferChoiceBanner(res.newHostName);
      }
    });
  });

  panel.querySelector('#wt-leave-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'leave_room' });
    isInRoom = false; isHost = false; currentMembers = [];
    updateBubble(); panelVisible = false; panel.style.display = 'none';
    showInfo(t('info_left_room'), 3000);
  });
}

function renderGuestPanel() {
  const onSameVideo = isCurrentRoomVideo();

  const memberItemsHtml = !currentMembers || currentMembers.length === 0
    ? `<div style="color:#666;font-size:12px;">${t('member_empty')}</div>`
    : currentMembers.map(m => {
        let hostLine = '';
        if (m.is_host) {
          if (hostSearching) {
            hostLine = `<div style="font-size:10px;color:#888;margin-top:1px;">${t('host_searching_label')}</div>`;
          } else if (currentVideoId) {
            const platLabel = currentPlatform === 'youtube' ? 'YouTube' : 'Bilibili';
            hostLine = onSameVideo
              ? `<div style="font-size:10px;color:#4caf50;margin-top:1px;">${platLabel}</div>`
              : `<div style="font-size:10px;color:#f66;margin-top:1px;">${platLabel} · ${t('not_same_video')}</div>`;
          }
        }
        return `
          <div class="wt-member-item">
            <div class="wt-member-dot ${m.is_host ? 'host' : ''}"></div>
            <div style="line-height:1.4;">
              <div>${escHtml(m.name)}${m.is_host ? ' H' : ''}</div>
              ${hostLine}
            </div>
          </div>`;
      }).join('');

  const catchUpDisabled = hostSearching || !onSameVideo;

  panel.innerHTML = `
    <div class="wt-panel-title">
      ${t('panel_guest_title')}
      <button class="wt-panel-close" id="wt-pc-close">x</button>
    </div>
    <div class="wt-status-row">
      <div class="wt-dot green" id="wt-status-dot"></div>
      <span id="wt-status-text">${t('panel_status_syncing')}</span>
    </div>
    <div class="wt-section-label">${t('panel_host_label')} ${escHtml(currentHostName || '-')}</div>
    <div class="wt-members" style="margin-top:8px;">
      <div class="wt-member-header">${t('panel_members_header', { n: currentMembers.length })}</div>
      <div id="wt-member-list">${memberItemsHtml}</div>
    </div>
    <button class="wt-btn blue" id="wt-catchup-btn"${catchUpDisabled ? ' disabled style="opacity:0.45;cursor:not-allowed;"' : ''}>${t('catch_up_btn')}</button>
    ${(!hostSearching && !onSameVideo) ? `<button class="wt-btn primary" id="wt-joinhost-btn">${t('join_host_btn')}</button>` : ''}
    <button class="wt-btn danger" id="wt-leave-btn">${t('leave_room')}</button>
  `;

  panel.querySelector('#wt-pc-close')?.addEventListener('click', () => { panelVisible = false; panel.style.display = 'none'; });
  panel.querySelector('#wt-catchup-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'catch_up' });
  });
  panel.querySelector('#wt-joinhost-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'catch_up' });
  });
  panel.querySelector('#wt-leave-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'leave_room' });
    isInRoom = false; isHost = false; currentMembers = [];
    updateBubble(); panelVisible = false; panel.style.display = 'none';
    showInfo(t('info_left_room'), 3000);
  });
}

function renderMemberItems(members, showTransfer = false) {
  if (!members || members.length === 0) return `<div style="color:#666;font-size:12px;">${t('member_empty')}</div>`;
  return members.map(m => `
    <div class="wt-member-item">
      <div class="wt-member-dot ${m.is_host ? 'host' : ''}"></div>
      <span style="flex:1;">${escHtml(m.name)}${m.is_host ? ' H' : ''}</span>
      ${showTransfer && !m.is_host ? `<button class="wt-copy-btn wt-xfer-btn" data-sid="${escHtml(m.sid)}" style="color:#ff9800;border-color:#ff9800;font-size:10px;padding:2px 6px;">${t('transfer_host_btn')}</button>` : ''}
    </div>
  `).join('');
}

function updatePanelIfVisible() {
  if (panelVisible) renderPanel();
}

function updateStatusInPanel(status) {
  const dot = shadowRoot.getElementById('wt-status-dot');
  const text = shadowRoot.getElementById('wt-status-text');
  if (!dot || !text) return;
  if (status === 'connected') {
    dot.className = 'wt-dot green'; text.textContent = t('panel_status_syncing');
  } else if (status === 'reconnecting') {
    dot.className = 'wt-dot orange'; text.textContent = t('panel_status_reconnecting');
  } else {
    dot.className = 'wt-dot gray'; text.textContent = t('panel_status_disconnected');
  }
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = t('copied'); setTimeout(() => { btn.textContent = orig; }, 2000); }
  });
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getVideoTitle() {
  return (document.title || '')
    .replace(/ - YouTube$/, '')
    .replace(/_\u54d4\u54e9\u54d4\u54e9_bilibili$/, '')
    .replace(/ - \u54d4\u54e9\u54d4\u54e9$/, '')
    .trim();
}

function getVideoUrl(videoId, platform) {
  if (!videoId || !platform) return '';
  return platform === 'youtube'
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.bilibili.com/video/${videoId}/`;
}

function isCurrentRoomVideo(videoId = currentVideoId, platform = currentPlatform) {
  if (hostSearching) return false;
  if (!adapter || !videoId || !platform) return false;
  return adapter.getPlatform() === platform && adapter.getVideoId() === videoId;
}

function getHashCode() {
  const hashMatch = location.hash.match(/[#&]wt-code=([^&]+)/);
  if (hashMatch) return hashMatch[1];
  return new URLSearchParams(location.search).get('wt_code') || null;
}

function showInfo(text, duration = 4000) {
  const b = getBanners();
  if (!b) return;
  if (infoBanner) { clearTimeout(infoTimerId); infoBanner.remove(); infoBanner = null; }
  infoBanner = document.createElement('div');
  infoBanner.className = 'wt-banner info';
  infoBanner.innerHTML = `<span class="wt-banner-text">${escHtml(text)}</span>`;
  b.appendChild(infoBanner);
  infoTimerId = setTimeout(() => { infoBanner?.remove(); infoBanner = null; }, duration);
}

function showVetoBanner(seconds) {
  const b = getBanners();
  if (!b) return;
  clearInterval(vetoTimerId); vetoTimerId = null;
  vetoBanner?.remove(); vetoBanner = null;

  let remaining = seconds;
  vetoBanner = document.createElement('div');
  vetoBanner.className = 'wt-banner veto';
  vetoBanner.innerHTML = `
    <span class="wt-banner-text">${t('banner_veto_will_follow', { sec: remaining })}</span>
    <button class="wt-bBtn ok" id="wt-veto-follow">${t('banner_veto_follow_now')}</button>
    <button class="wt-bBtn danger" id="wt-veto-deny">${t('banner_veto_deny')}</button>
  `;
  b.appendChild(vetoBanner);

  vetoBanner.querySelector('#wt-veto-follow')?.addEventListener('click', () => {
    clearInterval(vetoTimerId); vetoTimerId = null;
    vetoBanner?.remove(); vetoBanner = null;
    chrome.runtime.sendMessage({ type: 'catch_up' });
  });
  vetoBanner.querySelector('#wt-veto-deny')?.addEventListener('click', () => {
    clearInterval(vetoTimerId); vetoTimerId = null;
    vetoBanner?.remove(); vetoBanner = null;
    chrome.runtime.sendMessage({ type: 'veto' });
  });

  vetoTimerId = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(vetoTimerId); vetoTimerId = null;
      vetoBanner?.remove(); vetoBanner = null;
    } else {
      const textEl = vetoBanner?.querySelector('.wt-banner-text');
      if (textEl) textEl.textContent = t('banner_veto_will_follow', { sec: remaining });
    }
  }, 1000);
}

function showSwitchBanner(hostName, videoId, platform) {
  const b = getBanners();
  if (!b) return;
  switchBanner?.remove(); switchBanner = null;

  switchBanner = document.createElement('div');
  switchBanner.className = 'wt-banner switch';
  const targetUrl = getVideoUrl(videoId, platform);
  switchBanner.innerHTML = `
    <span class="wt-banner-text">${t('banner_switch_text', { name: escHtml(hostName) })}</span>
    <button class="wt-bBtn ok" id="wt-sw-follow">${t('banner_switch_follow')}</button>
    <button class="wt-bBtn danger" id="wt-sw-leave">${t('banner_switch_leave')}</button>
  `;
  b.appendChild(switchBanner);

  switchBanner.querySelector('#wt-sw-follow')?.addEventListener('click', () => {
    switchBanner?.remove(); switchBanner = null;
    location.href = targetUrl;
  });
  switchBanner.querySelector('#wt-sw-leave')?.addEventListener('click', () => {
    switchBanner?.remove(); switchBanner = null;
    chrome.runtime.sendMessage({ type: 'leave_room' });
    isInRoom = false; isHost = false; currentMembers = [];
    updateBubble();
    showInfo(t('info_left_room'), 3000);
  });
}

function showTransferChoiceBanner(newHostName) {
  const b = getBanners();
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'wt-banner info';
  el.innerHTML = `
    <span class="wt-banner-text">${t('you_are_guest_text', { name: escHtml(newHostName || '?') })}</span>
    <button class="wt-bBtn ok" id="wt-stay-btn">${t('transfer_stay_btn')}</button>
    <button class="wt-bBtn danger" id="wt-tleave-btn">${t('leave_room')}</button>
  `;
  b.appendChild(el);
  el.querySelector('#wt-stay-btn')?.addEventListener('click', () => el.remove());
  el.querySelector('#wt-tleave-btn')?.addEventListener('click', () => {
    el.remove();
    chrome.runtime.sendMessage({ type: 'leave_room' });
    isInRoom = false; isHost = false; currentMembers = [];
    updateBubble(); panelVisible = false; if (panel) panel.style.display = 'none';
  });
  setTimeout(() => el.remove(), 15000);
}

function showLostBanner(hostName) {
  const b = getBanners();
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'wt-banner lost';
  el.innerHTML = `
    <span class="wt-banner-text">${t('banner_lost_text', { name: escHtml(hostName || '?') })}</span>
    <button class="wt-bBtn" id="wt-lost-ok">${t('close')}</button>
  `;
  b.appendChild(el);
  el.querySelector('#wt-lost-ok')?.addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 8000);
}

function showNonActiveBanner(role) {
  const b = getBanners();
  if (!b) return;
  if (shadowRoot.getElementById('wt-nonactive-banner')) return;
  const el = document.createElement('div');
  el.id = 'wt-nonactive-banner';
  el.className = 'wt-banner info';
  el.innerHTML = `
    <span class="wt-banner-text">${role === 'host' ? t('banner_non_active_host') : t('banner_non_active_guest')}</span>
    <button class="wt-bBtn" id="wt-nonactive-ok">${t('close')}</button>
  `;
  b.appendChild(el);
  el.querySelector('#wt-nonactive-ok')?.addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 12000);
}

function showReconnectCatchUpPrompt() {
  const b = getBanners();
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'wt-banner info';
  el.innerHTML = `
    <span class="wt-banner-text">${t('reconnect_prompt')}</span>
    <button class="wt-bBtn ok" id="wt-ru-yes">${t('reconnect_yes')}</button>
    <button class="wt-bBtn" id="wt-ru-no">${t('reconnect_no')}</button>
  `;
  b.appendChild(el);
  const dismiss = () => el.remove();
  el.querySelector('#wt-ru-yes')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'catch_up' }); dismiss();
  });
  el.querySelector('#wt-ru-no')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 10000);
}

function syncStateFromBackground(callback) {
  chrome.runtime.sendMessage({ type: 'get_status' }, res => {
    if (chrome.runtime.lastError || !res) { callback?.(); return; }
    if (res.currentRoom) {
      isInRoom = true;
      isHost = res.currentRoom.isHost;
      hostSearching = res.currentRoom.hostSearching || false;
      currentMembers = res.currentRoom.members || [];
      currentHostName = res.currentRoom.hostName || '';
      currentToken = res.currentRoom.token || '';
      currentVideoId = res.currentRoom.videoId || '';
      currentPlatform = res.currentRoom.platform || '';
    } else {
      isInRoom = false; isHost = false; isActiveTab = false;
      currentMembers = []; currentToken = '';
    }
    updateBubble();
    updatePanelIfVisible();
    callback?.();
  });
}

let positionTimer = null;

function initAdapter() {
  if (!adapter) return;
  adapter.init();

  adapter.onPlay(() => {
    if (!isInRoom || !isActiveTab || suppressEvents || !isCurrentRoomVideo()) return;
    chrome.runtime.sendMessage({ type: 'sync_action', action: 'play', seekTime: adapter.getCurrentTime() });
  });
  adapter.onPause(() => {
    if (!isInRoom || !isActiveTab || suppressEvents || !isCurrentRoomVideo()) return;
    chrome.runtime.sendMessage({ type: 'sync_action', action: 'pause', seekTime: adapter.getCurrentTime() });
  });
  adapter.onSeek(time => {
    if (!isInRoom || !isActiveTab || suppressEvents || !isCurrentRoomVideo()) return;
    chrome.runtime.sendMessage({ type: 'sync_action', action: 'seek', seekTime: time });
  });
  adapter.onVideoChange((videoId, isLive) => {
    if (!isInRoom || !isActiveTab) return;
    if (isHost) {
      const platform = adapter.getPlatform();
      chrome.runtime.sendMessage({
        type: 'video_changed',
        videoId,
        platform,
        isLive,
        currentTime: videoId ? adapter.getCurrentTime() : 0,
        paused: videoId ? adapter.isPaused() : true,
      });
      if (videoId) {
        currentVideoId = videoId;
        currentPlatform = platform;
        hostSearching = false;
      } else {
        hostSearching = true;
      }
      updateBubble();
    } else if (currentVideoId && (!videoId || videoId !== currentVideoId)) {
      chrome.runtime.sendMessage({ type: 'leave_room' });
      isInRoom = false; isHost = false; currentMembers = [];
      updateBubble();
      panelVisible = false; if (panel) panel.style.display = 'none';
      showInfo(t('info_left_room'), 3000);
    }
  });

  positionTimer = setInterval(() => {
    if (!isInRoom || !isHost || !isActiveTab || !isCurrentRoomVideo()) return;
    chrome.runtime.sendMessage({ type: 'position_update', currentTime: adapter.getCurrentTime(), paused: adapter.isPaused() });
  }, 3000);
}

async function onPageReady() {
  const lang = await new Promise(r => chrome.storage.local.get({ lang: 'en' }, s => r(s.lang || 'en')));
  setLang(lang);

  initOverlay();

  const hashCode = getHashCode();

  chrome.runtime.sendMessage({ type: 'check_is_active_tab' }, res => {
    if (chrome.runtime.lastError || !res) return;

    if (res.inRoom) {
      isInRoom = true;
      isHost = res.isHost;
      hostSearching = res.hostSearching || false;
      isActiveTab = res.isActiveTab;

      syncStateFromBackground(() => {
        if (isActiveTab) {
          if (isHost) {
            const pageVid = adapter?.getVideoId();
            const pagePlat = adapter?.getPlatform();
            if (pageVid && (pageVid !== currentVideoId || pagePlat !== currentPlatform)) {
              setTimeout(() => {
                chrome.runtime.sendMessage({
                  type: 'video_changed',
                  videoId: pageVid,
                  platform: pagePlat,
                  isLive: adapter?.isLive() || false,
                  currentTime: adapter?.getCurrentTime() || 0,
                  paused: adapter?.isPaused() !== false,
                });
                currentVideoId = pageVid;
                currentPlatform = pagePlat;
                hostSearching = false;
                updateBubble();
              }, 800);
            } else if (!pageVid && currentVideoId) {
              chrome.runtime.sendMessage({
                type: 'video_changed',
                videoId: '',
                platform: pagePlat || currentPlatform,
                isLive: false,
                currentTime: 0,
                paused: true,
              });
              hostSearching = true;
              updateBubble();
            }
          } else {
            setTimeout(() => {
              if (isCurrentRoomVideo()) chrome.runtime.sendMessage({ type: 'catch_up' });
            }, 600);
          }
        } else {
          showNonActiveBanner(isHost ? 'host' : 'guest');
        }
        updateBubble();
        if (hashCode) showInfo(t('info_already_in_room'), 4000);
      });
    } else {
      updateBubble();
      if (!sessionStorage.getItem('wt-no-banner')) {
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'get_status' }, s => {
            if (!s?.currentRoom && shadowRoot) {
              if (hashCode) {
                panelVisible = true;
                panel.style.display = '';
                renderPanel();
              }
            }
          });
        }, 2000);
      }
    }
  });

  initAdapter();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'ws_status':
      if (msg.status === 'reconnecting') setBubbleReconnecting();
      else updateBubble();
      updateStatusInPanel(msg.status);
      break;

    case 'room_joined':
      isInRoom = true;
      isHost = msg.isHost;
      isActiveTab = true;
      syncStateFromBackground(() => {
        if (!msg.isHost) setTimeout(() => chrome.runtime.sendMessage({ type: 'catch_up' }), 600);
        updateBubble();
        updatePanelIfVisible();
      });
      break;

    case 'became_active_tab':
      isActiveTab = true;
      syncStateFromBackground(() => { updateBubble(); updatePanelIfVisible(); });
      break;

    case 'lost_active_tab':
      isActiveTab = false;
      updateBubble();
      break;

    case 'sync_apply':
      if (!isInRoom || !isActiveTab) break;
      if (!isCurrentRoomVideo(msg.videoId || currentVideoId, msg.platform || currentPlatform)) break;
      suppressEvents = true;
      if (msg.action === 'play') adapter?.play();
      else if (msg.action === 'pause') adapter?.pause();
      else if (msg.action === 'seek') {
        if (adapter?.seekTo(msg.seekTime) === false) {
          suppressEvents = false;
          setTimeout(() => chrome.runtime.sendMessage({ type: 'catch_up' }), 1500);
          break;
        }
      }
      setTimeout(() => { suppressEvents = false; }, 800);
      break;

    case 'sync_opportunity':
      if (!isInRoom || !isActiveTab) break;
      showVetoBanner(msg.delaySeconds);
      break;

    case 'sync_vetoed':
      clearInterval(vetoTimerId); vetoTimerId = null;
      vetoBanner?.remove(); vetoBanner = null;
      break;

    case 'catch_up_result':
      if (!adapter || !isActiveTab) break;
      if (msg.videoId && (adapter.getPlatform() !== msg.platform || adapter.getVideoId() !== msg.videoId)) {
        location.href = getVideoUrl(msg.videoId, msg.platform);
        break;
      }
      suppressEvents = true;
      if (adapter.seekTo(msg.seekTime) === false) {
        suppressEvents = false;
        setTimeout(() => chrome.runtime.sendMessage({ type: 'catch_up' }), 1500);
        break;
      }
      if (!msg.paused) adapter.play(); else adapter.pause();
      setTimeout(() => { suppressEvents = false; }, 800);
      break;

    case 'host_switched':
      if (!isInRoom || isHost || !isActiveTab) break;
      hostSearching = false;
      currentVideoId = msg.videoId || '';
      currentPlatform = msg.platform || '';
      if (msg.syncAll) {
        showInfo(t('info_sync_all'), 1000);
        if (adapter && adapter.getPlatform() === msg.platform && adapter.getVideoId() === msg.videoId) {
          suppressEvents = true;
          if (adapter.seekTo(msg.seekTime) !== false) {
            if (!msg.paused) adapter.play(); else adapter.pause();
          }
          setTimeout(() => { suppressEvents = false; }, 800);
        } else {
          location.href = getVideoUrl(msg.videoId, msg.platform);
        }
      } else {
        showSwitchBanner(msg.hostName, msg.videoId, msg.platform);
        updatePanelIfVisible();
      }
      break;

    case 'host_searching':
      hostSearching = true;
      updateBubble();
      updatePanelIfVisible();
      break;

    case 'host_reconnecting':
      if (isInRoom && !isHost) {
        setBubbleReconnecting();
        showInfo(t('banner_host_reconnecting', { name: escHtml(msg.hostName) }), 8000);
      }
      break;

    case 'host_reconnected':
      if (isInRoom && !isHost) {
        updateBubble();
        showInfo(t('banner_host_reconnected'), 3000);
      }
      break;

    case 'room_lost':
      isInRoom = false; isHost = false; isActiveTab = false;
      hostSearching = false; currentMembers = []; currentToken = '';
      clearInterval(positionTimer); positionTimer = null;
      clearInterval(vetoTimerId); vetoTimerId = null; vetoBanner?.remove(); vetoBanner = null;
      switchBanner?.remove(); switchBanner = null;
      panelVisible = false; if (panel) panel.style.display = 'none';
      updateBubble();
      if (!msg.autoLeave) showLostBanner(msg.hostName);
      break;

    case 'room_dissolved':
      if (isInRoom) {
        isInRoom = false; isHost = false; isActiveTab = false;
        hostSearching = false; currentMembers = []; currentToken = '';
        clearInterval(positionTimer); positionTimer = null;
        clearInterval(vetoTimerId); vetoTimerId = null; vetoBanner?.remove(); vetoBanner = null;
        switchBanner?.remove(); switchBanner = null;
        panelVisible = false; if (panel) panel.style.display = 'none';
        updateBubble();
        showLostBanner(msg.hostName);
      }
      break;

    case 'self_left_room':
      if (isInRoom) {
        isInRoom = false; isHost = false; isActiveTab = false;
        hostSearching = false; currentMembers = []; currentToken = '';
        clearInterval(positionTimer); positionTimer = null;
        clearInterval(vetoTimerId); vetoTimerId = null; vetoBanner?.remove(); vetoBanner = null;
        switchBanner?.remove(); switchBanner = null;
        panelVisible = false; if (panel) panel.style.display = 'none';
        updateBubble();
      }
      break;

    case 'host_changed': {
      if (msg.iAmNewHost) {
        isHost = true;
        updateBubble();
        updatePanelIfVisible();
        showInfo(t('info_became_host'), 4000);
        const newVid = adapter?.getVideoId() || '';
        const newPlat = adapter?.getPlatform() || '';
        if (newVid) {
          currentVideoId = newVid;
          currentPlatform = newPlat;
          chrome.runtime.sendMessage({
            type: 'video_changed',
            videoId: newVid,
            platform: newPlat,
            isLive: adapter?.isLive() || false,
            currentTime: adapter?.getCurrentTime() || 0,
            paused: adapter?.isPaused() !== false,
          });
        }
      } else {
        currentHostName = msg.newHostName;
        showInfo(t('host_changed_banner', { name: escHtml(msg.newHostName) }), 4000);
        updatePanelIfVisible();
      }
      break;
    }

    case 'member_list':
      currentMembers = msg.members || [];
      updatePanelIfVisible();
      break;

    case 'reconnect_catch_up_prompt':
      if (isActiveTab && !isHost) showReconnectCatchUpPrompt();
      break;

    case 'get_player_state':
      sendResponse({
        currentTime: adapter?.getCurrentTime() || 0,
        paused: adapter?.isPaused() !== false,
        isLive: adapter?.isLive() || false,
      });
      return true;
  }
});

if (adapter) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }
}
