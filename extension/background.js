// background.js - Service Worker
const DEFAULT_SERVER = 'https://streamforsoul.com:8443';

let ws = null;
let wsState = 'disconnected'; // disconnected | connecting | connected | reconnecting
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;
let reconnectTimer = null;
let currentRoom = null;
let mySid = null;
let activeTabId = null;
let _cachedClientId = null;

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const clientId = _generateUUID();
    const nickname = _generateNickname('en');
    chrome.storage.local.set({ clientId, nickname, nicknameAuto: true, nicknameLang: 'en', firstRun: true, showBubble: true });
  }
});

function _generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _generateNickname(lang) {
  if (lang === 'zh') {
    const adj = ['\u5feb\u4e50', '\u53ef\u7231', '\u9177\u70ab', '\u795e\u79d8', '\u53cb\u5584', '\u6175\u61d2', '\u70ed\u60c5', '\u673a\u667a'];
    const noun = ['\u5c0f\u732b', '\u5927\u8c61', '\u4f01\u9e45', '\u718a\u732b', '\u72d0\u72f8', '\u5154\u5b50', '\u677e\u9f20', '\u6d77\u8c5a'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
  }
  if (lang === 'ja') {
    const adj = ['\u5143\u6c17\u306a', '\u304b\u308f\u3044\u3044', '\u304a\u3057\u3083\u308c\u306a', '\u3075\u3057\u304e\u306a', '\u306e\u3093\u3073\u308a', '\u304b\u3057\u3053\u3044', '\u305f\u306e\u3057\u3044', '\u3084\u3055\u3057\u3044'];
    const noun = ['\u30cd\u30b3', '\u30d1\u30f3\u30c0', '\u30ad\u30c4\u30cd', '\u30a6\u30b5\u30ae', '\u30af\u30de', '\u30bf\u30cc\u30ad', '\u30ea\u30b9', '\u30da\u30f3\u30ae\u30f3'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
  }
  const adj = ['Happy', 'Cool', 'Curious', 'Friendly', 'Lazy', 'Clever', 'Brave', 'Silly'];
  const noun = ['Cat', 'Panda', 'Fox', 'Bunny', 'Bear', 'Wolf', 'Tiger', 'Penguin'];
  return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
}

function _looksAutoNickname(name) {
  if (!name) return false;
  const english = /^(Happy|Cool|Curious|Friendly|Lazy|Clever|Brave|Silly)(Cat|Panda|Fox|Bunny|Bear|Wolf|Tiger|Penguin)$/;
  const chinese = /^(快乐|可爱|酷炫|神秘|友善|慵懒|热情|机智)(小猫|大象|企鹅|熊猫|狐狸|兔子|松鼠|海豚)$/;
  const japanese = /^(元気な|かわいい|おしゃれな|ふしぎな|のんびり|かしこい|たのしい|やさしい)(ネコ|パンダ|キツネ|ウサギ|クマ|タヌキ|リス|ペンギン)$/;
  return english.test(name) || chinese.test(name) || japanese.test(name);
}
async function getClientId() {
  if (_cachedClientId) return _cachedClientId;
  return new Promise(resolve => {
    chrome.storage.local.get({ clientId: '' }, r => {
      if (!r.clientId) {
        const id = _generateUUID();
        chrome.storage.local.set({ clientId: id });
        _cachedClientId = id;
      } else {
        _cachedClientId = r.clientId;
      }
      resolve(_cachedClientId);
    });
  });
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get({ serverUrl: '', nickname: '', serverToken: '' }, s => {
      // Empty serverUrl means "use the built-in default server".
      if (!s.serverUrl) s.serverUrl = DEFAULT_SERVER;
      resolve(s);
    });
  });
}

async function getNickname() {
  return new Promise(resolve => {
    chrome.storage.local.get({ nickname: '', lang: 'en', nicknameAuto: null, nicknameLang: '' }, s => {
      const lang = s.lang || 'en';
      const auto = s.nicknameAuto === true || (s.nicknameAuto === null && _looksAutoNickname(s.nickname));
      if (s.nickname && (!auto || s.nicknameLang === lang)) { resolve(s.nickname); return; }
      const n = _generateNickname(lang);
      chrome.storage.local.set({ nickname: n, nicknameAuto: true, nicknameLang: lang });
      resolve(n);
    });
  });
}

function authHeaders(settings, json = false) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (settings?.serverToken) headers['X-WT-Client-Token'] = settings.serverToken;
  return headers;
}

function addToJoinHistory(entry) {
  chrome.storage.local.get({ joinHistory: [] }, ({ joinHistory }) => {
    const filtered = joinHistory.filter(r => r.token !== entry.token);
    filtered.unshift({ ...entry, joinedAt: Date.now() });
    chrome.storage.local.set({ joinHistory: filtered.slice(0, 5) });
  });
}

