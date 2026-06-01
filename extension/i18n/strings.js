// i18n/strings.js  ─  WatchTogether 多语言字符串
// 所有 UI 文字集中在此，按 key 索引，支持 en / zh / ja
// 每个页面和 content.js 通过全局 t(key) 获取当前语言的字符串

const WT_STRINGS = {
  en: {
    // ── 通用 ──────────────────────────────────────
    app_name: 'WatchTogether',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    yes: 'Yes',
    no: 'No',
    leave_room: 'Leave Room',
    creating: 'Creating...',
    joining: 'Joining...',
    testing: 'Testing...',

    // ── 设置页 ────────────────────────────────────
    settings_title: '⚙ Settings',
    nickname_label: 'Nickname',
    nickname_placeholder: 'Leave blank to auto-generate',
    nickname_hint: 'Name shown to others in room (1–20 chars)',
    server_url_label: 'Server URL',
    server_url_placeholder: 'https://your-server.com',
    server_url_hint: 'Leave blank to use the official server',
    test_btn: 'Test',
    test_connecting: 'Connecting...',
    test_ok: '✓ Connected ({url})',
    test_fail_timeout: '✗ Timeout (5s) — check address or server status',
    test_fail_error: '✗ Failed: {msg}',
    test_fail_status: '✗ Server returned error {status}',
    language_label: 'Language',
    ui_section: 'Interface',
    show_bubble_label: 'Show floating button',
    show_bubble_hint: 'Shows the sync entry button on video pages; click × to hide temporarily (not saved)',
    about_section: 'About',
    client_id_label: 'Device ID (clientId)',
    client_id_hint: 'Identifies this browser, not shown to others; used for debugging',
    client_id_missing: '(not generated, try reinstalling)',
    save_settings: 'Save Settings',
    saved_ok: 'Saved ✓',
    reset_settings: 'Reset to defaults',
    confirm_reset: 'Reset to default settings?',

    // ── Popup ─────────────────────────────────────
    firstrun_title: 'Welcome to WatchTogether',
    firstrun_desc: 'Set a nickname — it will be shown to others in the room',
    firstrun_nick_placeholder: 'Your nickname',
    firstrun_save: 'Get Started',
    firstrun_err_empty: 'Please enter a nickname',
    firstrun_err_long: 'Nickname must be at most 20 characters',

    no_video: 'No video page detected',
    no_video_sub: 'You can still join a room',
    create_room: 'Create Room',
    join_btn: 'Join',
    join_placeholder: 'Enter invite code',
    err_enter_code: 'Please enter invite code',
    err_invalid_code: 'Invalid or expired invite code',
    err_create_failed: 'Create failed, please retry',
    err_join_failed: 'Join failed, please retry',
    err_own_room: 'Cannot join your own room',

    status_syncing: 'Syncing',
    status_connecting: 'Connecting...',
    status_reconnecting: 'Reconnecting...',

    invite_code_label: 'Invite Code',
    invite_link_label: 'Invite Link',
    invite_link_none: '(Open on a video page to generate)',
    members_title: 'Members',
    settings_group_title: 'Room Settings',
    veto_label: 'Veto Protection',
    veto_seconds_pre: 'Countdown',
    veto_seconds_post: 'seconds',
    guest_control_label: 'Allow guest control',
    guest_control_hint: "When on, guests' actions sync to everyone",
    host_name_prefix: 'Host:',
    catch_up_btn: '🏃 Catch Up',
    leave_btn: 'Leave Room',

    // ── Content.js 悬浮球 ─────────────────────────
    bubble_sync: 'Sync',
    bubble_host: 'Host',
    bubble_syncing: 'Live',
    bubble_searching: 'Search',
    bubble_reconnecting: '···',
    bubble_close_title: 'Hide',

    // ── Content.js 面板（空闲） ────────────────────
    panel_idle_title: 'WatchTogether',
    panel_create_btn: '+ Create Sync Room',
    panel_join_section: 'Join Existing Room',
    panel_code_placeholder: '8-char invite code',
    panel_nick_placeholder: 'Your nickname',
    panel_join_btn: 'Join Room',
    panel_invite_label: 'Invite Received',
    panel_err_code: 'Please enter invite code',
    panel_err_nick: 'Please enter nickname',
    panel_err_failed: 'Join failed',
    panel_creating: 'Creating...',
    panel_joining: 'Joining...',
    panel_no_create: 'Go to a video page to create a room, or enter an invite code to join.',

    // ── Content.js 面板（房主） ───────────────────
    panel_host_title: 'Host Panel',
    panel_status_syncing: 'Syncing',
    panel_status_reconnecting: 'Reconnecting...',
    panel_status_disconnected: 'Disconnected',
    panel_members_header: 'Members {n}/5',
    panel_settings_section: 'Room Settings',
    panel_veto_label: 'Veto Protection',
    panel_veto_cd: 'Countdown',
    panel_veto_sec: 'sec',
    panel_guest_ctrl: 'Allow guest control',

    // ── Content.js 面板（房客） ───────────────────
    panel_guest_title: 'Sync Watch',
    panel_host_label: 'Host:',

    // ── Content.js 通知 banner ───────────────────
    banner_veto_seek: '{name} changed progress',
    banner_veto_play: '{name} started playing',
    banner_veto_pause: '{name} paused',
    banner_veto_deny: 'Deny',

    banner_switch_text: '{name} switched video',
    banner_switch_follow: 'Follow',
    banner_switch_leave: 'Leave Room',
    banner_switch_host_searching: 'Host is still searching for a video, please wait',
    banner_auto_left: 'Auto-left room (host switched video)',

    banner_lost_text: '{name} went offline — room dissolved',
    banner_dissolved_text: '{name} went offline — room dissolved',

    banner_host_reconnecting: 'Host {name} disconnected, waiting...',
    banner_host_reconnected: 'Host reconnected',

    banner_non_active_host: 'You are in a sync room (Host)',
    banner_non_active_guest: 'You are in a sync room (Guest)',
    banner_move_here: 'Move Here',

    reconnect_prompt: 'Reconnected — catch up to host?',
    reconnect_yes: 'Catch Up',
    reconnect_no: 'Skip',

    info_left_room: 'Left room',
    info_already_in_room: 'Invite detected (you are already in a room)',

    or: 'or',
    live: 'Live',
    conn_fail_retry: 'Connection failed, retrying...',
    member_empty: 'No members yet',

    selfhost_help_title: 'Self-Hosting',
    selfhost_help_body: 'You can run your own relay server using the open-source backend. Visit the GitHub repository for step-by-step deployment instructions.',
    selfhost_repo_label: 'Repository:',
    selfhost_repo_val: '(coming soon)',

    about_version: 'Version',
    about_author: 'Author',
    about_author_val: '—',
    about_github: 'GitHub',
    about_github_val: '(coming soon)',
    about_license: 'License',

    // ── 历史房间 ──────────────────────────────────
    history_title: 'Recent Rooms',
    history_join_btn: 'Rejoin',
    history_copy_code: 'Copy code',
    history_online: 'Online',
    history_offline: 'Offline',
    history_checking: 'Checking...',
    history_just_now: 'Just now',
    history_ago_min: '{n}m ago',
    history_ago_hour: '{n}h ago',
    history_ago_day: '{n}d ago',
  },

  zh: {
    // ── 通用 ──────────────────────────────────────
    app_name: 'WatchTogether',
    copy: '复制',
    copied: '已复制',
    close: '关闭',
    save: '保存',
    cancel: '取消',
    yes: '是',
    no: '否',
    leave_room: '离开房间',
    creating: '创建中...',
    joining: '加入中...',
    testing: '测试中...',

    // ── 设置页 ────────────────────────────────────
    settings_title: '⚙ 设置',
    nickname_label: '我的昵称',
    nickname_placeholder: '留空则自动生成',
    nickname_hint: '在房间里显示给其他人的名字（1-20个字符）',
    server_url_label: '服务器地址',
    server_url_placeholder: 'https://your-server.com',
    server_url_hint: '留空使用官方服务器',
    test_btn: '测试',
    test_connecting: '正在连接...',
    test_ok: '✓ 连接成功（{url}）',
    test_fail_timeout: '✗ 连接超时（5s），检查地址或服务器是否启动',
    test_fail_error: '✗ 无法连接：{msg}',
    test_fail_status: '✗ 服务器返回错误 {status}',
    language_label: '语言',
    ui_section: '界面',
    show_bubble_label: '显示悬浮圆圈入口',
    show_bubble_hint: '在视频页面右侧显示快捷入口；点「×」可临时隐藏（不保存）',
    about_section: '关于',
    client_id_label: '设备 ID（clientId）',
    client_id_hint: '唯一标识此浏览器，不会显示给他人，用于调试',
    client_id_missing: '（未生成，请重新安装插件）',
    save_settings: '保存设置',
    saved_ok: '已保存 ✓',
    reset_settings: '恢复默认设置',
    confirm_reset: '恢复默认设置？',

    // ── Popup ─────────────────────────────────────
    firstrun_title: '欢迎使用 WatchTogether',
    firstrun_desc: '请设置一个昵称，这将在房间中显示给其他人',
    firstrun_nick_placeholder: '你的昵称',
    firstrun_save: '开始使用',
    firstrun_err_empty: '请输入昵称',
    firstrun_err_long: '昵称最多20个字符',

    no_video: '未检测到视频页面',
    no_video_sub: '加入房间不受限制',
    create_room: '创建房间',
    join_btn: '加入',
    join_placeholder: '输入邀请码',
    err_enter_code: '请输入邀请码',
    err_invalid_code: '邀请码无效或已过期',
    err_create_failed: '创建失败，请重试',
    err_join_failed: '加入失败，请重试',
    err_own_room: '不能加入自己创建的房间',

    status_syncing: '同步中',
    status_connecting: '连接中...',
    status_reconnecting: '重连中...',

    invite_code_label: '邀请码',
    invite_link_label: '邀请链接',
    invite_link_none: '（请在视频页面创建房间）',
    members_title: '房间成员',
    settings_group_title: '房间设置',
    veto_label: '否决保护',
    veto_seconds_pre: '倒计时',
    veto_seconds_post: '秒',
    guest_control_label: '允许房客反向控制',
    guest_control_hint: '开启后房客的操作也会同步给所有人',
    host_name_prefix: '房主：',
    catch_up_btn: '🏃 追上房主',
    leave_btn: '离开房间',

    // ── Content.js 悬浮球 ─────────────────────────
    bubble_sync: '同步',
    bubble_host: '房主',
    bubble_syncing: '同步中',
    bubble_searching: '找视频',
    bubble_reconnecting: '重连',
    bubble_close_title: '隐藏',

    // ── Content.js 面板（空闲） ────────────────────
    panel_idle_title: 'WatchTogether',
    panel_create_btn: '+ 创建同步房间',
    panel_join_section: '加入已有房间',
    panel_code_placeholder: '8位邀请码',
    panel_nick_placeholder: '你的昵称',
    panel_join_btn: '加入房间',
    panel_invite_label: '收到邀请',
    panel_err_code: '请输入邀请码',
    panel_err_nick: '请输入昵称',
    panel_err_failed: '加入失败',
    panel_creating: '创建中...',
    panel_joining: '加入中...',
    panel_no_create: '请进入视频页面创建房间，或输入邀请码加入已有房间。',

    // ── Content.js 面板（房主） ───────────────────
    panel_host_title: '房主面板',
    panel_status_syncing: '同步中',
    panel_status_reconnecting: '重连中...',
    panel_status_disconnected: '已断线',
    panel_members_header: '成员 {n}/5',
    panel_settings_section: '房间设置',
    panel_veto_label: '否决保护',
    panel_veto_cd: '倒计时',
    panel_veto_sec: '秒',
    panel_guest_ctrl: '允许房客反向控制',

    // ── Content.js 面板（房客） ───────────────────
    panel_guest_title: '同步观看',
    panel_host_label: '房主：',

    // ── Content.js 通知 banner ───────────────────
    banner_veto_seek: '{name} 变更了进度',
    banner_veto_play: '{name} 开始播放',
    banner_veto_pause: '{name} 暂停',
    banner_veto_deny: '否决',

    banner_switch_text: '{name} 切换了视频',
    banner_switch_follow: '跟随',
    banner_switch_leave: '退出房间',
    banner_switch_host_searching: '房主还在寻找视频，请等待',
    banner_auto_left: '已自动退出房间（房主切换了视频）',

    banner_lost_text: '{name} 已离线，房间已解散',
    banner_dissolved_text: '{name} 已离线，房间已解散',

    banner_host_reconnecting: '房主 {name} 断线中，等待重连...',
    banner_host_reconnected: '房主已重新连接',

    banner_non_active_host: '你已在同步房间中（房主）',
    banner_non_active_guest: '你已在同步房间中（房客）',
    banner_move_here: '移动至此',

    reconnect_prompt: '重连成功，是否追上房主？',
    reconnect_yes: '追上',
    reconnect_no: '不用',

    info_left_room: '已退出房间',
    info_already_in_room: '邀请链接已检测（你已在房间中）',

    or: '或',
    live: '直播',
    conn_fail_retry: '连接失败，正在重试...',
    member_empty: '暂无成员',

    selfhost_help_title: '自托管部署',
    selfhost_help_body: '你可以自行部署中继服务器。从 GitHub 仓库获取后端源码，按照 README 中的说明操作即可。',
    selfhost_repo_label: '仓库地址：',
    selfhost_repo_val: '（即将发布）',

    about_version: '版本',
    about_author: '作者',
    about_author_val: '—',
    about_github: 'GitHub',
    about_github_val: '（即将发布）',
    about_license: '许可证',

    // ── 历史房间 ──────────────────────────────────
    history_title: '最近房间',
    history_join_btn: '重新加入',
    history_copy_code: '复制邀请码',
    history_online: '在线',
    history_offline: '已过期',
    history_checking: '检查中...',
    history_just_now: '刚刚',
    history_ago_min: '{n}分钟前',
    history_ago_hour: '{n}小时前',
    history_ago_day: '{n}天前',
  },

  ja: {
    // ── 通用 ──────────────────────────────────────
    app_name: 'WatchTogether',
    copy: 'コピー',
    copied: 'コピー済み',
    close: '閉じる',
    save: '保存',
    cancel: 'キャンセル',
    yes: 'はい',
    no: 'いいえ',
    leave_room: '退室する',
    creating: '作成中...',
    joining: '参加中...',
    testing: 'テスト中...',

    // ── 設定ページ ────────────────────────────────
    settings_title: '⚙ 設定',
    nickname_label: 'ニックネーム',
    nickname_placeholder: '空白の場合は自動生成',
    nickname_hint: 'ルームで他のユーザーに表示される名前（1〜20文字）',
    server_url_label: 'サーバーURL',
    server_url_placeholder: 'https://your-server.com',
    server_url_hint: '空白の場合は公式サーバーを使用',
    test_btn: 'テスト',
    test_connecting: '接続中...',
    test_ok: '✓ 接続成功（{url}）',
    test_fail_timeout: '✗ タイムアウト（5秒）— アドレスまたはサーバーを確認してください',
    test_fail_error: '✗ 接続失敗：{msg}',
    test_fail_status: '✗ サーバーエラー {status}',
    language_label: '言語',
    ui_section: 'インターフェース',
    show_bubble_label: 'フローティングボタンを表示',
    show_bubble_hint: '動画ページに同期エントリーボタンを表示します。×をクリックで一時非表示（保存されません）',
    about_section: 'このアプリについて',
    client_id_label: 'デバイスID（clientId）',
    client_id_hint: 'このブラウザを識別するIDです。他のユーザーには表示されません',
    client_id_missing: '（未生成。拡張機能を再インストールしてください）',
    save_settings: '設定を保存',
    saved_ok: '保存しました ✓',
    reset_settings: 'デフォルトに戻す',
    confirm_reset: 'デフォルト設定に戻しますか？',

    // ── ポップアップ ──────────────────────────────
    firstrun_title: 'WatchTogetherへようこそ',
    firstrun_desc: 'ニックネームを設定してください。ルームで他のユーザーに表示されます',
    firstrun_nick_placeholder: 'ニックネーム',
    firstrun_save: '始める',
    firstrun_err_empty: 'ニックネームを入力してください',
    firstrun_err_long: 'ニックネームは20文字以内にしてください',

    no_video: '動画ページが検出されません',
    no_video_sub: '招待コードでルームに参加できます',
    create_room: 'ルームを作成',
    join_btn: '参加',
    join_placeholder: '招待コードを入力',
    err_enter_code: '招待コードを入力してください',
    err_invalid_code: '無効または期限切れの招待コード',
    err_create_failed: '作成失敗。再試行してください',
    err_join_failed: '参加失敗。再試行してください',
    err_own_room: '自分のルームには参加できません',

    status_syncing: '同期中',
    status_connecting: '接続中...',
    status_reconnecting: '再接続中...',

    invite_code_label: '招待コード',
    invite_link_label: '招待リンク',
    invite_link_none: '（動画ページでルームを作成してください）',
    members_title: 'メンバー',
    settings_group_title: 'ルーム設定',
    veto_label: '拒否保護',
    veto_seconds_pre: 'カウントダウン',
    veto_seconds_post: '秒',
    guest_control_label: 'ゲストのコントロールを許可',
    guest_control_hint: 'オンにするとゲストの操作も全員に同期されます',
    host_name_prefix: 'ホスト：',
    catch_up_btn: '🏃 追いつく',
    leave_btn: '退室する',

    // ── Content.js 浮動ボール ─────────────────────
    bubble_sync: '同期',
    bubble_host: 'ホスト',
    bubble_syncing: '同期中',
    bubble_searching: '検索中',
    bubble_reconnecting: '···',
    bubble_close_title: '非表示',

    // ── Content.js パネル（アイドル） ────────────
    panel_idle_title: 'WatchTogether',
    panel_create_btn: '+ 同期ルームを作成',
    panel_join_section: '既存のルームに参加',
    panel_code_placeholder: '8文字の招待コード',
    panel_nick_placeholder: 'ニックネーム',
    panel_join_btn: 'ルームに参加',
    panel_invite_label: '招待を受信',
    panel_err_code: '招待コードを入力してください',
    panel_err_nick: 'ニックネームを入力してください',
    panel_err_failed: '参加失敗',
    panel_creating: '作成中...',
    panel_joining: '参加中...',
    panel_no_create: '動画ページでルームを作成するか、招待コードで参加してください。',

    // ── Content.js パネル（ホスト） ──────────────
    panel_host_title: 'ホストパネル',
    panel_status_syncing: '同期中',
    panel_status_reconnecting: '再接続中...',
    panel_status_disconnected: '切断',
    panel_members_header: 'メンバー {n}/5',
    panel_settings_section: 'ルーム設定',
    panel_veto_label: '拒否保護',
    panel_veto_cd: 'カウントダウン',
    panel_veto_sec: '秒',
    panel_guest_ctrl: 'ゲストのコントロールを許可',

    // ── Content.js パネル（ゲスト） ──────────────
    panel_guest_title: '一緒に視聴',
    panel_host_label: 'ホスト：',

    // ── Content.js 通知バナー ─────────────────────
    banner_veto_seek: '{name} が進捗を変更しました',
    banner_veto_play: '{name} が再生を開始しました',
    banner_veto_pause: '{name} が一時停止しました',
    banner_veto_deny: '拒否',

    banner_switch_text: '{name} が動画を切り替えました',
    banner_switch_follow: '追う',
    banner_switch_leave: '退室する',
    banner_switch_host_searching: 'ホストはまだ動画を探しています。お待ちください',
    banner_auto_left: 'ルームから自動退室しました（ホストが動画を切り替えました）',

    banner_lost_text: '{name} がオフラインになりました — ルームが解散されました',
    banner_dissolved_text: '{name} がオフラインになりました — ルームが解散されました',

    banner_host_reconnecting: 'ホスト {name} が切断しました。再接続を待っています...',
    banner_host_reconnected: 'ホストが再接続しました',

    banner_non_active_host: '同期ルームに参加中です（ホスト）',
    banner_non_active_guest: '同期ルームに参加中です（ゲスト）',
    banner_move_here: 'ここに移動',

    reconnect_prompt: '再接続しました。ホストに追いつきますか？',
    reconnect_yes: '追いつく',
    reconnect_no: 'スキップ',

    info_left_room: 'ルームから退室しました',
    info_already_in_room: '招待リンクを検出しました（すでにルームにいます）',

    or: 'または',
    live: 'ライブ',
    conn_fail_retry: '接続失敗、再試行中...',
    member_empty: 'メンバーはいません',

    selfhost_help_title: 'セルフホスティング',
    selfhost_help_body: '独自の中継サーバーを運用できます。GitHubリポジトリからバックエンドをデプロイし、READMEに従ってセットアップしてください。',
    selfhost_repo_label: 'リポジトリ：',
    selfhost_repo_val: '（近日公開）',

    about_version: 'バージョン',
    about_author: '作者',
    about_author_val: '—',
    about_github: 'GitHub',
    about_github_val: '（近日公開）',
    about_license: 'ライセンス',

    // ── 履歴ルーム ────────────────────────────────
    history_title: '最近のルーム',
    history_join_btn: '再参加',
    history_copy_code: 'コードをコピー',
    history_online: 'オンライン',
    history_offline: 'オフライン',
    history_checking: '確認中...',
    history_just_now: 'たった今',
    history_ago_min: '{n}分前',
    history_ago_hour: '{n}時間前',
    history_ago_day: '{n}日前',
  },
};

// 当前语言（由各页面初始化时从 storage 读取后设置）
let _currentLang = 'en';

function setLang(lang) {
  _currentLang = (lang && WT_STRINGS[lang]) ? lang : 'en';
}

// 获取翻译字符串，支持 {key} 占位符替换
function t(key, vars) {
  const str = WT_STRINGS[_currentLang]?.[key] ?? WT_STRINGS['en']?.[key] ?? key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// 时间距今描述（依赖 t()，需在 setLang 之后调用）
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return t('history_just_now');
  if (diff < 3600) return t('history_ago_min', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('history_ago_hour', { n: Math.floor(diff / 3600) });
  return t('history_ago_day', { n: Math.floor(diff / 86400) });
}

// 对页面元素应用 data-i18n 翻译
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
      el.placeholder = t(key);
    } else {
      el.textContent = t(key);
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}
