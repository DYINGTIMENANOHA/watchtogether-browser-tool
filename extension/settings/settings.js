// settings.js  ─  DEFAULT_SERVER 只写在 background.js/popup.js 里
// 这里只存用户自定义地址，空字符串 = 使用代码里写死的默认值

async function initSettings() {
  // 先读语言设置，再渲染 UI
  const stored = await new Promise(r =>
    chrome.storage.local.get({ lang: 'en', nickname: '', serverUrl: '', showBubble: true, clientId: '' }, r)
  );

  setLang(stored.lang);
  applyI18n();

  // 填入已保存的值
  document.getElementById('nickname').value = stored.nickname;
  // 服务器地址：只显示用户自定义值，空 = 留空（默认服务器在代码里）
  document.getElementById('server-url').value = stored.serverUrl;
  document.getElementById('toggle-bubble').checked = stored.showBubble !== false;
  document.getElementById('lang-select').value = stored.lang || 'en';

  // clientId
  const clientIdEl = document.getElementById('client-id-display');
  clientIdEl.textContent = stored.clientId || t('client_id_missing');
}

// 保存
document.getElementById('btn-save').addEventListener('click', () => {
  const lang      = document.getElementById('lang-select').value;
  const nickname  = document.getElementById('nickname').value.trim();
  const serverUrl = document.getElementById('server-url').value.trim(); // 空 = 用代码默认
  const showBubble = document.getElementById('toggle-bubble').checked;

  chrome.storage.local.set({ lang, nickname, serverUrl, showBubble }, () => {
    setLang(lang);
    applyI18n();
    const msg = document.getElementById('saved-msg');
    msg.textContent = t('saved_ok');
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});

// 重置
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm(t('confirm_reset'))) return;
  chrome.storage.local.set({ lang: 'en', nickname: '', serverUrl: '', showBubble: true }, () => {
    initSettings();
  });
});

// 语言切换实时预览
document.getElementById('lang-select').addEventListener('change', e => {
  setLang(e.target.value);
  applyI18n();
  // 重新翻译测试结果提示
  const hint = document.getElementById('server-test-result');
  if (hint.dataset.testState !== 'tested') {
    hint.style.color = '#888';
    hint.textContent = t('server_url_hint');
  }
});

// ❓ 自托管帮助框
document.getElementById('btn-selfhost-help').addEventListener('click', () => {
  const box = document.getElementById('selfhost-help-box');
  box.style.display = box.style.display === 'none' ? '' : 'none';
});

// About 折叠展开
document.getElementById('about-toggle').addEventListener('click', () => {
  const body = document.getElementById('about-body');
  const toggle = document.getElementById('about-toggle');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  toggle.classList.toggle('open', open);
});

// 测试服务器连接
document.getElementById('btn-test').addEventListener('click', async () => {
  const btn  = document.getElementById('btn-test');
  const hint = document.getElementById('server-test-result');
  const inputUrl = document.getElementById('server-url').value.trim();

  // 如果用户没填，从 background 获取实际使用的 URL
  let url = inputUrl;
  if (!url) {
    // 向 background 询问当前生效的 serverUrl
    url = await new Promise(r =>
      chrome.runtime.sendMessage({ type: 'get_effective_server_url' }, res => r(res?.url || ''))
    );
  }
  if (!url) { hint.style.color = '#c00'; hint.textContent = 'No server URL configured'; return; }

  btn.disabled = true;
  btn.textContent = t('testing');
  hint.style.color = '#888';
  hint.textContent = t('test_connecting');
  hint.dataset.testState = '';

  try {
    const res = await fetch(`${url}/wt/health`, { signal: AbortSignal.timeout(5000) });
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