async function connectWS(roomId, name) {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  wsState = 'connecting';
  _broadcastStatus('connecting');

  const [s, clientId] = await Promise.all([getSettings(), getClientId()]);
  const wsUrl = s.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  const wsParams = new URLSearchParams({ room_id: roomId });
  if (s.serverToken) wsParams.set('client_token', s.serverToken);

  console.log('[WT] Connecting to WS:', wsUrl, 'room:', roomId, 'name:', name);

  ws = new WebSocket(`${wsUrl}/wt/ws?${wsParams.toString()}`);

  ws.onopen = () => {
    wsState = 'connected';
    const wasReconnecting = currentRoom?._wasReconnecting || false;
    reconnectAttempts = 0;
    const helloMsg = { type: 'hello', name, client_id: clientId };
    ws.send(JSON.stringify(helloMsg));
    console.log('[WT] WS connected, sent hello');

    if (currentRoom?.isHost) {
      if (wasReconnecting) {
        // On reconnect read from persistent storage — currentRoom may have stale/default values
        // if the service worker was suspended and restarted between connections.
        chrome.storage.local.get({ vetoEnabled: false, vetoSeconds: 5, allowGuestControl: false }, s => {
          if (!currentRoom || ws?.readyState !== WebSocket.OPEN) return;
          currentRoom.vetoEnabled = s.vetoEnabled;
          currentRoom.vetoSeconds = s.vetoSeconds;
          currentRoom.guestControlAllowed = s.allowGuestControl;
          ws.send(JSON.stringify({ type: 'veto_config', action: s.vetoEnabled ? 'true' : 'false', seek_time: s.vetoSeconds }));
          ws.send(JSON.stringify({ type: 'guest_control_config', allowed: s.allowGuestControl || false }));
        });
      } else {
        if (currentRoom.vetoEnabled !== undefined) {
          ws.send(JSON.stringify({ type: 'veto_config', action: currentRoom.vetoEnabled ? 'true' : 'false', seek_time: currentRoom.vetoSeconds || 5 }));
        }
        if (currentRoom.guestControlAllowed !== undefined) {
          ws.send(JSON.stringify({ type: 'guest_control_config', allowed: currentRoom.guestControlAllowed }));
        }
      }
    }
    _broadcastStatus('connected');
  };

  ws.onmessage = (e) => {
    try { handleServerMessage(JSON.parse(e.data)); }
    catch (err) { console.error('[WT] parse error', err); }
  };

  ws.onclose = (e) => {
    console.log('[WT] WS closed, code:', e.code, 'attempts:', reconnectAttempts);
    wsState = 'disconnected';
    _broadcastStatus('disconnected');

    if (e.code === 4000) {
      return;
    }
    if (!currentRoom) return;

    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      wsState = 'reconnecting';
      _broadcastStatus('reconnecting');
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      console.log('[WT] Will reconnect in', delay, 'ms');
      if (currentRoom) currentRoom._wasReconnecting = true;
      reconnectTimer = setTimeout(() => connectWS(roomId, name), delay);
    } else {
      console.log('[WT] Reconnect exhausted, leaving room');
      _broadcastToAllVideoTabs({ type: 'room_lost', hostName: '(connection timeout)', autoLeave: true });
      currentRoom = null; mySid = null; activeTabId = null;
    }
  };

  ws.onerror = (e) => { console.error('[WT] WS error', e); };
}

function disconnectWS() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = MAX_RECONNECT;
  if (ws) {
    ws.onclose = null;
    try { ws.send(JSON.stringify({ type: 'leave' })); } catch (_) {}
    ws.close(4000, 'user left');
    ws = null;
  }
  wsState = 'disconnected';
  currentRoom = null;
  mySid = null;
  activeTabId = null;
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function _broadcastStatus(status) {
  sendToActiveTab({ type: 'ws_status', status });
}

function sendToActiveTab(msg) {
  if (activeTabId != null) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  }
}

function _broadcastToAllVideoTabs(msg) {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      const url = tab.url || '';
      if (url.includes('youtube.com') || url.includes('bilibili.com')) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  });
}

