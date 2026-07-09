// background.js - Service Worker
const WT_SERVERS = {
  overseas: 'https://streamforsoul.com:8443',
  mainland: 'https://cn.streamforsoul.com',
};
const DEFAULT_SERVER_REGION = 'overseas';
const ROOM_SESSION_KEY = 'wtCurrentRoom';
const KEEPALIVE_ALARM = 'wtKeepAlive';

let ws = null;
let wsState = 'disconnected'; // disconnected | connecting | connected | reconnecting
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;
let reconnectTimer = null;
let currentRoom = null;
let mySid = null;
let activeTabId = null;
let _cachedClientId = null;
let _pendingTransferCallback = null;
let _pendingConnectCallback = null;
let _pendingConnectTimer = null;
let _pendingCatchUpTabId = null;
let debugLog = [];

function addDebugLog(event, detail = '') {
  const line = {
    at: new Date().toISOString().slice(11, 19),
    event,
    detail: String(detail || '').slice(0, 120),
  };
  debugLog.unshift(line);
  debugLog = debugLog.slice(0, 20);
}

function isRoomJoined() {
  return currentRoom?.connectionState === 'joined';
}

function finishPendingConnect(result) {
  if (_pendingConnectTimer) {
    clearTimeout(_pendingConnectTimer);
    _pendingConnectTimer = null;
  }
  if (_pendingConnectCallback) {
    const cb = _pendingConnectCallback;
    _pendingConnectCallback = null;
    cb(result);
  }
}

function persistCurrentRoom() {
  if (!currentRoom) return;
  const roomState = { ...currentRoom };
  delete roomState.activeTabId;
  chrome.storage.local.set({
    [ROOM_SESSION_KEY]: {
      ...roomState,
      activeTabId,
      _wasReconnecting: false,
    },
  });
}

function clearRoomSession() {
  chrome.storage.local.remove(ROOM_SESSION_KEY);
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

function startKeepAliveAlarm() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
}

async function loadStoredRoom() {
  return new Promise(resolve => {
    chrome.storage.local.get({ [ROOM_SESSION_KEY]: null }, data => resolve(data[ROOM_SESSION_KEY]));
  });
}

async function keepAliveOrReconnect() {
  if (!currentRoom) {
    const storedRoom = await loadStoredRoom();
    if (storedRoom?.roomId && storedRoom?.nickname) {
      activeTabId = storedRoom.activeTabId ?? null;
      currentRoom = { ...storedRoom, members: storedRoom.members || [], connectionState: 'pending', _wasReconnecting: true };
      addDebugLog('restore_session', storedRoom.roomId);
    }
  }
  if (!currentRoom) {
    chrome.alarms.clear(KEEPALIVE_ALARM);
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    wsSend({ type: 'heartbeat' });
    return;
  }
  if (wsState === 'connecting' || wsState === 'reconnecting') return;
  if (currentRoom.roomId && currentRoom.nickname) {
    reconnectAttempts = 0;
    currentRoom._wasReconnecting = true;
    connectWS(currentRoom.roomId, currentRoom.nickname);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const clientId = _generateUUID();
    const nickname = _generateNickname('en');
    chrome.storage.local.set({ clientId, nickname, nicknameAuto: true, nicknameLang: 'en', firstRun: true, showBubble: true });
  }
});

chrome.runtime.onStartup?.addListener(() => {
  loadStoredRoom().then(storedRoom => {
    if (storedRoom?.roomId && storedRoom?.nickname) {
      startKeepAliveAlarm();
      keepAliveOrReconnect();
    }
  });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM) keepAliveOrReconnect();
});

chrome.idle?.setDetectionInterval(60);
chrome.idle?.onStateChanged.addListener(state => {
  if (state === 'active') {
    addDebugLog('screen_active');
    keepAliveOrReconnect();
  }
});

const roomRestorePromise = keepAliveOrReconnect();

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

function normalizeServerRegion(region) {
  return WT_SERVERS[region] ? region : DEFAULT_SERVER_REGION;
}

