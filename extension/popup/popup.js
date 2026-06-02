const $ = id => document.getElementById(id);
const DEFAULT_SERVER = 'https://streamforsoul.com:8443';

function showView(name) {
  ['firstrun', 'idle', 'room'].forEach(v => {
    $(`view-${v}`).style.display = v === name ? '' : 'none';
  });
}
function setError(msg) { $('error-msg').textContent = msg; }
function setStatusDot(state) {
  $('status-dot').className = 'status-dot ' + (state === 'connected' ? '' : state);
  if (state === 'connected')       $('status-text').textContent = t('status_syncing');
  else if (state === 'connecting') $('status-text').textContent = t('status_connecting');
  else                             $('status-text').textContent = t('status_reconnecting');
}

async function getServerUrl() {
  return new Promise(r => chrome.storage.local.get({ serverUrl: '' }, s => {
    // 空字符串 = 用户未设置，使用代码默认
    r(s.serverUrl || DEFAULT_SERVER);
  }));
}
async function apiPost(path, data) {
  const url = await getServerUrl();
  const res = await fetch(`${url}/wt${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `请求失败(${res.status})`);
  }
  return res.json();
}

async function getCurrentVideoInfo() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab) { resolve(null); return; }
      const url = tab.url || '';
      let videoId = null, platform = null;
      if (url.includes('youtube.com/watch')) {
        videoId = new URL(url).searchParams.get('v');
        platform = 'youtube';
      } else if (url.includes('bilibili.com/video/')) {
        const m = url.match(/\/video\/((?:BV|AV|av|bv)\w+)/i);
        if (m) {
          // BV ID 大小写敏感，只规范化前缀
          videoId = m[1].slice(0, 2).toUpperCase() + m[1].slice(2);
        }
        platform = 'bilibili';
      }
      if (!videoId) { resolve(null); return; }
      const title = (tab.title || '').replace(' - YouTube', '').replace('_哔哩哔哩_bilibili', '');
      let done = false;
      const t = setTimeout(() => {
        if (!done) { done = true; resolve({ videoId, platform, title, currentTime: 0, paused: true, isLive: false, tabId: tab.id }); }
      }, 600);
      chrome.tabs.sendMessage(tab.id, { type: 'get_player_state' }, res => {
        if (!done) {
          done = true; clearTimeout(t);
          resolve({ videoId, platform, title, currentTime: res?.currentTime || 0, paused: res?.paused !== false, isLive: res?.isLive || false, tabId: tab.id });
        }
      });
    });
  });
}

async function getNickname() {
  return new Promise(r => chrome.runtime.sendMessage({ type: 'get_nickname' }, res => r(res?.nickname || '')));
}

async function getClientId() {
  return new Promise(r => chrome.runtime.sendMessage({ type: 'get_client_id' }, res => r(res?.clientId || '')));
}

async function loadRoomSettings() {
  return new Promise(r => chrome.storage.local.get({ vetoEnabled: false, vetoSeconds: 5, allowGuestControl: false }, r));
}
function saveRoomSettings(s) { chrome.storage.local.set(s); }

function getInviteLink(videoId, platform, token) {
  if (!videoId || !platform || !token) return '';
  if (platform === 'youtube') {
    // YouTube: hash 安全，不影响路由
    return `https://www.youtube.com/watch?v=${videoId}#wt-code=${token}`;
  }
  // Bilibili: 用 query 参数，hash 会被 B 站 SPA 路由拦截导致"视频不存在"
  return `https://www.bilibili.com/video/${videoId}/?wt_code=${token}`;
}

