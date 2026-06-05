// WatchTogether UI strings.
// The project currently ships English-only UI to avoid broken encoded text.

const WT_STRINGS = {
  en: {
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

    settings_title: 'Settings',
    nickname_label: 'Nickname',
    nickname_placeholder: 'Leave blank to auto-generate',
    nickname_hint: 'Name shown to others in room (1-20 chars)',
    server_url_label: 'Server URL',
    server_url_placeholder: 'https://your-server.com',
    server_url_hint: 'Leave blank to use the official server',
    server_token_label: 'Server Access Token',
    server_token_placeholder: 'Optional token for private servers',
    server_token_hint: 'Only needed when your server has CLIENT_TOKEN configured',
    test_btn: 'Test',
    test_connecting: 'Connecting...',
    test_ok: 'Connected ({url})',
    test_fail_timeout: 'Timeout (5s). Check the address or server status.',
    test_fail_error: 'Failed: {msg}',
    test_fail_status: 'Server returned error {status}',
    language_label: 'Language',
    ui_section: 'Interface',
    show_bubble_label: 'Show floating button',
    show_bubble_hint: 'Shows the sync entry button on video pages; click x to hide temporarily.',
    about_section: 'About',
    client_id_label: 'Device ID',
    client_id_hint: 'Identifies this browser, not shown to others; used for reconnect handling.',
    client_id_missing: '(not generated, try reinstalling)',
    save_settings: 'Save Settings',
    saved_ok: 'Saved',
    reset_settings: 'Reset to defaults',
    confirm_reset: 'Reset to default settings?',

    firstrun_title: 'Welcome to WatchTogether',
    firstrun_desc: 'Set a nickname. It will be shown to others in the room.',
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
    catch_up_btn: 'Catch Up',
    leave_btn: 'Leave Room',

    bubble_sync: 'Sync',
    bubble_host: 'Host',
    bubble_syncing: 'Live',
    bubble_searching: 'Search',
    bubble_reconnecting: '...',
    bubble_close_title: 'Hide',

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

    panel_guest_title: 'Sync Watch',
    panel_host_label: 'Host:',

    banner_veto_seek: '{name} changed progress',
    banner_veto_play: '{name} started playing',
    banner_veto_pause: '{name} paused',
    banner_veto_deny: 'Deny',
    banner_switch_text: '{name} switched video',
    banner_switch_follow: 'Follow',
    banner_switch_leave: 'Leave Room',
    banner_switch_host_searching: 'Host is still searching for a video, please wait',
    banner_auto_left: 'Auto-left room because the host switched video',
    banner_lost_text: '{name} went offline. Room dissolved.',
    banner_dissolved_text: '{name} went offline. Room dissolved.',
    banner_host_reconnecting: 'Host {name} disconnected, waiting...',
    banner_host_reconnected: 'Host reconnected',
    banner_non_active_host: 'You are in a sync room as host.',
    banner_non_active_guest: 'You are in a sync room as guest.',
    banner_move_here: 'Move Here',
    reconnect_prompt: 'Reconnected. Catch up to host?',
    reconnect_yes: 'Catch Up',
    reconnect_no: 'Skip',

    info_left_room: 'Left room',
    info_already_in_room: 'Invite detected, but you are already in a room.',
    or: 'or',
    live: 'Live',
    conn_fail_retry: 'Connection failed, retrying...',
    member_empty: 'No members yet',

    selfhost_help_title: 'Self-Hosting',
    selfhost_help_body: 'You can run your own relay server using the backend in this repository.',
    selfhost_repo_label: 'Repository:',
    selfhost_repo_val: '(coming soon)',
    about_version: 'Version',
    about_author: 'Author',
    about_author_val: '-',
    about_github: 'GitHub',
    about_github_val: '(coming soon)',
    about_license: 'License',

    sync_all_btn: 'Sync All',
    transfer_already_host: "You're hosting a room in another tab.",
    transfer_btn: 'Transfer Room Here',
    transfer_btn_loading: 'Transferring...',
    transfer_no_video: 'Open a video page first',
    banner_transfer_text: 'Host {name} moved to a new room',
    banner_transfer_follow: 'Follow',
    banner_transfer_leave: 'Leave',

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
};

let _currentLang = 'en';

function setLang() {
  _currentLang = 'en';
}

function t(key, vars) {
  const str = WT_STRINGS[_currentLang]?.[key] ?? WT_STRINGS.en[key] ?? key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return t('history_just_now');
  if (diff < 3600) return t('history_ago_min', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('history_ago_hour', { n: Math.floor(diff / 3600) });
  return t('history_ago_day', { n: Math.floor(diff / 86400) });
}

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
