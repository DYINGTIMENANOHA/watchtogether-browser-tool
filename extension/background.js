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

// ── 首次安装初始化 ─────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const clientId = _generateUUID();
    const nickname = _generateNickname();
    chrome.storage.local.set({ clientId, nickname, firstRun: true, showBubble: true });
    console.log('[WT] Installed. clientId:', clientId, 'nickname:', nickname);
  }
});

function _generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _generateNickname() {
  const adj = ['快乐', '可爱', '酷炫', '神秘', '友善', '慵懒', '热情', '机智'];
  const noun = ['小猫', '大象', '企鹅', '熊猫', '狐狸', '兔子', '松鼠', '海豚'];
  return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
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
    chrome.storage.local.get({ serverUrl: '', nickname: '' }, s => {
      // 空字符串 = 用户未填，回退到代码里写死的默认服务器
      if (!s.serverUrl) s.serverUrl = DEFAULT_SERVER;
      resolve(s);
    });
  });
}

async function getNickname() {
  const s = await getSettings();
  if (s.nickname) return s.nickname;
  // 没有昵称则生成并保存
  const n = _generateNickname();
  chrome.storage.local.set({ nickname: n });
  return n;
}

// ── WebSocket ─────────────────────────────────────
async function connectWS(roomId, name) {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  wsState = 'connecting';
  _broadcastStatus('connecting');

  const [s, clientId] = await Promise.all([getSettings(), getClientId()]);
  const wsUrl = s.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  console.log('[WT] Connecting to WS:', wsUrl, 'room:', roomId, 'name:', name);

  ws = new WebSocket(`${wsUrl}/wt/ws?room_id=${roomId}`);

  ws.onopen = () => {
    wsState = 'connected';
    reconnectAttempts = 0;
    const helloMsg = { type: 'hello', name, client_id: clientId };
    ws.send(JSON.stringify(helloMsg));
    console.log('[WT] WS connected, sent hello');

    // 重连后重新发送配置
    if (currentRoom?.isHost) {
      if (currentRoom.vetoEnabled !== undefined) {
        ws.send(JSON.stringify({ type: 'veto_config', action: currentRoom.vetoEnabled ? 'true' : 'false', seek_time: currentRoom.vetoSeconds || 5 }));
      }
      if (currentRoom.guestControlAllowed !== undefined) {
        ws.send(JSON.stringify({ type: 'guest_control_config', allowed: currentRoom.guestControlAllowed }));
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
      // 主动退出，不重连
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
      // 重连耗尽，退出房间
      console.log('[WT] Reconnect exhausted, leaving room');
      _broadcastToAllVideoTabs({ type: 'room_lost', hostName: '（连接超时）', autoLeave: true });
      currentRoom = null; mySid = null; activeTabId = null;
    }
  };

  ws.onerror = (e) => { console.error('[WT] WS error', e); };
}

function disconnectWS() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = MAX_RECONNECT; // 阻止自动重连
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

// ── 服务器消息处理 ─────────────────────────────────
function handleServerMessage(msg) {
  console.debug('[WT] server →', msg.type, msg);

  switch (msg.type) {
    case 'welcome':
      mySid = msg.sid;
      if (currentRoom) currentRoom.isHost = msg.is_host;
      sendToActiveTab({ type: 'room_joined', isHost: msg.is_host, sid: msg.sid });
      // 如果是重连后的 welcome（reconnectAttempts > 0 时），提示追上
        // 重连成功后提示追上（非房主）
      if (!msg.is_host && currentRoom?._wasReconnecting) {
        sendToActiveTab({ type: 'reconnect_catch_up_prompt' });
      }
      if (currentRoom) currentRoom._wasReconnecting = false;
      break;

    case 'ping':
      wsSend({ type: 'pong' });
      break;

    case 'kicked':
      // 该连接被新连接踢掉（不应该发生在正常流程中，但作为防护）
      console.log('[WT] Connection kicked:', msg.reason);
      wsState = 'disconnected';
      currentRoom = null; mySid = null; activeTabId = null;
      _broadcastToAllVideoTabs({ type: 'ws_status', status: 'disconnected' });
      break;

    case 'sync_apply':
      sendToActiveTab({ type: 'sync_apply', action: msg.action, seekTime: msg.seek_time });
      break;

    case 'sync_opportunity':
      sendToActiveTab({ type: 'sync_opportunity', action: msg.action, seekTime: msg.seek_time, hostName: msg.host_name, delaySeconds: msg.delay_seconds });
      break;

    case 'sync_vetoed':
      sendToActiveTab({ type: 'sync_vetoed', memberName: msg.member_name });
      break;

    case 'catch_up_result':
      sendToActiveTab({ type: 'catch_up_result', seekTime: msg.seek_time, paused: msg.paused });
      break;

    case 'host_switched':
      if (currentRoom) {
        currentRoom.videoId = msg.video_id;
        currentRoom.platform = msg.platform;
        currentRoom.hostSearching = false;
      }
      sendToActiveTab({ type: 'host_switched', videoId: msg.video_id, platform: msg.platform, isLive: msg.is_live, hostName: msg.host_name });
      break;

    case 'host_searching':
      if (currentRoom) currentRoom.hostSearching = true;
      sendToActiveTab({ type: 'host_searching' });
      break;

    case 'host_reconnecting':
      sendToActiveTab({ type: 'host_reconnecting', hostName: msg.host_name });
      _broadcastToAllVideoTabs({ type: 'host_reconnecting', hostName: msg.host_name });
      break;

    case 'host_reconnected':
      sendToActiveTab({ type: 'host_reconnected', hostName: msg.host_name });
      _broadcastToAllVideoTabs({ type: 'host_reconnected', hostName: msg.host_name });
      break;

    case 'room_lost':
      sendToActiveTab({ type: 'room_lost', hostName: msg.host_name });
      _broadcastToAllVideoTabs({ type: 'room_dissolved', hostName: msg.host_name });
      currentRoom = null; mySid = null; activeTabId = null;
      break;

    case 'member_joined':
      if (currentRoom?.members) {
        // 避免重复
        if (!currentRoom.members.find(m => m.sid === msg.sid)) {
          currentRoom.members.push({ sid: msg.sid, name: msg.name, is_host: false });
        }
      }
      sendToActiveTab({ type: 'member_joined', sid: msg.sid, name: msg.name });
      break;

    case 'member_left':
      if (currentRoom?.members) {
        currentRoom.members = currentRoom.members.filter(m => m.sid !== msg.sid);
      }
      sendToActiveTab({ type: 'member_left', sid: msg.sid, name: msg.name });
      break;

    case 'member_list':
      if (currentRoom) currentRoom.members = msg.members;
      sendToActiveTab({ type: 'member_list', members: msg.members, count: msg.count });
      // 非主页面也要收到，用于更新悬浮面板
      _broadcastToAllVideoTabs({ type: 'member_list', members: msg.members, count: msg.count });
      break;
  }
}

// ── 消息监听 ───────────────────────────────────────
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
      reconnectAttempts = 0;
      connectWS(msg.roomId, msg.nickname);
      sendResponse({ ok: true });
      break;

    case 'leave_room':
      disconnectWS();
      // 通知所有视频 tab 清除状态，解决多 tab 状态不一致问题
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

    case 'move_active_tab':
      if (currentRoom?.isHost) {
        const oldTabId = activeTabId;
        activeTabId = sender.tab?.id || null;
        sendResponse({ ok: true });
        sendToActiveTab({ type: 'became_active_tab' });
        if (oldTabId && oldTabId !== activeTabId) {
          chrome.tabs.sendMessage(oldTabId, { type: 'lost_active_tab' }).catch(() => {});
        }
      } else {
        sendResponse({ ok: false });
      }
      break;

    case 'sync_action':
      // 不在客户端校验 isHost/guestControlAllowed，直接转发给服务器
      // 服务器端已有完整鉴权：sid == HostSID || room.GuestControlAllowed
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
          wsSend({ type: 'video_changed', video_id: msg.videoId, platform: msg.platform, is_live: msg.isLive || false });
        } else {
          // 房主在找视频
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

    // content.js 请求创建房间
    case 'api_create_room':
      (async () => {
        try {
          const [s, clientId] = await Promise.all([getSettings(), getClientId()]);
          const res = await fetch(`${s.serverUrl}/wt/room/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              host_name: msg.nickname,
              client_id: clientId,
              video_id: msg.videoId || '',
              platform: msg.platform || '',
              current_time: msg.currentTime || 0,
              paused: msg.paused !== false,
              is_live: msg.isLive || false,
            }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            sendResponse({ ok: false, error: e.error || '创建失败' });
            return;
          }
          const data = await res.json();
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || '网络错误' });
        }
      })();
      return true;

    // content.js 请求执行 API 调用（避免跨域问题）
    case 'api_join_room':
      (async () => {
        try {
          const s = await getSettings();
          const res = await fetch(`${s.serverUrl}/wt/room/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: msg.token, guest_name: msg.nickname, client_id: await getClientId() }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            sendResponse({ ok: false, error: e.error || `请求失败(${res.status})` });
            return;
          }
          const data = await res.json();
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || '网络错误' });
        }
      })();
      return true; // async

    case 'get_client_id':
      getClientId().then(id => sendResponse({ clientId: id }));
      return true;

    case 'get_nickname':
      getNickname().then(n => sendResponse({ nickname: n }));
      return true;

    // 设置页测试按钮用，返回实际生效的服务器 URL（含默认值）
    case 'get_effective_server_url':
      getSettings().then(s => sendResponse({ url: s.serverUrl }));
      return true;
  }
});

// ── Tab 关闭：主页面关闭则离开房间 ────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId && currentRoom) {
    console.log('[WT] Active tab closed, leaving room');
    disconnectWS();
  }
});

