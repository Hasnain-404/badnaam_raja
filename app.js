/* ═══════════════════════════════════════════════════
   BADNAAM RAJA RADIO — app.js
   YouTube IFrame API · King's Discography · Dynamic Queue & Playlists
═══════════════════════════════════════════════════ */

/* ─── TRACK LIBRARY & KING ALBUMS ────────────────────────────────── */
const RAW_ALBUMS = (typeof KING_ALBUMS !== 'undefined' && Array.isArray(KING_ALBUMS) && KING_ALBUMS.length > 0)
  ? KING_ALBUMS
  : [
    {
      id: 'monopoly',
      title: 'Monopoly: The Complete Album',
      desc: '16 songs · Iconic Hits',
      gradient: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
      tracks: [
        { id: '3b3cMTBA-68', title: 'GOAT SHIT', artist: 'King' },
        { id: 'URJycGCwseQ', title: 'STILL THE SAME', artist: 'King' },
        { id: 'Ik1SN6E4uDA', title: 'WAY BIGGER', artist: 'King' },
        { id: '75aW5-r9y-g', title: 'BAWE MAIN CHECK', artist: 'King' },
        { id: 'sQldSAucSAo', title: 'MISFIT', artist: 'King' },
        { id: '3jeixNiyfDM', title: 'KODAK', artist: 'King' },
        { id: '6fSiVHxzkU8', title: 'SAZA', artist: 'King' },
        { id: 'ZrZxzWgE3cM', title: 'PYAAR HUMARA', artist: 'King' },
        { id: 'srrGnB2yPbg', title: 'F*CK WHAT THEY SAY', artist: 'King' },
        { id: 'HYFON9SxIf0', title: 'WARCRY', artist: 'King' },
        { id: 'NkySm4jIhC4', title: 'MASHINEY', artist: 'King' },
        { id: '6dNRJEebVtY', title: 'SUPREME LEADER', artist: 'King' },
        { id: 'R6cvNekjOhI', title: 'SUITS & STREETS', artist: 'King' },
        { id: '7Ty2OQhUlS8', title: "CAN'T AFFORD", artist: 'King' },
        { id: 'X4GKNDy6zk8', title: 'TERE HO KE', artist: 'King' },
        { id: 'RVdMf3VMVVM', title: 'DELULU DANCE', artist: 'King' },
      ]
    }
  ];

function extractVideoId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') {
      const shortId = url.pathname.split('/').filter(Boolean)[0];
      return /^[A-Za-z0-9_-]{11}$/.test(shortId || '') ? shortId : null;
    }
    const queryId = url.searchParams.get('v');
    if (/^[A-Za-z0-9_-]{11}$/.test(queryId || '')) return queryId;
    const pathId = url.pathname.split('/').filter(Boolean).pop();
    return /^[A-Za-z0-9_-]{11}$/.test(pathId || '') ? pathId : null;
  } catch (e) {
    return null;
  }
}

const ALBUMS = RAW_ALBUMS.map(album => ({
  ...album,
  tracks: Array.isArray(album.tracks)
    ? album.tracks
      .map(track => ({ ...track, id: extractVideoId(track.id) }))
      .filter(track => track.id)
    : []
})).filter(album => album.tracks.length > 0);

let currentPlaylistIdx = 0;

/* ─── STATE & MEMORY ────────────────────────────────────────────── */
const MEMORY_KEY = 'badnaam_raja_state';

function loadSavedState() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { }
  return null;
}

const savedState = loadSavedState();
if (savedState && typeof savedState.plIdx === 'number' && savedState.plIdx >= 0 && savedState.plIdx < ALBUMS.length) {
  currentPlaylistIdx = savedState.plIdx;
}

let TRACKS = ALBUMS[currentPlaylistIdx].tracks;
let currentIdx = (savedState && typeof savedState.idx === 'number' && savedState.idx >= 0 && savedState.idx < TRACKS.length)
  ? savedState.idx
  : 0;

let resumeSeekTime = savedState ? (savedState.time || 0) : 0;
let resumeDuration = savedState ? (savedState.dur || 0) : 0;
// If user was at the very end of song, start fresh
if (resumeDuration > 0 && resumeSeekTime >= resumeDuration - 3) {
  resumeSeekTime = 0;
}
let hasResumedPosition = false;

const audioPlayer = new Audio();
audioPlayer.preload = 'auto';
const streamUrlCache = new Map();
let isPlaying = false;
let isMuted = false;
let isShuffle = false;
let isRepeat = false;
let preVolume = (savedState && typeof savedState.vol === 'number') ? savedState.vol : 80;
let userWantsPlay = false;