function resolveServerUrl(settings, overrideRegion = '') {
  const rawUrl = (settings.serverUrl || '').trim().replace(/\/+$/, '');
  const storedRegion = settings.serverRegion || (rawUrl ? 'custom' : DEFAULT_SERVER_REGION);
  if (overrideRegion && WT_SERVERS[overrideRegion]) return WT_SERVERS[overrideRegion];
  if (storedRegion === 'custom' && rawUrl) return rawUrl;
  return WT_SERVERS[normalizeServerRegion(storedRegion)];
}

function getOriginPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `${u.origin}/*`;
  } catch (_) {
    return '';
  }
}

async function hasServerPermission(settings) {
  if (settings.serverRegion !== 'custom') return true;
  const origin = getOriginPattern(settings.serverUrl);
  if (!origin) return false;
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [origin] }, resolve);
  });
}

async function requireServerPermission(settings) {
  if (await hasServerPermission(settings)) return;
  throw new Error('Permission required for custom server. Open Settings and authorize this server URL.');
}

async function getSettings(overrideRegion = '') {
  return new Promise(resolve => {
    chrome.storage.local.get({ serverRegion: '', serverUrl: '', nickname: '', serverToken: '' }, s => {
      const rawServerUrl = (s.serverUrl || '').trim().replace(/\/+$/, '');
      const effectiveRegion = overrideRegion && WT_SERVERS[overrideRegion]
        ? overrideRegion
        : (s.serverRegion || (rawServerUrl ? 'custom' : DEFAULT_SERVER_REGION));
      s.serverRegion = WT_SERVERS[effectiveRegion] ? effectiveRegion : (effectiveRegion === 'custom' ? 'custom' : DEFAULT_SERVER_REGION);
      s.rawServerUrl = rawServerUrl;
      s.serverUrl = resolveServerUrl(s, overrideRegion);
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

  const [s, clientId] = await Promise.all([getSettings(currentRoom?.serverRegion || ''), getClientId()]);
  try {
    await requireServerPermission(s);
  } catch (e) {
    console.error('[WT] server permission error:', e);
    wsState = 'disconnected';
    _broadcastStatus('disconnected');
    finishPendingConnect({ ok: false, error: e.message || 'permission_required' });
    currentRoom = null; mySid = null; activeTabId = null;
    clearRoomSession();
    _broadcastToAllVideoTabs({ type: 'self_left_room' });
    return;
  }
  const wsUrl = s.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  const wsParams = new URLSearchParams({ room_id: roomId });
  if (s.serverToken) wsParams.set('client_token', s.serverToken);

  console.log('[WT] Connecting to WS:', wsUrl, 'room:', roomId, 'name:', name);

  try {
    ws = new WebSocket(`${wsUrl}/wt/ws?${wsParams.toString()}`);
  } catch (e) {
    console.error('[WT] WS create failed:', e);
    wsState = 'disconnected';
    _broadcastStatus('disconnected');
    finishPendingConnect({ ok: false, error: e.message || 'connect_failed' });
    currentRoom = null; mySid = null; activeTabId = null;
    clearRoomSession();
    _broadcastToAllVideoTabs({ type: 'self_left_room' });
    return;
  }

  ws.onopen = () => {
    addDebugLog('ws_open', roomId);
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
    persistCurrentRoom();
    startKeepAliveAlarm();
    _broadcastStatus('connected');
  };

  ws.onmessage = (e) => {
    try { handleServerMessage(JSON.parse(e.data)); }
    catch (err) { console.error('[WT] parse error', err); }
  };

  ws.onclose = (e) => {
    console.log('[WT] WS closed, code:', e.code, 'attempts:', reconnectAttempts);
    addDebugLog('ws_close', `code=${e.code}`);
    wsState = 'disconnected';
    _pendingCatchUpTabId = null;

    if (_pendingTransferCallback) {
      const cb = _pendingTransferCallback;
      _pendingTransferCallback = null;
      cb({ ok: false, error: 'connection_lost' });
    }

    _broadcastStatus('disconnected');

    if (e.code === 4000) {
      finishPendingConnect({ ok: false, error: 'closed' });
      return;
    }
    if (!currentRoom) return;

    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      wsState = 'reconnecting';
      _broadcastStatus('reconnecting');
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      console.log('[WT] Will reconnect in', delay, 'ms');
      addDebugLog('reconnect_scheduled', `attempt=${reconnectAttempts} delay=${delay}`);
      if (currentRoom) currentRoom._wasReconnecting = true;
      reconnectTimer = setTimeout(() => connectWS(roomId, name), delay);
    } else if (currentRoom?.connectionState === 'joined' || currentRoom?._wasReconnecting) {
      console.log('[WT] Fast reconnect attempts exhausted; keeping room recovery state');
      addDebugLog('reconnect_exhausted', `attempts=${reconnectAttempts}`);
      finishPendingConnect({ ok: false, error: 'connection_timeout' });
      currentRoom.connectionState = 'recovering';
      currentRoom._wasReconnecting = true;
      persistCurrentRoom();
      startKeepAliveAlarm();
      _broadcastStatus('reconnecting');
    } else {
      finishPendingConnect({ ok: false, error: 'connection_timeout' });
      currentRoom = null; mySid = null; activeTabId = null;
      clearRoomSession();
      _broadcastToAllVideoTabs({ type: 'self_left_room' });
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
  _pendingCatchUpTabId = null;
  currentRoom = null;
  mySid = null;
  activeTabId = null;
  clearRoomSession();
}

function closeLostRoomSocket() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = MAX_RECONNECT;
  if (ws) {
    ws.onclose = null;
    try { ws.close(4001, 'room lost'); } catch (_) {}
    ws = null;
  }
  wsState = 'disconnected';
  _pendingCatchUpTabId = null;
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  addDebugLog('send_failed', msg?.type || '');
  if (currentRoom) {
    _broadcastStatus('reconnecting');
    keepAliveOrReconnect();
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

function sendToTab(tabId, msg) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function setActiveRoomTab(tabId) {
  if (tabId == null || tabId === activeTabId) return;
  const oldTabId = activeTabId;
  activeTabId = tabId;
  persistCurrentRoom();
  sendToTab(oldTabId, { type: 'lost_active_tab' });
  sendToTab(activeTabId, { type: 'became_active_tab' });
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
      addDebugLog('welcome', msg.is_host ? 'host' : 'guest');
      mySid = msg.sid;
      if (currentRoom) {
        currentRoom.isHost = msg.is_host;
        currentRoom.connectionState = 'joined';
      }
      persistCurrentRoom();
      finishPendingConnect({ ok: true, isHost: msg.is_host, sid: msg.sid });
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
      addDebugLog('kicked', msg.reason || '');
      wsState = 'disconnected';
      finishPendingConnect({ ok: false, error: msg.reason || 'kicked' });
      currentRoom = null; mySid = null; activeTabId = null;
      clearRoomSession();
      _broadcastToAllVideoTabs({ type: 'ws_status', status: 'disconnected' });
      _broadcastToAllVideoTabs({ type: 'self_left_room' });
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
      sendToTab(_pendingCatchUpTabId ?? activeTabId, {
        type: 'catch_up_result',
        seekTime: msg.seek_time,
        paused: msg.paused,
        videoId: msg.video_id,
        platform: msg.platform,
      });
      _pendingCatchUpTabId = null;
      break;

    case 'catch_up_error':
      sendToTab(_pendingCatchUpTabId ?? activeTabId, {
        type: 'catch_up_error',
        reason: msg.reason || 'host_video_unavailable',
      });
      _pendingCatchUpTabId = null;
      break;

    case 'sync_all_result':
      sendToActiveTab({ type: 'sync_all_result', count: msg.count || 0 });
      break;

    case 'sync_all_error':
      sendToActiveTab({
        type: 'sync_all_error',
        reason: msg.reason || 'invalid_host_video',
      });
      break;

    case 'host_switched':
      if (currentRoom) {
        currentRoom.videoId = msg.video_id;
        currentRoom.platform = msg.platform;
        currentRoom.hostSearching = false;
        persistCurrentRoom();
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
      if (currentRoom) {
        currentRoom.hostSearching = true;
        persistCurrentRoom();
      }
      sendToActiveTab({ type: 'host_searching' });
      break;

    case 'host_reconnecting':
      addDebugLog('host_reconnecting', msg.host_name || '');
      _broadcastToAllVideoTabs({ type: 'host_reconnecting', hostName: msg.host_name });
      break;

    case 'host_reconnected':
      addDebugLog('host_reconnected', msg.host_name || '');
      _broadcastToAllVideoTabs({ type: 'host_reconnected', hostName: msg.host_name });
      break;

    case 'room_lost':
      if (msg.room_id && currentRoom?.roomId && msg.room_id !== currentRoom.roomId) {
        addDebugLog('stale_room_lost_ignored', msg.room_id);
        break;
      }
      addDebugLog('room_lost', msg.reason || msg.host_name || '');
      finishPendingConnect({ ok: false, error: 'room_lost' });
      sendToActiveTab({ type: 'room_lost', hostName: msg.host_name, reason: msg.reason || '' });
      _broadcastToAllVideoTabs({ type: 'room_dissolved', hostName: msg.host_name, reason: msg.reason || '' });
      closeLostRoomSocket();
      currentRoom = null; mySid = null; activeTabId = null;
      clearRoomSession();
      break;

    case 'you_are_guest':
      if (currentRoom) {
        currentRoom.isHost = false;
        currentRoom.hostName = msg.new_host_name || currentRoom.hostName;
        if (currentRoom.token) {
          addToJoinHistory({
            token: currentRoom.token,
            hostName: currentRoom.hostName || '',
            platform: currentRoom.platform || '',
            videoId: currentRoom.videoId || '',
            title: currentRoom.title || '',
            serverRegion: currentRoom.serverRegion || '',
          });
        }
        persistCurrentRoom();
      }
      if (_pendingTransferCallback) {
        const cb = _pendingTransferCallback;
        _pendingTransferCallback = null;
        cb({ ok: true, newHostName: msg.new_host_name });
      }
      break;

    case 'error':
      if (_pendingTransferCallback) {
        const cb = _pendingTransferCallback;
        _pendingTransferCallback = null;
        cb({ ok: false, error: msg.message });
      } else {
        const wasEstablished = currentRoom?.connectionState === 'joined' || currentRoom?._wasReconnecting;
        finishPendingConnect({ ok: false, error: msg.message || 'connect_failed' });
        addDebugLog('server_error', msg.message || '');
        if (wasEstablished) {
          _broadcastToAllVideoTabs({
            type: 'room_lost',
            hostName: currentRoom?.hostName || currentRoom?.nickname || '',
            reason: msg.message === 'room not found' ? 'room_timeout' : 'room_unavailable',
            autoLeave: true,
          });
        } else {
          _broadcastToAllVideoTabs({ type: 'self_left_room' });
        }
        closeLostRoomSocket();
        currentRoom = null; mySid = null; activeTabId = null;
        clearRoomSession();
      }
      break;

    case 'host_changed': {
      const iAmNewHost = mySid === msg.new_host_sid;
      if (currentRoom) {
        currentRoom.hostName = msg.new_host_name;
        if (iAmNewHost) currentRoom.isHost = true;
        if (currentRoom.members) {
          currentRoom.members = currentRoom.members.map(m => ({
            ...m,
            is_host: m.sid === msg.new_host_sid,
          }));
        }
        persistCurrentRoom();
      }
      sendToActiveTab({
        type: 'host_changed',
        newHostSid: msg.new_host_sid,
        newHostName: msg.new_host_name,
        oldHostName: msg.old_host_name,
        iAmNewHost,
      });
      break;
    }

    case 'member_joined':
      if (currentRoom?.members) {
        if (!currentRoom.members.find(m => m.sid === msg.sid)) {
          currentRoom.members.push({ sid: msg.sid, name: msg.name, is_host: false });
          persistCurrentRoom();
        }
      }
      break;

    case 'member_left':
      if (currentRoom?.members) {
        currentRoom.members = currentRoom.members.filter(m => m.sid !== msg.sid);
        persistCurrentRoom();
      }
      break;

    case 'member_list':
      addDebugLog('member_list', `${msg.count || 0} members`);
      if (currentRoom) {
        currentRoom.members = msg.members;
        persistCurrentRoom();
      }
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
        token: msg.token || msg.joinToken || null,
        isHost: msg.isHost,
        hostName: msg.hostName || null,
        videoId: msg.videoId || null,
        platform: msg.platform || null,
        title: msg.title || '',
        nickname: msg.nickname || '',
        vetoEnabled: false,
        vetoSeconds: 5,
        guestControlAllowed: false,
        members: [],
        hostSearching: msg.hostSearching || false,
        serverRegion: msg.serverRegion || null,
        connectionState: 'pending',
        _wasReconnecting: false,
      };
      if (!msg.isHost && msg.joinToken) {
        addToJoinHistory({
          token: msg.joinToken,
          hostName: msg.hostName || '',
          platform: msg.platform || '',
          videoId: msg.videoId || '',
          title: msg.title || '',
          serverRegion: msg.serverRegion || '',
        });
      }
      reconnectAttempts = 0;
      persistCurrentRoom();
      startKeepAliveAlarm();
      finishPendingConnect({ ok: false, error: 'replaced_by_new_connect' });
      _pendingConnectCallback = sendResponse;
      _pendingConnectTimer = setTimeout(() => {
        finishPendingConnect({ ok: false, error: 'connection_timeout' });
        if (currentRoom?.connectionState !== 'joined') {
          currentRoom = null; mySid = null; activeTabId = null;
          clearRoomSession();
          _broadcastToAllVideoTabs({ type: 'self_left_room' });
        }
      }, 20000);
      connectWS(msg.roomId, msg.nickname);
      return true;

    case 'leave_room':
      disconnectWS();
      _broadcastToAllVideoTabs({ type: 'self_left_room' });
      sendResponse({ ok: true });
      break;

    case 'get_status':
      roomRestorePromise.finally(() => {
        sendResponse({ wsState, currentRoom, mySid, activeTabId, debugLog });
      });
      return true;

    case 'check_is_active_tab':
      roomRestorePromise.finally(() => {
        sendResponse({
          isActiveTab: sender.tab?.id === activeTabId,
          inRoom: isRoomJoined(),
          isHost: isRoomJoined() ? currentRoom?.isHost || false : false,
          hostSearching: currentRoom?.hostSearching || false,
        });
      });
      return true;

    case 'sync_action':
      if (isRoomJoined()) {
        const seekTime = msg.seekTime || 0;
        if (isFinite(seekTime) && seekTime >= 0) {
          sendResponse({ ok: wsSend({ type: 'sync_action', action: msg.action, seek_time: seekTime }) });
          break;
        }
      }
      sendResponse({ ok: false, error: 'not_connected' });
      break;

    case 'veto':
      sendResponse({ ok: isRoomJoined() && wsSend({ type: 'veto' }) });
      break;

    case 'catch_up':
      if (!isRoomJoined()) {
        sendResponse({ ok: false, error: 'not_connected' });
        break;
      }
      if (currentRoom?.hostSearching) {
        sendResponse({ ok: false, error: 'host_video_unavailable' });
        break;
      }
      _pendingCatchUpTabId = msg.tabId || sender.tab?.id || activeTabId;
      if (_pendingCatchUpTabId == null) {
        sendResponse({ ok: false, error: 'no_target_tab' });
        break;
      }
      if (!currentRoom?.isHost) setActiveRoomTab(_pendingCatchUpTabId);
      if (!wsSend({ type: 'catch_up' })) {
        _pendingCatchUpTabId = null;
        sendResponse({ ok: false, error: 'not_connected' });
        break;
      }
      addDebugLog('catch_up_sent', `tab=${_pendingCatchUpTabId}`);
      sendResponse({ ok: true });
      break;

    case 'position_update':
      if (isRoomJoined() && currentRoom?.isHost) {
        wsSend({ type: 'position_update', seek_time: msg.currentTime, action: msg.paused ? 'paused' : 'playing' });
      }
      break;

    case 'video_changed':
      if (isRoomJoined() && currentRoom?.isHost) {
        if (msg.videoId) {
          currentRoom.hostSearching = false;
          currentRoom.videoId = msg.videoId;
          currentRoom.platform = msg.platform;
          persistCurrentRoom();
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
          persistCurrentRoom();
          wsSend({ type: 'host_searching' });
        }
      }
      break;

    case 'veto_config':
      if (isRoomJoined()) wsSend({ type: 'veto_config', action: msg.enabled ? 'true' : 'false', seek_time: msg.seconds });
      if (currentRoom) { currentRoom.vetoEnabled = msg.enabled; currentRoom.vetoSeconds = msg.seconds; persistCurrentRoom(); }
      break;

    case 'guest_control_config':
      if (isRoomJoined()) wsSend({ type: 'guest_control_config', allowed: msg.allowed });
      if (currentRoom) { currentRoom.guestControlAllowed = msg.allowed; persistCurrentRoom(); }
      break;

    case 'api_create_room':
      (async () => {
        try {
          const [s, clientId] = await Promise.all([getSettings(msg.serverRegion || ''), getClientId()]);
          await requireServerPermission(s);
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
          data.serverRegion = s.serverRegion;
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || 'Network error' });
        }
      })();
      return true;

    case 'api_join_room':
      (async () => {
        try {
          const s = await getSettings(msg.serverRegion || '');
          await requireServerPermission(s);
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
          data.serverRegion = s.serverRegion;
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || 'Network error' });
        }
      })();
      return true; // async

    case 'take_active_tab': {
      if (!isRoomJoined() || !currentRoom?.isHost) { sendResponse({ ok: false, error: 'not_host' }); break; }
      const newTabId = sender.tab?.id || null;
      const oldTabId = activeTabId;
      if (oldTabId && oldTabId !== newTabId) {
        chrome.tabs.sendMessage(oldTabId, { type: 'self_left_room' }).catch(() => {});
      }
      activeTabId = newTabId;
      persistCurrentRoom();
      sendResponse({ ok: true });
      break;
    }

    case 'sync_all':
      if (!isRoomJoined() || !currentRoom?.isHost) {
        sendResponse({ ok: false, error: 'not_host' });
        break;
      }
      if (!msg.videoId || !['youtube', 'bilibili'].includes(msg.platform) ||
          !Number.isFinite(msg.currentTime) || msg.currentTime < 0) {
        sendResponse({ ok: false, error: 'invalid_host_video' });
        break;
      }
      setActiveRoomTab(msg.tabId || sender.tab?.id || activeTabId);
      currentRoom.videoId = msg.videoId;
      currentRoom.platform = msg.platform;
      currentRoom.hostSearching = false;
      persistCurrentRoom();
      sendResponse({
        ok: wsSend({
          type: 'sync_all',
          video_id: msg.videoId,
          platform: msg.platform,
          is_live: !!msg.isLive,
          seek_time: msg.currentTime,
          action: msg.paused ? 'paused' : 'playing',
        }),
      });
      break;

    case 'transfer_host': {
      if (!isRoomJoined() || !currentRoom?.isHost) { sendResponse({ ok: false, error: 'not_host' }); break; }
      const sent = wsSend({ type: 'transfer_host', target_sid: msg.targetSid });
      if (!sent) { sendResponse({ ok: false, error: 'not_connected' }); break; }
      _pendingTransferCallback = sendResponse;
      return true;
    }

    case 'api_check_room':
      (async () => {
        try {
          const s = await getSettings(msg.serverRegion || '');
          await requireServerPermission(s);
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
      getSettings(msg.serverRegion || '').then(s => sendResponse({ url: s.serverUrl, region: s.serverRegion }));
      return true;

    case 'set_server_region':
      if (msg.serverRegion && WT_SERVERS[msg.serverRegion]) {
        chrome.storage.local.set({ serverRegion: msg.serverRegion }, () => sendResponse({ ok: true }));
        return true;
      }
      sendResponse({ ok: false });
      break;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== activeTabId || !currentRoom) return;
  if (currentRoom.isHost) {
    console.log('[WT] Host active tab closed, keeping room alive, marking host searching');
    activeTabId = null;
    currentRoom.hostSearching = true;
    persistCurrentRoom();
    wsSend({ type: 'host_searching' });
  } else {
    console.log('[WT] Guest active tab closed, leaving room');
    disconnectWS();
    _broadcastToAllVideoTabs({ type: 'self_left_room' });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || !currentRoom || changeInfo.status !== 'complete') return;
  const url = tab.url || '';
  if (!url || url.startsWith('about:') || url.startsWith('chrome:')) return;
  if (!url.includes('youtube.com') && !url.includes('bilibili.com')) {
    if (currentRoom.isHost) {
      console.log('[WT] Host left video platform, keeping room alive, marking host searching');
      activeTabId = null;
      currentRoom.hostSearching = true;
      persistCurrentRoom();
      wsSend({ type: 'host_searching' });
    } else {
      console.log('[WT] Guest left video platform, leaving room');
      disconnectWS();
      _broadcastToAllVideoTabs({ type: 'self_left_room' });
    }
  }
});