function renderMemberList(members, listId, countId) {
  if (!members) return;
  const list = $(listId);
  const count = $(countId);
  if (!list || !count) return;
  count.textContent = `${members.length}/5`;
  list.innerHTML = members.map(m =>
    `<div class="member-item${m.is_host ? ' host' : ''}">
      <span class="member-dot"></span>
      <span class="member-name">${escHtml(m.name)}${m.is_host ? ' 👑' : ''}</span>
    </div>`
  ).join('');
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 首次运行检测 ──────────────────────────────────
async function checkFirstRun() {
  return new Promise(r => {
    chrome.storage.local.get({ firstRun: false, nickname: '' }, s => {
      r(s.firstRun || !s.nickname);
    });
  });
}


let videoInfo = null;
let currentRoomData = null;

async function init() {
  // 先加载语言，再渲染任何文字
  const lang = await new Promise(r => chrome.storage.local.get({ lang: 'en' }, s => r(s.lang || 'en')));
  setLang(lang);
  applyI18n();

  // 首次运行引导
  const isFirstRun = await checkFirstRun();
  if (isFirstRun) {
    showView('firstrun');
    chrome.storage.local.get({ nickname: '' }, s => {
      $('firstrun-nick').value = s.nickname || '';
    });
    return;
  }

  videoInfo = await getCurrentVideoInfo();

  chrome.runtime.sendMessage({ type: 'get_status' }, res => {
    if (res?.currentRoom) {
      currentRoomData = res.currentRoom;
      showRoomView(res.currentRoom, res.wsState);
    } else {
      showView('idle');
      renderHistory();
      if (videoInfo) {
        $('video-title').textContent = videoInfo.title || videoInfo.videoId;
        $('video-meta').textContent = (videoInfo.platform === 'youtube' ? 'YouTube' : 'Bilibili') + (videoInfo.isLive ? ' · ' + t('live') : '');
        $('btn-create').disabled = false;
        $('btn-create').style.opacity = '1';
      } else {
        $('video-title').textContent = t('no_video');
        $('video-meta').textContent = t('no_video_sub');
        $('btn-create').disabled = true;
        $('btn-create').style.opacity = '0.4';
      }
    }
  });
}

async function showRoomView(room, wsState) {
  currentRoomData = room;
  showView('room');
  setStatusDot(wsState === 'connected' ? 'connected' : 'connecting');
  const settings = await loadRoomSettings();

  if (room.isHost) {
    $('host-panel').style.display = '';
    $('guest-panel').style.display = 'none';

    $('token-display').textContent = room.token || '—';

    // 邀请链接
    const link = getInviteLink(room.videoId, room.platform, room.token);
    $('link-display').textContent = link || t('invite_link_none');
    $('link-display').title = link || '';

    $('toggle-veto').checked = settings.vetoEnabled;
    $('input-veto-seconds').value = settings.vetoSeconds;
    $('veto-seconds-row').style.display = settings.vetoEnabled ? 'flex' : 'none';
    $('toggle-guest-control').checked = settings.allowGuestControl;

    renderMemberList(room.members || [], 'member-list', 'member-count');
    const syncAllBtn = $('btn-sync-all');
    if (syncAllBtn) syncAllBtn.style.display = room.videoId ? '' : 'none';
    startMemberRefresh();
  } else {
    $('host-panel').style.display = 'none';
    $('guest-panel').style.display = '';
    $('host-name-display').textContent = room.hostName || '—';
    renderMemberList(room.members || [], 'guest-member-list', 'guest-member-count');
    startMemberRefresh();
  }
}

let memberRefreshTimer = null;
let connectionCheckTimer = null;

function startMemberRefresh() {
  clearInterval(memberRefreshTimer);
  clearTimeout(connectionCheckTimer);

  // 3 秒超时：若仍未连接则显示失败提示
  connectionCheckTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'get_status' }, res => {
      if (res?.wsState === 'connected') return; // 已连上，忽略
      if (!res?.currentRoom) return; // 已退出
      setStatusDot('disconnected');
      // 在 error-msg 区显示提示（room 视图没有 error-msg，用 status-text）
      const el = $('status-text');
      if (el) el.textContent = t('conn_fail_retry');
    });
  }, 3000);

  memberRefreshTimer = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'get_status' }, res => {
      if (!res?.currentRoom) return;
      if (res.currentRoom.isHost) {
        renderMemberList(res.currentRoom.members || [], 'member-list', 'member-count');
      } else {
        renderMemberList(res.currentRoom.members || [], 'guest-member-list', 'guest-member-count');
      }
      setStatusDot(res.wsState === 'connected' ? 'connected' : 'connecting');
    });
  }, 3000);
}

