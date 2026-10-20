(() => {
  'use strict';

  // DOM Elements
  const $ = selector => document.querySelector(selector);
  const video = $('#background-video');
  const welcome = $('#welcome');
  const container = $('#profile-container');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const soundButton = $('#sound-button');
  const soundIcon = $('#sound-icon');
  const volume = $('#volume-slider');
  const audioControl = $('#audio-control');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Chicago Clock ---------- */
  function updateTime() {
    const now = new Date();
    const tz = 'America/Chicago';
    
    $('#local-time').textContent = new Intl.DateTimeFormat('en-US', { 
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false 
    }).format(now);
    
    $('#local-date').textContent = new Intl.DateTimeFormat('en-US', { 
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' 
    }).format(now) + ' · Chicago';
    
    const zone = new Intl.DateTimeFormat('en-US', { 
      timeZone: tz, timeZoneName: 'short' 
    }).formatToParts(now).find(part => part.type === 'timeZoneName');
    
    $('#local-zone').textContent = zone?.value || 'CT';
  }
  updateTime();
  setInterval(updateTime, 15000);

  /* ---------- Tabs Navigation System ---------- */
  let activeTab = 'links';
  let targetTab = 'links';
  let stage = 'idle';
  let timer;
  
  const names = tabs.map(tab => tab.dataset.tab);
  const validTab = name => names.includes(name) ? name : 'links';

  function reveal(name) {
    panels.forEach(panel => { panel.hidden = panel.id !== `panel-${name}`; });
    activeTab = name;
  }

  function selectTab(name, options = {}) {
    name = validTab(name);
    targetTab = name;
    
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    if (options.updateHash !== false) {
      try { history.replaceState(null, '', `#${name}`); } catch (_) {}
    }

    if (options.instant || reduceMotion.matches) {
      clearTimeout(timer);
      container.classList.remove('is-closing', 'is-opening');
      stage = 'idle';
      reveal(name);
      return;
    }

    if (stage === 'closing' || (activeTab === name && stage === 'idle')) return;

    clearTimeout(timer);
    container.classList.remove('is-opening');
    void container.offsetWidth; // Force reflow
    container.classList.add('is-closing');
    stage = 'closing';

    timer = setTimeout(() => {
      reveal(targetTab);
      container.classList.remove('is-closing');
      container.classList.add('is-opening');
      stage = 'opening';
      timer = setTimeout(() => { 
        container.classList.remove('is-opening'); 
        stage = 'idle'; 
      }, 390);
    }, 235);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      
      event.preventDefault();
      tabs[next].focus();
      selectTab(tabs[next].dataset.tab);
    });
  });

  const readHash = () => { 
    try { return decodeURIComponent(location.hash.slice(1)).toLowerCase(); } catch (_) { return 'links'; } 
  };
  selectTab(readHash(), { updateHash: false, instant: true });
  addEventListener('hashchange', () => selectTab(readHash(), { updateHash: false }));

  /* ---------- Audio & Video Media Pipeline ---------- */
  // The background .mp4 is silent. The music is split into assets/music/01.part ... 15.part,
  // which are downloaded, stitched back together in the browser and played as one track.
  const track = new Audio();
  track.loop = true;
  track.preload = 'none';

  const audioFiles = Array.from({ length: 15 }, (_, i) => `assets/music/${String(i + 1).padStart(2, '0')}.part`);
  let musicReady = Promise.resolve(false);
  if (location.protocol !== 'file:') {
    musicReady = Promise.all(audioFiles.map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio unavailable: ${response.status}`);
      return response.arrayBuffer();
    })).then(parts => {
      track.src = URL.createObjectURL(new Blob(parts, { type: 'audio/mpeg' }));
      track.load();
      return true;
    }).catch(() => {
      soundButton.title = 'Music failed to load';
      return false;
    });
  }
  track.addEventListener('error', () => {
    soundButton.title = 'Music file could not be loaded';
  });

  const state = { entered: false, level: 50, previous: 50 };

  try {
    const saved = Number(localStorage.getItem('chicago-volume'));
    if (Number.isFinite(saved) && saved > 0 && saved <= 100) { 
      state.level = saved; 
      state.previous = saved; 
    }
  } catch (_) {}

  function applyAudio() {
    const muted = state.level === 0;
    const v = state.level / 100;
    track.volume = v;
    track.muted = muted;
    video.muted = true; // the video never plays sound
    
    volume.value = String(state.level);
    volume.style.setProperty('--level', `${state.level}%`);
    soundIcon.setAttribute('href', muted ? '#icon-muted' : '#icon-volume');
    soundButton.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
    soundButton.setAttribute('aria-pressed', String(muted));
  }

  function setVolume(level, persist) {
    state.level = Math.max(0, Math.min(100, Number(level) || 0));
    if (state.level > 0) state.previous = state.level;
    applyAudio();
    
    if (state.entered && state.level > 0 && track.paused && track.src) track.play().catch(() => {});
    if (persist) { 
      try { localStorage.setItem('chicago-volume', String(state.level)); } catch (_) {} 
    }
  }

  video.muted = true;
  volume.addEventListener('input', () => setVolume(volume.value, true));
  
  soundButton.addEventListener('click', () => {
    if (matchMedia('(hover: none)').matches && !audioControl.classList.contains('is-expanded')) {
      audioControl.classList.add('is-expanded');
      return;
    }
    setVolume(state.level === 0 ? state.previous : 0);
  });

  document.addEventListener('pointerdown', event => {
    if (!audioControl.contains(event.target)) audioControl.classList.remove('is-expanded');
  });

  audioControl.addEventListener('keydown', event => {
    if (event.key === 'Escape') { 
      audioControl.classList.remove('is-expanded'); 
      soundButton.focus(); 
    }
  });

  applyAudio();

  /* ---------- Welcome Overlay Splat Screen ---------- */
  function enterSite() {
    if (state.entered) return;
    state.entered = true;
    
    welcome.classList.add('is-gone');
    welcome.setAttribute('aria-hidden', 'true');
    welcome.tabIndex = -1;
    
    applyAudio();
    video.play().catch(() => {});
    musicReady.then(ready => { if (ready && !track.muted) track.play().catch(() => {}); });
    
    const selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    selected?.focus({ preventScroll: true });
    
    setTimeout(() => { welcome.hidden = true; }, 470);
  }

  welcome.addEventListener('click', enterSite);
  welcome.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { 
      event.preventDefault(); 
      enterSite(); 
    }
  });

  /* ---------- Live Discord Presence Real-time System ---------- */
  const DISCORD_USER_ID = "1537563036598935694";
  const endpoint = `https://solunabot.xyz/api/userinfo/${DISCORD_USER_ID}`;
  const secretKey = 'cdf_3elJdH6REVnUuP77lr84EBE2ZG5WxbuEvvSMaRmVFLo';

  const el = {
    name: $('#presence-name'), 
    line: $('#presence-line'), 
    avatar: $('#presence-avatar'),
    fallback: document.querySelector('.presence-fallback'), 
    dot: $('#presence-status'),
    art: $('#presence-art'), 
    artImg: $('#presence-art-img'),
  };

  const defaultLine = el.line ? el.line.textContent : "Offline";
  const verbs = { 
    playing: 'Playing', 
    streaming: 'Streaming', 
    listening: 'Listening to', 
    watching: 'Watching', 
    competing: 'Competing in' 
  };

  const clearExtra = () => el.line.parentElement.querySelectorAll('.extra-line').forEach(n => n.remove());

  function renderPresence(p) {
    if (p.name) el.name.textContent = p.name;
    
    if (p.avatar) { 
      el.avatar.src = p.avatar; 
      el.avatar.hidden = false; 
      if (el.fallback) el.fallback.style.display = 'none'; 
    }
    
    const status = ['online', 'idle', 'dnd', 'offline', 'invisible'].includes(p.status) ? p.status : null;
    el.dot.hidden = !status;
    if (status) el.dot.dataset.status = status;
    
    clearExtra();
    const a = p.activity;
    
    if (a && a.name) {
      const b = document.createElement('b');
      b.textContent = verbs[a.type] || 'Playing';
      el.line.replaceChildren(b, document.createTextNode(' ' + a.name));
      
      [a.details, a.state].filter(Boolean).slice(0, 2).forEach(text => {
        const s = document.createElement('small');
        s.className = 'extra-line';
        s.textContent = text;
        el.line.parentElement.appendChild(s);
      });
      
      if (a.image) { 
        el.artImg.src = a.image; 
        el.art.hidden = false; 
      } else { 
        el.art.hidden = true; 
      }
    } else {
      el.art.hidden = true;
      const c = p.custom;
      const custom = c && [c.emoji, c.state || c.details].filter(Boolean).join(' ');
      const online = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb' }[status];
      el.line.textContent = custom || online || defaultLine;
    }
  }

  const TYPES = ['playing', 'streaming', 'listening', 'watching', 'custom', 'competing'];
  const str = v => (v == null || v === '' ? undefined : String(v));

  function activityImage(a) {
    const img = a.large_image_url || a.largeImageURL || a.image || a.image_url || a.icon || a.assets?.large_image_url || a.assets?.largeImageURL || a.assets?.large_image;
    if (typeof img !== 'string') return undefined;
    if (img.startsWith('mp:external/')) return `https://media.discordapp.net/external/${img.slice(12)}`;
    if (/^https?:\/\//.test(img)) return img;
    if (a.application_id && !img.includes(':')) return `https://cdn.discordapp.com/app-assets/${a.application_id}/${img}.png?size=256`;
    return undefined;
  }

  function activityOf(a, forced) {
    if (!a || typeof a !== 'object') return undefined;
    const t = forced ?? a.type;
    return { 
      type: (typeof t === 'number' ? TYPES[t] : String(t || '').toLowerCase()) || 'playing', 
      name: str(a.name), 
      details: str(a.details), 
      state: str(a.state), 
      emoji: str(a.emoji?.name), 
      image: activityImage(a) 
    };
  }

  function normalize(json) {
    const d = json.data || json.user || json;
    let avatar = d.avatar_url || d.avatarURL || d.avatarUrl || d.avatar;
    
    if (avatar && !/^https?:\/\//.test(avatar)) {
      avatar = `https://cdn.discordapp.com/avatars/${d.id || d.user_id || DISCORD_USER_ID}/${avatar}.png?size=128`;
    }
    
    const raw = d.activities ?? d.activity ?? d.presence?.activities ?? [];
    const list = (Array.isArray(raw) ? raw.map(a => activityOf(a)) : raw && typeof raw === 'object' ? Object.entries(raw).map(([k, v]) => activityOf(v, k)) : []).filter(Boolean);
    
    return {
      name: str(d.global_name || d.globalName || d.display_name || d.displayName || d.username || d.name),
      avatar: avatar || undefined,
      status: String(d.status || d.presence?.status || 'offline').toLowerCase(),
      activity: list.find(a => a.type !== 'custom'),
      custom: list.find(a => a.type === 'custom'),
    };
  }

  async function loadProfile() {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      renderPresence(normalize(await response.json()));
    } catch (error) {
      console.error('Failed to load user information:', error);
    }
  }

  // Initial runtime load and register persistent refresh intervals
  window.addEventListener('DOMContentLoaded', loadProfile);
  setInterval(() => { if (!document.hidden) loadProfile(); }, 30000);
})();