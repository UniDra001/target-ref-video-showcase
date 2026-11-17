// Target <-> Reference Video Showcase

let ALL_SAMPLES = [];
let FILTERED = [];
let CUR_FILTER = 'all';
let SEARCH_Q = '';
let SHUFFLED = false;
let HOVER_PLAY = false;
let PAGE_SIZE = 20;
let OFFSET = 0;
let THEATER_POS = -1;
let THEATER_AUDIO = 'all'; // 'all' | 'target' | 'ref'

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function pad3(n) { return String(n).padStart(3, '0'); }
function fmtDur(d) { return d ? d.toFixed(1) + 's' : ''; }
function aspectLabel(w, h) {
  if (!w || !h) return '';
  return h > w ? '9:16' : (w > h ? '16:9' : '1:1');
}

// ---- Theme ----
function isLight() { return document.documentElement.classList.contains('theme-light'); }
function applyTheme(light) {
  document.documentElement.classList.toggle('theme-light', light);
  const b = document.getElementById('themeBtn');
  if (b) { b.textContent = light ? '🌙' : '☀️'; b.title = light ? '切换到深色模式' : '切换到浅色模式'; }
}
function toggleTheme() {
  const next = !isLight();
  try { localStorage.setItem('showcase_theme', next ? 'light' : 'dark'); } catch(e) {}
  applyTheme(next);
}