function saveCurrentState() {
  const cur = audioPlayer.currentTime || 0;
  const dur = audioPlayer.duration || resumeDuration || 0;

  if (cur === 0 && resumeSeekTime > 0) cur = resumeSeekTime;
  if (dur === 0 && resumeDuration > 0) dur = resumeDuration;

  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({
      plIdx: currentPlaylistIdx,
      idx: currentIdx,
      time: Math.floor(cur),
      dur: Math.floor(dur),
      vol: parseInt($volSlider.value) || 80,
      timestamp: Date.now()
    }));
  } catch (e) { }
}

// Seekbar update timer
let seekTimer = null;

/* ─── DOM REFS ──────────────────────────────────────────────────── */
const $vinylRing = document.getElementById('vinyl-ring');
const $albumThumb = document.getElementById('album-thumb');
const $trackTitle = document.getElementById('track-title');
const $trackArtist = document.getElementById('track-artist');
const $playerStatus = document.getElementById('player-status');
const $seekCurrent = document.getElementById('seek-current');
const $seekTotal = document.getElementById('seek-total');
const $seekSlider = document.getElementById('seek-slider');
const $seekFill = document.getElementById('seek-fill');
const $iconPlay = document.getElementById('icon-play');
const $iconPause = document.getElementById('icon-pause');
const $iconVol = document.getElementById('icon-vol');
const $iconVolOff = document.getElementById('icon-vol-off');
const $volSlider = document.getElementById('vol-slider');
const $volFill = document.getElementById('vol-fill');
const $queueList = document.getElementById('queue-list');
const $pwaBtn = document.getElementById('pwa-install-btn');
const isLocalStaticServer = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  && window.location.port !== '3000';
const streamServerOrigin = window.electronAPI || isLocalStaticServer
  ? 'http://localhost:3000'
  : '';

audioPlayer.addEventListener('loadedmetadata', () => {
  if (resumeSeekTime > 0 && resumeSeekTime < audioPlayer.duration) {
    audioPlayer.currentTime = resumeSeekTime;
    resumeSeekTime = 0;
  }
  if ($playerStatus) $playerStatus.textContent = '';
  updateSeek();
});
audioPlayer.addEventListener('play', () => {
  setPlayUI(true);
  userWantsPlay = true;
  startSeekPoll();
  updateMediaSession(TRACKS[currentIdx]);
  prefetchNextTrack();
});
audioPlayer.addEventListener('pause', () => {
  setPlayUI(false);
  stopSeekPoll();
  saveCurrentState();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audioPlayer.addEventListener('ended', handleTrackEnded);
audioPlayer.addEventListener('error', () => {
  userWantsPlay = false;
  setPlayUI(false);
  if ($playerStatus) $playerStatus.textContent = 'This song could not be played.';
  nextTrack();
});

/* ─── MEDIA SESSION API ─────────────────────────────────────────── */
function updateMediaSession(track) {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'King',
        album: ALBUMS[currentPlaylistIdx] ? ALBUMS[currentPlaylistIdx].title : 'Badnaam Raja',
        artwork: [
          { src: `https://img.youtube.com/vi/${track.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          { src: `https://img.youtube.com/vi/${track.id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }
        ]
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (e) { }
  }
}

function initMediaSession() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (details.seekTime) audioPlayer.currentTime = details.seekTime;
      });
    } catch (e) { }
  }
}
initMediaSession();

/* ─── PLAYBACK CONTROLS ─────────────────────────────────────────── */
async function playTrack(videoId) {
  if (!videoId) return;
  if ($playerStatus) $playerStatus.textContent = 'Loading...';
  try {
    audioPlayer.src = `${streamServerOrigin}/audio/${encodeURIComponent(videoId)}`;
    await audioPlayer.play();
  } catch (error) {
    console.error('Audio stream error:', error);
    userWantsPlay = false;
    setPlayUI(false);
    if ($playerStatus) $playerStatus.textContent = 'This song could not be played.';
  }
}

function fetchStreamUrl(videoId) {
  if (!streamUrlCache.has(videoId)) {
    const request = fetch(`${streamServerOrigin}/stream/${encodeURIComponent(videoId)}`)
      .then(response => {
        if (!response.ok) throw new Error(`Stream request failed: ${response.status}`);
        return response.json();
      })
      .then(({ url }) => {
        streamUrlCache.set(videoId, url);
        return url;
      })
      .catch(error => {
        streamUrlCache.delete(videoId);
        throw error;
      });
    streamUrlCache.set(videoId, request);
  }
  return Promise.resolve(streamUrlCache.get(videoId));
}

function getNextTrackIndex() {
  if (isShuffle && TRACKS.length > 1) {
    let nextIdx = currentIdx;
    while (nextIdx === currentIdx) nextIdx = Math.floor(Math.random() * TRACKS.length);
    return nextIdx;
  }
  return (currentIdx + 1) % TRACKS.length;
}

