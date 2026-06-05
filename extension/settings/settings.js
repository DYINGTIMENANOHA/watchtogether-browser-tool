async function initSettings() {
  const stored = await new Promise(r =>
    chrome.storage.local.get({
      lang: 'en',
      nickname: '',
      serverUrl: '',
      serverToken: '',
      showBubble: true,
      clientId: '',
    }, r)
  );

  setLang('en');
  applyI18n();

  document.getElementById('nickname').value = stored.nickname;
  document.getElementById('server-url').value = stored.serverUrl;
  document.getElementById('server-token').value = stored.serverToken || '';
  document.getElementById('toggle-bubble').checked = stored.showBubble !== false;
  document.getElementById('lang-select').value = 'en';
  document.getElementById('client-id-display').textContent = stored.clientId || t('client_id_missing');
}

document.getElementById('btn-save').addEventListener('click', () => {
  const lang = 'en';
  const nickname = document.getElementById('nickname').value.trim();
  const serverUrl = document.getElementById('server-url').value.trim();
  const serverToken = document.getElementById('server-token').value.trim();
  const showBubble = document.getElementById('toggle-bubble').checked;

  chrome.storage.local.set({ lang, nickname, serverUrl, serverToken, showBubble }, () => {
    setLang('en');
    applyI18n();
    const msg = document.getElementById('saved-msg');
    msg.textContent = t('saved_ok');
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm(t('confirm_reset'))) return;
  chrome.storage.local.set({
    lang: 'en',
    nickname: '',
    serverUrl: '',
    serverToken: '',
    showBubble: true,
  }, () => {
    initSettings();
  });
});

document.getElementById('lang-select').addEventListener('change', () => {
  setLang('en');
  applyI18n();
});

document.getElementById('btn-selfhost-help').addEventListener('click', () => {
  const box = document.getElementById('selfhost-help-box');
  box.style.display = box.style.display === 'none' ? '' : 'none';
});

document.getElementById('about-toggle').addEventListener('click', () => {
  const body = document.getElementById('about-body');
  const toggle = document.getElementById('about-toggle');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  toggle.classList.toggle('open', open);
});

document.getElementById('btn-test').addEventListener('click', async () => {
  const btn = document.getElementById('btn-test');
  const hint = document.getElementById('server-test-result');
  const inputUrl = document.getElementById('server-url').value.trim();
  const serverToken = document.getElementById('server-token').value.trim();

  let url = inputUrl;
  if (!url) {
    url = await new Promise(r =>
      chrome.runtime.sendMessage({ type: 'get_effective_server_url' }, res => r(res?.url || ''))
    );
  }
  if (!url) {
    hint.style.color = '#c00';
    hint.textContent = 'No server URL configured';
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