// ---- Filter / Search / Shuffle ----
function setFilter(f) {
  CUR_FILTER = f;
  document.querySelectorAll('#filterPills .pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  OFFSET = 0;
  recompute();
}
function onSearch(v) {
  SEARCH_Q = v.trim().toLowerCase();
  OFFSET = 0;
  recompute();
}
function toggleShuffle() {
  SHUFFLED = !SHUFFLED;
  const b = document.getElementById('shuffleBtn');
  b.classList.toggle('active', SHUFFLED);
  b.querySelector('span').textContent = SHUFFLED ? '↺ Original Order' : '🎲 Shuffle';
  OFFSET = 0;
  recompute();
}
function toggleHoverPlay() {
  HOVER_PLAY = !HOVER_PLAY;
  const b = document.getElementById('hoverBtn');
  b.classList.toggle('active', HOVER_PLAY);
}

function seededShuffle(arr) {
  const out = arr.slice();
  let seed = 20261117;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

function recompute() {
  let list = ALL_SAMPLES.slice();
  if (CUR_FILTER === 'multi') list = list.filter(s => s.ref_video_count > 1);
  else if (CUR_FILTER === 'single') list = list.filter(s => s.ref_video_count === 1);
  else if (CUR_FILTER === 'portrait') list = list.filter(s => s.has_portrait);
  else if (CUR_FILTER === 'audio') list = list.filter(s => s.has_audio_ref);

  if (SEARCH_Q) {
    const q = SEARCH_Q.replace(/^#/, '');
    list = list.filter(s => {
      if (String(s.idx) === q || pad3(s.idx).includes(q)) return true;
      if (s.target.id.toLowerCase().includes(q)) return true;
      return s.refs.some(g => g.items.some(it => it.id.toLowerCase().includes(q)));
    });
  }
  if (SHUFFLED) list = seededShuffle(list);
  FILTERED = list;
  renderPage();
}

// ---- Lazy Video Loading & Cleanup ----
let _videoIO = null;
function pauseAllVisibleMedia() {
  document.querySelectorAll('#pairsList video, #pairsList audio').forEach(m => {
    try { m.pause(); } catch(e) {}
  });
}

function createVideoEl(src, mutedByDefault) {
  const v = document.createElement('video');
  v.controls = true;
  v.preload = 'metadata';
  v.playsInline = true;
  if (mutedByDefault) v.muted = true;
  v.src = src;
  return v;
}

function loadLazyVideo(el) {
  if (el.dataset.loaded) return;
  el.dataset.loaded = '1';
  const v = createVideoEl(el.dataset.src, false);
  const stage = el.parentElement;
  el.replaceWith(v);
  if (stage) bindHoverPreview(stage, v);
}

function bindHoverPreview(stage, video) {
  stage.addEventListener('mouseenter', () => {
    if (!HOVER_PLAY) return;
    video.dataset.preMuted = video.muted ? '1' : '0';
    video.muted = true;
    video.play().catch(() => {});
  });
  stage.addEventListener('mouseleave', () => {
    if (!HOVER_PLAY) return;
    video.pause();
    if (video.dataset.preMuted === '0') video.muted = false;
  });
}

function observeLazyVideos(root) {
  if (!root) return;
  const els = root.querySelectorAll('.lazy-video');
  if (!('IntersectionObserver' in window)) { els.forEach(loadLazyVideo); return; }
  if (!_videoIO) {
    _videoIO = new IntersectionObserver(ents => {
      ents.forEach(e => {
        if (e.isIntersecting) {
          loadLazyVideo(e.target);
          _videoIO.unobserve(e.target);
        }
      });
    }, { rootMargin: '320px' });
  }
  els.forEach(el => {
    _videoIO.observe(el);
    el.addEventListener('click', () => loadLazyVideo(el), { once: true });
  });
}

// ---- Card Rendering ----
function videoCardHtml(item, roleLabel, pillClass, eager) {
  const src = `${item.file}#t=0.1`;
  const portraitCls = (item.h > item.w && item.w > 0) ? ' portrait' : '';
  const mediaInner = eager
    ? `<video controls preload="metadata" playsinline src="${esc(src)}"></video>`
    : `<div class="lazy-video" data-src="${esc(src)}"><div class="play-orb">▶</div></div>`;
  const spec = [fmtDur(item.dur), aspectLabel(item.w, item.h)].filter(Boolean)
    .map(t => `<span class="spec-chip">${esc(t)}</span>`).join('');

  return `
    <div class="media-card">
      <div class="video-stage${portraitCls}">${mediaInner}</div>
      <div class="media-foot">
        <div class="media-foot-left">
          <span class="role-pill ${pillClass}">${esc(roleLabel)}</span>
          <span class="hash-id" title="${esc(item.id)}">${esc(item.id)}</span>
        </div>
        <div class="spec-chips">${spec}</div>
      </div>
    </div>`;
}

function subjectCardHtml(group, subjIndex, eager) {
  const pillCls = 's' + (((subjIndex) % 4) + 1);
  const videos = group.items.filter(it => it.type === 'video');
  const audios = group.items.filter(it => it.type === 'audio');

  let cards = videos.map(v => {
    const src = `${v.file}#t=0.1`;
    const portraitCls = (v.h > v.w && v.w > 0) ? ' portrait' : '';
    const mediaInner = eager
      ? `<video controls preload="metadata" playsinline src="${esc(src)}"></video>`
      : `<div class="lazy-video" data-src="${esc(src)}"><div class="play-orb">▶</div></div>`;
    const spec = [fmtDur(v.dur), aspectLabel(v.w, v.h)].filter(Boolean)
      .map(t => `<span class="spec-chip">${esc(t)}</span>`).join('');
    const audioBars = audios.map(a => `
      <div class="audio-strip">
        <span class="role-pill s2">Ref Audio</span>
        <audio controls preload="metadata" src="${esc(a.file)}"></audio>
      </div>`).join('');
    return `
      <div class="media-card">
        <div class="video-stage${portraitCls}">${mediaInner}</div>
        <div class="media-foot">
          <div class="media-foot-left">
            <span class="role-pill ${pillCls}">${esc(group.subject)}</span>
            <span class="hash-id" title="${esc(v.id)}">${esc(v.id)}</span>
          </div>
          <div class="spec-chips">${spec}</div>
        </div>
        ${audioBars}
      </div>`;
  }).join('');

  if (!videos.length && audios.length) {
    cards = audios.map(a => `
      <div class="media-card">
        <div class="audio-strip">
          <span class="role-pill ${pillCls}">${esc(group.subject)} Audio</span>
          <audio controls preload="metadata" src="${esc(a.file)}"></audio>
          <span class="spec-chip">${esc(fmtDur(a.dur))}</span>
        </div>
      </div>`).join('');
  }
  return cards;
}

function renderPairCard(s, fi) {
  const refCards = s.refs.map((g, gi) => subjectCardHtml(g, gi, false)).join('');
  const multiCls = s.ref_video_count > 1 ? ' multi' : '';
  const multiTag = s.ref_video_count > 1
    ? `<span class="pair-tag">${s.ref_video_count} Reference Videos</span>` : '';
  const audioTag = s.has_audio_ref
    ? `<span class="pair-tag audio">+ Ref Audio</span>` : '';

  return `
    <article class="pair-card" id="pair-${fi}" data-fi="${fi}">
      <div class="pair-card-bar">
        <div class="pair-left-meta">
          <span class="sample-badge">#${pad3(s.idx)}</span>
          ${multiTag}
          ${audioTag}
        </div>
        <div class="pair-actions">
          <button class="row-btn" id="sync-btn-${fi}" onclick="toggleRowSync(${fi})">▶ Sync Play</button>
          <button class="row-btn" onclick="openTheater(${fi})">⤢ Compare</button>
        </div>
      </div>
      <div class="pair-grid">
        <div class="target-col">
          ${videoCardHtml(s.target, 'Target', 'target', false)}
        </div>
        <div class="ref-col">
          <div class="ref-subgrid${multiCls}">${refCards}</div>
        </div>
      </div>
    </article>`;
}

function renderPage() {
  pauseAllVisibleMedia();
  const listEl = document.getElementById('pairsList');
  if (!FILTERED.length) {
    listEl.innerHTML = `<div class="empty-state">没有匹配的样本，请清除筛选条件试试。</div>`;
    renderPagers();
    return;
  }
  const slice = FILTERED.slice(OFFSET, OFFSET + PAGE_SIZE);
  listEl.innerHTML = slice.map((s, i) => renderPairCard(s, OFFSET + i)).join('');
  observeLazyVideos(listEl);
  renderPagers();
}

// ---- Sync Play inside a Row ----
function ensureCardVideosLoaded(card) {
  card.querySelectorAll('.lazy-video').forEach(loadLazyVideo);
}
function toggleRowSync(fi) {
  const card = document.getElementById(`pair-${fi}`);
  const btn = document.getElementById(`sync-btn-${fi}`);
  if (!card || !btn) return;
  ensureCardVideosLoaded(card);
  const vids = Array.from(card.querySelectorAll('video'));
  if (!vids.length) return;
  const anyPlaying = vids.some(v => !v.paused && !v.ended);
  if (anyPlaying) {
    vids.forEach(v => v.pause());
    btn.classList.remove('playing');
    btn.textContent = '▶ Sync Play';
  } else {
    vids.forEach(v => {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    });
    btn.classList.add('playing');
    btn.textContent = '⏸ Pause Pair';
  }
}

// ---- Pagination ----
function pagerHtml() {
  const total = FILTERED.length;
  const end = Math.min(OFFSET + PAGE_SIZE, total);
  const sizeSel = `
    <select onchange="changePageSize(this.value)" aria-label="Per page">
      ${[10, 20, 50].map(n => `<option value="${n}" ${n===PAGE_SIZE?'selected':''}>${n} / page</option>`).join('')}
    </select>`;
  return `
    <div class="pager-group">
      ${sizeSel}
      <span>Showing <b>${total ? OFFSET + 1 : 0}–${end}</b> of <b>${total}</b> pairs</span>
    </div>
    <div class="pager-group">
      <button onclick="goPage(${OFFSET - PAGE_SIZE})" ${OFFSET <= 0 ? 'disabled' : ''}>← Previous</button>
      <button onclick="goPage(${OFFSET + PAGE_SIZE})" ${end >= total ? 'disabled' : ''}>Next →</button>
    </div>`;
}
function renderPagers() {
  const html = pagerHtml();
  document.getElementById('pagerTop').innerHTML = html;
  document.getElementById('pagerBottom').innerHTML = html;
}
function changePageSize(v) {
  PAGE_SIZE = parseInt(v, 10) || 20;
  OFFSET = 0;
  renderPage();
}
function goPage(newOff) {
  OFFSET = Math.max(0, Math.min(newOff, Math.max(0, FILTERED.length - 1)));
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Theater Mode ----
function openTheater(fi) {
  pauseAllVisibleMedia();
  THEATER_POS = fi;
  renderTheaterContent();
  const dlg = document.getElementById('theater');
  if (!dlg.open) dlg.showModal();
}
function closeTheater() {
  const dlg = document.getElementById('theater');
  pauseTheaterMedia();
  if (dlg.open) dlg.close();
  THEATER_POS = -1;
}
function pauseTheaterMedia() {
  document.querySelectorAll('#theater video, #theater audio').forEach(m => {
    try { m.pause(); } catch(e) {}
  });
}
function renderTheaterContent() {
  const s = FILTERED[THEATER_POS];
  if (!s) return;
  document.getElementById('thBadge').textContent = `#${pad3(s.idx)}`;
  document.getElementById('thMeta').textContent =
    `1 Target Video · ${s.ref_video_count} Reference Video${s.ref_video_count > 1 ? 's' : ''}` +
    (s.has_audio_ref ? ' + Ref Audio' : '');
  document.getElementById('thPrev').disabled = THEATER_POS <= 0;
  document.getElementById('thNext').disabled = THEATER_POS >= FILTERED.length - 1;

  document.getElementById('thTarget').innerHTML = videoCardHtml(s.target, 'Target', 'target', true);
  const refsEl = document.getElementById('thRefs');
  refsEl.className = 'theater-refs-grid' + (s.ref_video_count > 1 ? ' multi' : '');
  refsEl.innerHTML = s.refs.map((g, gi) => subjectCardHtml(g, gi, true)).join('');

  applyTheaterAudioMode();
  updateTheaterPlayBtn(false);
}
function stepTheater(delta) {
  const next = THEATER_POS + delta;
  if (next < 0 || next >= FILTERED.length) return;
  pauseTheaterMedia();
  THEATER_POS = next;
  renderTheaterContent();
}
function updateTheaterPlayBtn(playing) {
  const b = document.getElementById('thPlayBtn');
  if (b) b.textContent = playing ? '⏸ Pause Both' : '▶ Sync Play Both';
}
function toggleTheaterSync() {
  const vids = Array.from(document.querySelectorAll('#theater video'));
  if (!vids.length) return;
  const anyPlaying = vids.some(v => !v.paused && !v.ended);
  if (anyPlaying) {
    vids.forEach(v => v.pause());
    updateTheaterPlayBtn(false);
  } else {
    vids.forEach(v => {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    });
    updateTheaterPlayBtn(true);
  }
}
function restartTheaterSync() {
  const vids = Array.from(document.querySelectorAll('#theater video'));
  vids.forEach(v => { v.currentTime = 0; v.play().catch(() => {}); });
  updateTheaterPlayBtn(true);
}
function setTheaterAudio(mode) {
  THEATER_AUDIO = mode;
  document.querySelectorAll('.audio-seg .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.audio === mode);
  });
  applyTheaterAudioMode();
}
function applyTheaterAudioMode() {
  const tVids = document.querySelectorAll('#thTarget video');
  const rMedia = document.querySelectorAll('#thRefs video, #thRefs audio');
  tVids.forEach(v => { v.muted = (THEATER_AUDIO === 'ref'); });
  rMedia.forEach(m => { m.muted = (THEATER_AUDIO === 'target'); });
}

// ---- Events ----
document.getElementById('theater').addEventListener('click', e => {
  if (e.target.id === 'theater') closeTheater();
});
document.addEventListener('keydown', e => {
  const dlg = document.getElementById('theater');
  if (!dlg.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeTheater(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); stepTheater(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepTheater(1); }
  else if (e.key === ' ') {
    e.preventDefault();
    if (document.activeElement && (document.activeElement.tagName === 'VIDEO' || document.activeElement.tagName === 'BUTTON')) {
      document.activeElement.blur();
    }
    toggleTheaterSync();
  }
});

// ---- Init ----
function init() {
  applyTheme(isLight());
  const payload = window.SHOWCASE_DATA;
  if (!payload || !payload.samples) {
    document.getElementById('pairsList').innerHTML =
      '<div class="empty-state">Failed to load data.js</div>';
    return;
  }
  ALL_SAMPLES = payload.samples;
  const st = payload.stats;
  document.getElementById('statsLine').textContent =
    `${st.total_samples} Sampled Pairs · ${st.total_videos} Videos · ${st.multi_ref_samples} Multi-Subject Refs · 480p Web Showcase`;
  document.getElementById('cnt-all').textContent = st.total_samples;
  document.getElementById('cnt-multi').textContent = st.multi_ref_samples;
  document.getElementById('cnt-single').textContent = st.total_samples - st.multi_ref_samples;
  document.getElementById('cnt-portrait').textContent = st.portrait_samples;
  document.getElementById('cnt-audio').textContent = st.audio_ref_samples;
  recompute();
}
init();