function prefetchNextTrack() {
  const nextTrack = TRACKS[getNextTrackIndex()];
  if (nextTrack) fetchStreamUrl(nextTrack.id).catch(() => { });
}

function togglePlay() {
  if (isPlaying) {
    userWantsPlay = false;
    audioPlayer.pause();
    saveCurrentState();
  } else {
    userWantsPlay = true;
    if (audioPlayer.src) audioPlayer.play().catch(() => playTrack(TRACKS[currentIdx].id));
    else playTrack(TRACKS[currentIdx].id);
  }
}

function nextTrack() {
  currentIdx = getNextTrackIndex();
  loadTrack(currentIdx);
}

function handleTrackEnded() {
  if (isRepeat) {
    audioPlayer.currentTime = 0;
    audioPlayer.play().catch(() => playTrack(TRACKS[currentIdx].id));
    return;
  }
  nextTrack();
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
}

function toggleRepeat() {
  isRepeat = !isRepeat;
  document.getElementById('btn-repeat').classList.toggle('active', isRepeat);
}

function prevTrack() {
  if (audioPlayer.currentTime > 3) {
    audioPlayer.currentTime = 0;
    return;
  }
  currentIdx = (currentIdx - 1 + TRACKS.length) % TRACKS.length;
  loadTrack(currentIdx);
}

function loadTrack(idx, autoPlay = true) {
  currentIdx = idx;
  resumeSeekTime = 0;
  resumeDuration = 0;
  hasResumedPosition = true;
  const t = TRACKS[idx];
  if ($playerStatus) $playerStatus.textContent = '';
  updateTrackUI(idx);
  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  audioPlayer.load();
  setPlayUI(false);
  if (autoPlay) {
    userWantsPlay = true;
    playTrack(t.id);
  }
  saveCurrentState();
}

/* ─── PLAYLISTS MODAL ───────────────────────────────────────────── */
function renderPlaylists() {
  const $grid = document.getElementById('playlist-grid');
  if (!$grid) return;
  $grid.innerHTML = '';
  ALBUMS.forEach((album, idx) => {
    const card = document.createElement('div');
    const isActive = idx === currentPlaylistIdx;
    card.className = `playlist-card${isActive ? ' active' : ''}`;
    card.setAttribute('data-pl', idx);
    card.style.background = album.gradient || 'linear-gradient(135deg, #1f2937, #111827)';
    const coverId = album.tracks[0] ? album.tracks[0].id : '';
    card.innerHTML = `
      <div class="pl-cover">
        <img src="https://img.youtube.com/vi/${coverId}/hqdefault.jpg" alt="${album.title} cover" />
      </div>
      <div class="pl-info">
        <div class="pl-title">${album.title}</div>
        <div class="pl-count">${album.tracks.length} songs · King</div>
        ${isActive ? '<span class="pl-active-dot" title="Active Playlist">● Playing</span>' : ''}
      </div>
    `;
    card.addEventListener('click', () => {
      loadPlaylist(idx);
    });
    $grid.appendChild(card);
  });
}

function loadPlaylist(plIdx) {
  if (plIdx < 0 || plIdx >= ALBUMS.length) return;
  currentPlaylistIdx = plIdx;
  TRACKS = ALBUMS[currentPlaylistIdx].tracks;
  currentIdx = 0;
  resumeSeekTime = 0;
  resumeDuration = 0;
  hasResumedPosition = true;

  const $qTitle = document.getElementById('queue-header-title');
  if ($qTitle) {
    $qTitle.textContent = `${ALBUMS[currentPlaylistIdx].title} (${TRACKS.length} Tracks)`;
  }

  renderPlaylists();
  renderQueue();
  loadTrack(0, true);
  closeModal('modal-playlists');
  saveCurrentState();
}

/* ─── UI UPDATERS ───────────────────────────────────────────────── */
function setPlayUI(playing) {
  isPlaying = playing;
  if (playing) {
    $iconPlay.classList.add('hidden');
    $iconPause.classList.remove('hidden');
    $vinylRing.classList.add('spinning');
  } else {
    $iconPlay.classList.remove('hidden');
    $iconPause.classList.add('hidden');
    $vinylRing.classList.remove('spinning');
  }
}