function handleServerMessage(msg) {

  switch (msg.type) {
    case 'welcome':
      mySid = msg.sid;
      if (currentRoom) currentRoom.isHost = msg.is_host;
      sendToActiveTab({ type: 'room_joined', isHost: msg.is_host, sid: msg.sid });
      if (!msg.is_host && currentRoom?._wasReconnecting) {
        sendToActiveTab({ type: 'reconnect_catch_up_prompt' });
      }
      if (currentRoom) currentRoom._wasReconnecting = false;
      break;

    case 'ping':
      wsSend({ type: 'pong' });
      break;

    case 'kicked':
      console.log('[WT] Connection kicked:', msg.reason);
      wsState = 'disconnected';
      currentRoom = null; mySid = null; activeTabId = null;
      _broadcastToAllVideoTabs({ type: 'ws_status', status: 'disconnected' });
      break;

    case 'sync_apply':
      sendToActiveTab({
        type: 'sync_apply',
        action: msg.action,
        seekTime: msg.seek_time,
        videoId: msg.video_id,
        platform: msg.platform,
      });
      break;

    case 'sync_opportunity':
      sendToActiveTab({ type: 'sync_opportunity', action: msg.action, seekTime: msg.seek_time, hostName: msg.host_name, delaySeconds: msg.delay_seconds });
      break;

    case 'sync_vetoed':
      sendToActiveTab({ type: 'sync_vetoed', memberName: msg.member_name });
      break;

    case 'catch_up_result':
      sendToActiveTab({
        type: 'catch_up_result',
        seekTime: msg.seek_time,
        paused: msg.paused,
        videoId: msg.video_id,
        platform: msg.platform,
      });
      break;

    case 'host_switched':
      if (currentRoom) {
        currentRoom.videoId = msg.video_id;
        currentRoom.platform = msg.platform;
        currentRoom.hostSearching = false;
      }
      sendToActiveTab({
        type: 'host_switched',
        videoId: msg.video_id,
        platform: msg.platform,
        isLive: msg.is_live,
        hostName: msg.host_name,
        syncAll: msg.sync_all || false,
        seekTime: msg.seek_time,
        paused: msg.paused,
      });
      break;

    case 'host_searching':
      if (currentRoom) currentRoom.hostSearching = true;
      sendToActiveTab({ type: 'host_searching' });
      break;

    case 'host_reconnecting':
      _broadcastToAllVideoTabs({ type: 'host_reconnecting', hostName: msg.host_name });
      break;

    case 'host_reconnected':
      _broadcastToAllVideoTabs({ type: 'host_reconnected', hostName: msg.host_name });
      break;

    case 'room_lost':
      sendToActiveTab({ type: 'room_lost', hostName: msg.host_name });
      _broadcastToAllVideoTabs({ type: 'room_dissolved', hostName: msg.host_name });
      currentRoom = null; mySid = null; activeTabId = null;
      break;

    case 'member_joined':
      if (currentRoom?.members) {
        if (!currentRoom.members.find(m => m.sid === msg.sid)) {
          currentRoom.members.push({ sid: msg.sid, name: msg.name, is_host: false });
        }
      }
      break;

    case 'member_left':
      if (currentRoom?.members) {
        currentRoom.members = currentRoom.members.filter(m => m.sid !== msg.sid);
      }
      break;

    case 'member_list':
      if (currentRoom) currentRoom.members = msg.members;
      sendToActiveTab({ type: 'member_list', members: msg.members, count: msg.count });
      _broadcastToAllVideoTabs({ type: 'member_list', members: msg.members, count: msg.count });
      break;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'connect_room':
      activeTabId = msg.tabId || sender.tab?.id || null;
      currentRoom = {
        roomId: msg.roomId,
        token: msg.token || null,
        isHost: msg.isHost,
        hostName: msg.hostName || null,
        videoId: msg.videoId || null,
        platform: msg.platform || null,
        vetoEnabled: false,
        vetoSeconds: 5,
        guestControlAllowed: false,
        members: [],
        hostSearching: msg.hostSearching || false,
        _wasReconnecting: false,
      };
      if (!msg.isHost && msg.joinToken) {
        addToJoinHistory({
          token: msg.joinToken,
          hostName: msg.hostName || '',
          platform: msg.platform || '',
          videoId: msg.videoId || '',
          title: msg.title || '',
        });
      }
      reconnectAttempts = 0;
      connectWS(msg.roomId, msg.nickname);
      sendResponse({ ok: true });
      break;

    case 'leave_room':
      disconnectWS();
      _broadcastToAllVideoTabs({ type: 'self_left_room' });
      sendResponse({ ok: true });
      break;

    case 'get_status':
      sendResponse({ wsState, currentRoom, mySid, activeTabId });
      break;

    case 'check_is_active_tab':
      sendResponse({
        isActiveTab: sender.tab?.id === activeTabId,
        inRoom: !!currentRoom,
        isHost: currentRoom?.isHost || false,
        hostSearching: currentRoom?.hostSearching || false,
      });
      break;

    case 'sync_action':
      if (currentRoom) {
        const seekTime = msg.seekTime || 0;
        if (isFinite(seekTime) && seekTime >= 0) {
          wsSend({ type: 'sync_action', action: msg.action, seek_time: seekTime });
        }
      }
      break;

    case 'veto':
      wsSend({ type: 'veto' });
      break;

    case 'catch_up':
      wsSend({ type: 'catch_up' });
      break;

    case 'position_update':
      if (currentRoom?.isHost) {
        wsSend({ type: 'position_update', seek_time: msg.currentTime, action: msg.paused ? 'paused' : 'playing' });
      }
      break;

    case 'video_changed':
      if (currentRoom?.isHost) {
        if (msg.videoId) {
          currentRoom.hostSearching = false;
          currentRoom.videoId = msg.videoId;
          currentRoom.platform = msg.platform;
          wsSend({
            type: 'video_changed',
            video_id: msg.videoId,
            platform: msg.platform,
            is_live: msg.isLive || false,
            seek_time: msg.currentTime || 0,
            action: msg.paused ? 'paused' : 'playing',
          });
        } else {
          currentRoom.hostSearching = true;
          wsSend({ type: 'host_searching' });
        }
      }
      break;

    case 'veto_config':
      wsSend({ type: 'veto_config', action: msg.enabled ? 'true' : 'false', seek_time: msg.seconds });
      if (currentRoom) { currentRoom.vetoEnabled = msg.enabled; currentRoom.vetoSeconds = msg.seconds; }
      break;

    case 'guest_control_config':
      wsSend({ type: 'guest_control_config', allowed: msg.allowed });
      if (currentRoom) currentRoom.guestControlAllowed = msg.allowed;
      break;

    case 'api_create_room':
      (async () => {
        try {
          const [s, clientId] = await Promise.all([getSettings(), getClientId()]);
          const res = await fetch(`${s.serverUrl}/wt/room/create`, {
            method: 'POST',
            headers: authHeaders(s, true),
            body: JSON.stringify({
              host_name: msg.nickname,
              client_id: clientId,
              video_id: msg.videoId || '',
              platform: msg.platform || '',
              title: msg.title || '',
              current_time: msg.currentTime || 0,
              paused: msg.paused !== false,
              is_live: msg.isLive || false,
            }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            sendResponse({ ok: false, error: e.error || 'Create failed' });
            return;
          }
          const data = await res.json();
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || 'Network error' });
        }
      })();
      return true;

    case 'api_join_room':
      (async () => {
        try {
          const s = await getSettings();
          const res = await fetch(`${s.serverUrl}/wt/room/join`, {
            method: 'POST',
            headers: authHeaders(s, true),
            body: JSON.stringify({ token: msg.token, guest_name: msg.nickname, client_id: await getClientId() }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            sendResponse({ ok: false, error: e.error || `Request failed (${res.status})` });
            return;
          }
          const data = await res.json();
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || 'Network error' });
        }
      })();
      return true; // async

    case 'take_active_tab': {
      if (!currentRoom?.isHost) { sendResponse({ ok: false, error: 'not_host' }); break; }
      const newTabId = sender.tab?.id || null;
      const oldTabId = activeTabId;
      if (oldTabId && oldTabId !== newTabId) {
        chrome.tabs.sendMessage(oldTabId, { type: 'self_left_room' }).catch(() => {});
      }
      activeTabId = newTabId;
      sendResponse({ ok: true });
      break;
    }

    case 'sync_all':
      wsSend({ type: 'sync_all' });
      break;

    case 'api_check_room':
      (async () => {
        try {
          const s = await getSettings();
          const res = await fetch(
            `${s.serverUrl}/wt/room/check?token=${encodeURIComponent(msg.token)}`,
            { headers: authHeaders(s), signal: AbortSignal.timeout(5000) }
          );
          const data = await res.json();
          sendResponse({ ok: true, data });
        } catch (_) {
          sendResponse({ ok: false });
        }
      })();
      return true;

    case 'get_client_id':
      getClientId().then(id => sendResponse({ clientId: id }));
      return true;

    case 'get_nickname':
      getNickname().then(n => sendResponse({ nickname: n }));
      return true;

    case 'get_effective_server_url':
      getSettings().then(s => sendResponse({ url: s.serverUrl }));
      return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId && currentRoom) {
    console.log('[WT] Active tab closed, leaving room');
    disconnectWS();
    _broadcastToAllVideoTabs({ type: 'self_left_room' });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || !currentRoom || changeInfo.status !== 'complete') return;
  const url = tab.url || '';
  if (!url || url.startsWith('about:') || url.startsWith('chrome:')) return;
  if (!url.includes('youtube.com') && !url.includes('bilibili.com')) {
    console.log('[WT] Host left video platform, dissolving room');
    disconnectWS();
    _broadcastToAllVideoTabs({ type: 'self_left_room' });
  }
});
