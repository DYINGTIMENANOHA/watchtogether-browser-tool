const WT_SERVERS = {
  overseas: 'https://streamforsoul.com:8443',
  mainland: 'https://cn.streamforsoul.com',
};
const DEFAULT_SERVER_REGION = 'overseas';

function getStoredRegion(stored) {
  if (stored.serverRegion) return stored.serverRegion;
  return stored.serverUrl ? 'custom' : DEFAULT_SERVER_REGION;
}

function getEffectiveServerUrl(region, customUrl) {
  const rawUrl = (customUrl || '').trim().replace(/\/+$/, '');
  if (region === 'custom') return rawUrl;
  return WT_SERVERS[region] || WT_SERVERS[DEFAULT_SERVER_REGION];
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

async function ensureCustomServerPermission(region, url) {
  if (region !== 'custom') return true;
  const origin = getOriginPattern(url);
  if (!origin) throw new Error(t('server_permission_invalid_url'));
  const granted = await new Promise((resolve) => {
    chrome.permissions.request({ origins: [origin] }, resolve);
  });
  if (!granted) throw new Error(t('server_permission_denied'));
  return true;
}

function updateServerUrlVisibility() {
  const region = document.getElementById('server-region').value;
  const field = document.getElementById('server-url-field');
  if (field) field.style.display = region === 'custom' ? '' : 'none';
}

async function initSettings() {
  const stored = await new Promise(r =>
    chrome.storage.local.get({
      lang: 'en',
      nickname: '',
      serverRegion: '',
      serverUrl: '',
      serverToken: '',
      showBubble: true,
      clientId: '',
    }, r)
  );

  setLang(stored.lang);
  applyI18n();

  const serverRegion = getStoredRegion(stored);
  document.getElementById('nickname').value = stored.nickname;
  document.getElementById('server-region').value = serverRegion;
  document.getElementById('server-url').value = stored.serverUrl;
  document.getElementById('server-token').value = stored.serverToken || '';
  document.getElementById('toggle-bubble').checked = stored.showBubble !== false;
  document.getElementById('lang-select').value = stored.lang || 'en';
  document.getElementById('client-id-display').textContent = stored.clientId || t('client_id_missing');
  updateServerUrlVisibility();
}

function autoNicknameLang(name) {
  if (!name) return '';
  if (/^(Happy|Cool|Curious|Friendly|Lazy|Clever|Brave|Silly)(Cat|Panda|Fox|Bunny|Bear|Wolf|Tiger|Penguin)$/.test(name)) return 'en';
  if (/^(快乐|可爱|酷炫|神秘|友善|慵懒|热情|机智)(小猫|大象|企鹅|熊猫|狐狸|兔子|松鼠|海豚)$/.test(name)) return 'zh';
  if (/^(元気な|かわいい|おしゃれな|ふしぎな|のんびり|かしこい|たのしい|やさしい)(ネコ|パンダ|キツネ|ウサギ|クマ|タヌキ|リス|ペンギン)$/.test(name)) return 'ja';
  return '';
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const lang = document.getElementById('lang-select').value;
  const nickname = document.getElementById('nickname').value.trim();
  const serverRegion = document.getElementById('server-region').value;
  const serverUrl = document.getElementById('server-url').value.trim();
  const serverToken = document.getElementById('server-token').value.trim();
  const showBubble = document.getElementById('toggle-bubble').checked;
  const nicknameLang = autoNicknameLang(nickname);
  const nicknameAuto = !nickname || !!nicknameLang;
  const msg = document.getElementById('saved-msg');

  try {
    await ensureCustomServerPermission(serverRegion, serverUrl);
  } catch (e) {
    msg.style.color = '#c00';
    msg.textContent = e.message || t('server_permission_denied');
    return;
  }

  chrome.storage.local.set({ lang, nickname, nicknameAuto, nicknameLang: nickname ? nicknameLang : lang, serverRegion, serverUrl, serverToken, showBubble }, () => {
    setLang(lang);
    applyI18n();
    msg.style.color = '#4caf50';
    msg.textContent = t('saved_ok');
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm(t('confirm_reset'))) return;
  chrome.storage.local.set({
    lang: 'en',
    nickname: '',
    serverRegion: DEFAULT_SERVER_REGION,
    serverUrl: '',
    serverToken: '',
    showBubble: true,
  }, () => {
    initSettings();
  });
});

document.getElementById('lang-select').addEventListener('change', () => {
  setLang(document.getElementById('lang-select').value);
  applyI18n();
});

document.getElementById('server-region').addEventListener('change', updateServerUrlVisibility);

document.getElementById('btn-selfhost-help').addEventListener('click', () => {
  const box = document.getElementById('selfhost-help-box');
  box.style.display = box.style.display === 'none' ? '' : 'none';
});

document.getElementById('btn-test').addEventListener('click', async () => {
  const btn = document.getElementById('btn-test');
  const hint = document.getElementById('server-test-result');
  const serverRegion = document.getElementById('server-region').value;
  const inputUrl = document.getElementById('server-url').value.trim();
  const serverToken = document.getElementById('server-token').value.trim();

  let url = getEffectiveServerUrl(serverRegion, inputUrl);
  if (!url) {
    hint.style.color = '#c00';
    hint.textContent = 'No server URL configured';
    return;
  }

  try {
    await ensureCustomServerPermission(serverRegion, url);
  } catch (e) {
    hint.style.color = '#c00';
    hint.textContent = e.message || t('server_permission_denied');
    return;
  }

  btn.disabled = true;
  btn.textContent = t('testing');
  hint.style.color = '#888';
  hint.textContent = t('test_connecting');
  hint.dataset.testState = '';

  try {
    const headers = {};
    if (serverToken) headers['X-WT-Client-Token'] = serverToken;
    const res = await fetch(`${url}/wt/room/status`, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      hint.style.color = '#4caf50';
      hint.textContent = t('test_ok', { url });
    } else {
      hint.style.color = '#c00';
      hint.textContent = t('test_fail_status', { status: res.status });
    }
  } catch (e) {
    hint.style.color = '#c00';
    hint.textContent = e.name === 'TimeoutError'
      ? t('test_fail_timeout')
      : t('test_fail_error', { msg: e.message });
  }

  hint.dataset.testState = 'tested';
  btn.disabled = false;
  btn.textContent = t('test_btn');
});

initSettings();