function updateTrackUI(idx) {
  const t = TRACKS[idx];
  $trackTitle.textContent = t.title;
  $trackArtist.textContent = t.artist;
  $albumThumb.src = `https://img.youtube.com/vi/${t.id}/mqdefault.jpg`;

  // If restoring from saved memory before playback starts, position the seekbar at the saved spot
  if (!isPlaying && resumeSeekTime > 0 && resumeDuration > 0) {
    const pct = Math.min(100, Math.max(0, (resumeSeekTime / resumeDuration) * 100));
    $seekSlider.value = pct;
    $seekFill.style.width = pct + '%';
    $seekCurrent.textContent = formatTime(resumeSeekTime);
    $seekTotal.textContent = formatTime(resumeDuration);
  }

  renderQueue();
}

/* ─── SEEKBAR ───────────────────────────────────────────────────── */
function startSeekPoll() {
  stopSeekPoll();
  seekTimer = setInterval(updateSeek, 500);
}

function stopSeekPoll() {
  if (seekTimer) { clearInterval(seekTimer); seekTimer = null; }
}

function updateSeek() {
  const cur = audioPlayer.currentTime || 0;
  const dur = audioPlayer.duration || 0;
  if (!dur) return;
  if (dur > 0) {
    const pct = (cur / dur) * 100;
    $seekSlider.value = pct;
    $seekFill.style.width = pct + '%';
  }
  $seekCurrent.textContent = formatTime(cur);
  $seekTotal.textContent = formatTime(dur);

  // Periodically save state into localStorage memory
  if (Math.floor(cur) % 2 === 0) {
    saveCurrentState();
  }
}

$seekSlider.addEventListener('input', () => {
  $seekFill.style.width = $seekSlider.value + '%';
});

$seekSlider.addEventListener('change', () => {
  const dur = audioPlayer.duration || 0;
  const targetSec = (parseFloat($seekSlider.value) / 100) * dur;
  audioPlayer.currentTime = targetSec;
  saveCurrentState();
});

/* ─── VOLUME ────────────────────────────────────────────────────── */
function setVolumePct(v) {
  v = Math.max(0, Math.min(100, v));
  $volSlider.value = v;
  $volFill.style.width = v + '%';
  audioPlayer.volume = v / 100;
  if (v === 0) {
    $iconVol.classList.add('hidden'); $iconVolOff.classList.remove('hidden');
  } else {
    $iconVol.classList.remove('hidden'); $iconVolOff.classList.add('hidden');
  }
}

$volSlider.addEventListener('input', () => setVolumePct(parseInt($volSlider.value)));

function toggleMute() {
  if (isMuted) {
    isMuted = false;
    setVolumePct(preVolume);
  } else {
    preVolume = parseInt($volSlider.value);
    isMuted = true;
    setVolumePct(0);
  }
}

/* ─── QUEUE LIST ────────────────────────────────────────────────── */
function renderQueue() {
  const $qTitle = document.getElementById('queue-header-title');
  if ($qTitle && ALBUMS[currentPlaylistIdx]) {
    $qTitle.textContent = `${ALBUMS[currentPlaylistIdx].title} (${TRACKS.length} Tracks)`;
  }
  $queueList.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = `song-item${i === currentIdx ? ' active' : ''}`;
    li.innerHTML = `
      <span class="song-num">${i + 1}</span>
      <img class="song-thumb" src="https://img.youtube.com/vi/${t.id}/mqdefault.jpg" alt="" />
      <div class="song-details">
        <div class="song-name">${t.title}</div>
        <div class="song-artist">${t.artist}</div>
      </div>
    `;
    li.addEventListener('click', () => {
      loadTrack(i, true);
      closeModal('modal-queue');
    });
    $queueList.appendChild(li);
  });
}

/* ─── MODAL HELPERS ─────────────────────────────────────────────── */
function openModal(id) {
  if (id === 'modal-queue') renderQueue();
  if (id === 'modal-playlists') renderPlaylists();
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) closeModal(el.id);
  });
});

/* ─── PWA INSTALL ───────────────────────────────────────────────── */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  $pwaBtn.classList.remove('hidden');
});
if ($pwaBtn) {
  $pwaBtn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') deferredInstall = null;
  });
}

/* ─── FORMAT TIME ───────────────────────────────────────────────── */
function formatTime(s) {
  if (isNaN(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

/* ─── KEYBOARD SHORTCUTS ────────────────────────────────────────── */
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowRight' && e.shiftKey) nextTrack();
  else if (e.code === 'ArrowLeft' && e.shiftKey) prevTrack();
  else if (e.code === 'KeyM') toggleMute();
});

/* ─── TAB SWITCHING & PAGE LIFECYCLE ────────────────────────────── */
document.addEventListener('visibilitychange', () => {
  saveCurrentState();
});

window.addEventListener('beforeunload', saveCurrentState);

/* ─── INITIAL BOOTSTRAP ─────────────────────────────────────────── */
renderPlaylists();
renderQueue();
updateTrackUI(currentIdx);
setVolumePct(preVolume);