// ── 首次运行 ──────────────────────────────────────
$('btn-firstrun-save').addEventListener('click', () => {
  const nick = $('firstrun-nick').value.trim();
  if (!nick) { $('firstrun-err').textContent = t('firstrun_err_empty'); return; }
  if (nick.length > 20) { $('firstrun-err').textContent = t('firstrun_err_long'); return; }
  chrome.storage.local.set({ nickname: nick, firstRun: false }, () => {
    $('firstrun-err').textContent = '';
    init();
  });
});
$('firstrun-nick').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-firstrun-save').click(); });

// ── 创建房间 ──────────────────────────────────────
$('btn-create').addEventListener('click', async () => {
  if (!videoInfo) return;
  $('btn-create').disabled = true; $('btn-create').textContent = t('creating'); setError('');
  try {
    const [nickname, clientId] = await Promise.all([getNickname(), getClientId()]);
    const res = await apiPost('/room/create', {
      host_name: nickname,
      client_id: clientId,
      video_id: videoInfo.videoId,
      platform: videoInfo.platform,
      title: videoInfo.title || '',
      current_time: videoInfo.currentTime,
      paused: videoInfo.paused,
      is_live: videoInfo.isLive,
    });
    chrome.runtime.sendMessage({
      type: 'connect_room',
      roomId: res.room_id,
      token: res.token,
      isHost: true,
      videoId: videoInfo.videoId,
      platform: videoInfo.platform,
      nickname,
      tabId: videoInfo.tabId,
    });
    const roomObj = { isHost: true, token: res.token, roomId: res.room_id, videoId: videoInfo.videoId, platform: videoInfo.platform, members: [] };
    showRoomView(roomObj, 'connecting');
  } catch (e) {
    setError(e.message || t('err_create_failed'));
  } finally {
    $('btn-create').disabled = false; $('btn-create').textContent = t('create_room');
  }
});

// ── 加入房间 ──────────────────────────────────────
$('btn-join').addEventListener('click', async () => {
  const token = $('input-token').value.trim();
  if (!token) { setError(t('err_enter_code')); return; }
  setError(''); $('btn-join').disabled = true; $('btn-join').textContent = t('joining');
  try {
    const [nickname, clientId] = await Promise.all([getNickname(), getClientId()]);
    const info = await apiPost('/room/join', { token, guest_name: nickname, client_id: clientId });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      const tabId = tab?.id;
      chrome.runtime.sendMessage({
        type: 'connect_room',
        roomId: info.room_id,
        token: null,
        isHost: false,
        hostName: info.host_name,
        videoId: info.video_id,
        platform: info.platform,
        nickname,
        hostSearching: info.host_searching || false,
        tabId,
        joinToken: token,
        title: info.title || '',
      });
      showRoomView({ isHost: false, roomId: info.room_id, hostName: info.host_name, platform: info.platform, members: [] }, 'connecting');
      // 跳转到视频
      if (tab && info.video_id && !info.host_searching) {
        const url = info.platform === 'youtube'
          ? `https://www.youtube.com/watch?v=${info.video_id}`
          : `https://www.bilibili.com/video/${info.video_id}/`;
        if (!(tab.url || '').includes(info.video_id)) chrome.tabs.update(tab.id, { url });
      }
    });
  } catch (e) {
    setError(e.message || t('err_invalid_code'));
  } finally {
    $('btn-join').disabled = false; $('btn-join').textContent = t('join_btn');
  }
});

// ── 复制 ──────────────────────────────────────────
$('btn-copy-token').addEventListener('click', () => {
  const val = $('token-display').textContent;
  navigator.clipboard.writeText(val).then(() => {
    $('btn-copy-token').textContent = t('copied');
    setTimeout(() => { $('btn-copy-token').textContent = t('copy'); }, 2000);
  });
});

$('btn-copy-link').addEventListener('click', () => {
  const link = $('link-display').title || $('link-display').textContent;
  if (!link || link.startsWith('（')) return;
  navigator.clipboard.writeText(link).then(() => {
    $('btn-copy-link').textContent = t('copied');
    setTimeout(() => { $('btn-copy-link').textContent = t('copy'); }, 2000);
  });
});

// ── 离开 ──────────────────────────────────────────
$('btn-leave').addEventListener('click', () => {
  clearInterval(memberRefreshTimer);
  chrome.runtime.sendMessage({ type: 'leave_room' }, () => {
    showView('idle');
    if (videoInfo) { $('video-title').textContent = videoInfo.title || videoInfo.videoId; }
  });
});

$('btn-catch-up').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'catch_up' }));

$('btn-sync-all').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'sync_all' });
  const btn = $('btn-sync-all');
  if (btn) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 3000); }
});

// ── 设置开关 ──────────────────────────────────────
$('toggle-veto').addEventListener('change', e => {
  const enabled = e.target.checked;
  const seconds = parseInt($('input-veto-seconds').value) || 5;
  $('veto-seconds-row').style.display = enabled ? 'flex' : 'none';
  saveRoomSettings({ vetoEnabled: enabled, vetoSeconds: seconds });
  chrome.runtime.sendMessage({ type: 'veto_config', enabled, seconds });
});
$('input-veto-seconds').addEventListener('change', e => {
  const s = Math.max(3, Math.min(30, parseInt(e.target.value) || 5));
  e.target.value = s;
  saveRoomSettings({ vetoSeconds: s });
  chrome.runtime.sendMessage({ type: 'veto_config', enabled: $('toggle-veto').checked, seconds: s });
});
$('toggle-guest-control').addEventListener('change', e => {
  const allowed = e.target.checked;
  saveRoomSettings({ allowGuestControl: allowed });
  chrome.runtime.sendMessage({ type: 'guest_control_config', allowed });
});

$('input-token').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });

// ── 历史房间 ──────────────────────────────────────
async function renderHistory() {
  const { joinHistory = [] } = await new Promise(r => chrome.storage.local.get({ joinHistory: [] }, r));
  const section = $('history-section');
  const listEl  = $('history-list');
  if (!section || !listEl || !joinHistory.length) return;

  section.style.display = '';
  listEl.innerHTML = joinHistory.map((entry, i) => {
    const platLabel = entry.platform === 'youtube' ? 'YouTube' : 'Bilibili';
    const subText   = entry.title ? escHtml(entry.title) : platLabel;
    return `
      <div class="history-item">
        <div class="history-info">
          <span class="history-dot" id="hd-${i}" title="${t('history_checking')}"></span>
          <div class="history-text">
            <div class="history-host">${escHtml(entry.hostName || '—')}</div>
            <div class="history-sub">${subText} · ${timeAgo(entry.joinedAt)}</div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-icon" id="hcopy-${i}" title="${t('history_copy_code')}">⎘</button>
          <button class="history-join" id="hjoin-${i}">${t('history_join_btn')}</button>
        </div>
      </div>`;
  }).join('');

  joinHistory.forEach((entry, i) => {
    $(`hcopy-${i}`)?.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.token).then(() => {
        const btn = $(`hcopy-${i}`);
        if (!btn) return;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⎘'; }, 1500);
      });
    });
    $(`hjoin-${i}`)?.addEventListener('click', () => {
      $('input-token').value = entry.token;
      $('btn-join').click();
    });
  });

  // 并行检查在线状态
  const serverUrl = await getServerUrl();
  const checks = joinHistory.map((entry, i) =>
    fetch(`${serverUrl}/wt/room/check?token=${encodeURIComponent(entry.token)}`,
      { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(data => ({ i, exists: !!data.exists }))
      .catch(() => ({ i, exists: false }))
  );
  const results = await Promise.all(checks);
  results.forEach(({ i, exists }) => {
    const dot  = $(`hd-${i}`);
    const join = $(`hjoin-${i}`);
    if (dot)  { dot.className  = `history-dot ${exists ? 'online' : 'offline'}`; dot.title = t(exists ? 'history_online' : 'history_offline'); }
    if (join) { if (!exists) join.classList.add('offline'); }
  });
}

init();
