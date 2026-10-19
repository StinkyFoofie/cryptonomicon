/* ==========================================================================
   LAYER 5: APPLICATION LOGIC (app.js — Vanilla JS + Firebase + Particle Engine)
   ========================================================================== */
// --- 1. FIREBASE SDK IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, deleteDoc, collection, onSnapshot, getDocs, initializeFirestore, persistentLocalCache, persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// --- 2. GLOBAL STATE & v0.67 [X-002] UNIFIED NOMICON STORAGE ---
const C = window.CONFIG;
let db;
const localDbRaw = localStorage.getItem('nomicon_db');
let games = localDbRaw ? JSON.parse(localDbRaw) : {}; 

const themesList = Object.keys(C.THEME_NAMES).map(key => ({
  id: key,
  name: C.THEME_NAMES[key]
}));

const localSettingsRaw = localStorage.getItem('nomicon_settings');
let settings = localSettingsRaw ? JSON.parse(localSettingsRaw) : { 
  theme: C.DEFAULT_THEME, 
  dbColl: C.DB_COLLECTION
};

let activeThemeToApply = settings.theme;
if (settings.theme === 'random' || !settings.theme) {
  let sessionTheme = sessionStorage.getItem('nomicon_session_theme');
  if (!sessionTheme) {
    sessionTheme = themesList[Math.floor(Math.random() * themesList.length)].id;
  }
  sessionStorage.setItem('nomicon_session_theme', sessionTheme);
  activeThemeToApply = sessionTheme;
}

let lastSyncTime = new Date();
let currentRating = 0; 

// DOM Elements
const els = {
  appTitle: document.getElementById('ui-app-name'), appVer: document.getElementById('ui-app-version'), 
  search: document.getElementById('global-search'), btnAdd: document.getElementById('btn-add-game'), 
  empty: document.getElementById('empty-state'), emptyText: document.getElementById('empty-text'),
  lib: document.getElementById('library-container'), 
  toast: document.getElementById('toast'), 
  trayDate: document.getElementById('tray-date'), trayTime: document.getElementById('tray-time'), 
  traySyncDot: document.getElementById('tray-sync-dot'), 
  modalRawgDot: document.getElementById('modal-rawg-dot'),
  modalGameRawgDot: document.getElementById('modal-game-rawg-dot'),
  lblRawgStatusText: document.getElementById('lbl-rawg-status-text'),
  btnSync: document.getElementById('btn-force-sync'), btnTheme: document.getElementById('btn-open-theme'),
  
  // Filters & View Toggles
  fStatus: document.getElementById('filter-status'), fPlatform: document.getElementById('filter-platform'),
  btnClearFilters: document.getElementById('btn-clear-filters'),
  viewToggle: document.getElementById('view-toggle'), btnGrid: document.getElementById('btn-grid-view'), btnList: document.getElementById('btn-list-view'),
  btnStats: document.getElementById('btn-open-stats'),
  btnRandom: document.getElementById('btn-random-game'),
  
  // Theme Modal
  mTheme: document.getElementById('modal-theme'), themeGrid: document.getElementById('theme-grid-container'),

  // Stats Modal
  mStats: document.getElementById('modal-stats'), mStatsBody: document.getElementById('modal-stats-body'),
  btnCloseStats: document.getElementById('btn-close-stats'), btnDismissStats: document.getElementById('btn-dismiss-stats'),
  
  // Randomizer Modal & FX Canvas
  mRandom: document.getElementById('modal-randomizer'), diceCube: document.getElementById('dice-cube'),
  diceDisco: document.getElementById('dice-disco'),
  randomRes: document.getElementById('random-result'), btnCloseRandom: document.getElementById('btn-close-randomizer'),
  fxCanvas: document.getElementById('fx-canvas'),

  // Modal Game
  mGame: document.getElementById('modal-game'), mGameBody: document.getElementById('modal-game-body'),
  mGameTitle: document.getElementById('modal-game-title'), form: document.getElementById('game-form'),
  btnSave: document.getElementById('btn-save-game'), btnCancel: document.getElementById('btn-cancel-game'),
  btnDelPrompt: document.getElementById('btn-delete-prompt'), hltbLink: document.getElementById('hltb-link'),
  btnRefreshRawg: document.getElementById('btn-refresh-rawg'),
  
  // Delete Confirmation Modal
  mDelete: document.getElementById('modal-confirm-delete'), btnConfirmDel: document.getElementById('btn-confirm-delete'),
  btnCancelDel: document.getElementById('btn-cancel-delete'), mConfirmBody: document.getElementById('modal-confirm-body'),

  // Cache Confirmation Modal
  mConfirmCache: document.getElementById('modal-confirm-cache'), mConfirmCacheBody: document.getElementById('modal-confirm-cache-body'),
  btnConfirmClearCache: document.getElementById('btn-confirm-clear-cache'), btnCancelClearCache: document.getElementById('btn-cancel-clear-cache'),

  // Schema Inputs
  f: {
    id: document.getElementById('f-id'), title: document.getElementById('f-title'),
    rawgUpdated: document.getElementById('f-rawg-updated'),
    rawgSynced: document.getElementById('f-rawg-synced'),
    desc: document.getElementById('f-desc'), dev: document.getElementById('f-developer'),
    pub: document.getElementById('f-publisher'),
    releaseDate: document.getElementById('f-release-date'),
    genres: document.getElementById('f-genres') || document.getElementById('f-genre'),
    plat: document.getElementById('f-platform'), format: document.getElementById('f-format'),
    edition: document.getElementById('f-edition'),
    price: document.getElementById('f-price'), curr: document.getElementById('f-currency'),
    status: document.getElementById('f-status'), 
    ratingContainer: document.getElementById('f-rating-interactive'),
    rawgScore: document.getElementById('f-rawg-score'), url: document.getElementById('f-cover-url'),
    dateAdd: document.getElementById('f-date-added'), dateComp: document.getElementById('f-date-completed'),
    playtime: document.getElementById('f-playtime'), hltbM: document.getElementById('f-hltb-main'),
    hltbE: document.getElementById('f-hltb-extras'), hltbC: document.getElementById('f-hltb-comp'),
    notes: document.getElementById('f-notes'), achE: document.getElementById('f-ach-earned'),
    achT: document.getElementById('f-ach-total'), lblAch: document.getElementById('lbl-achievements'),
    rawgRes: document.getElementById('rawg-results'), coverImg: document.getElementById('cover-preview-img'),
    coverText: document.getElementById('cover-preview-text')
  },
  
  // Settings
  mSettings: document.getElementById('modal-settings'), mSetBody: document.getElementById('modal-settings-body'),
  btnSettings: document.getElementById('btn-open-settings'), btnCloseSettings: document.getElementById('btn-close-settings'),
  sGenresCloud: document.getElementById('s-genres-cloud'),
  btnAuditCache: document.getElementById('btn-audit-cache'), btnAuditRawg: document.getElementById('btn-audit-rawg'),
  btnClearCache: document.getElementById('btn-clear-cache')
};

// --- Sanitized API Key Accessors ---
const getRawgKey = () => (C.RAWG_API_KEY || "").trim();

// --- Currency Price 2-Decimal Formatter ---
function formatCurrencyPrice(val) {
  if (val === undefined || val === null || String(val).trim() === '') return '';
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return '';
  return num.toFixed(2);
}

// --- v0.65 DELTA: Universal Full-Month MMMM DD, YYYY Date Formatter (Timezone-Safe for ISO Dates) ---
function formatDisplayDate(dateInput) {
  if (!dateInput) return '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (trimmed === (C.PLACEHOLDERS.TBA_LABEL || 'To Be Announced...')) return trimmed;
    const isoDayMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDayMatch) {
      const year = parseInt(isoDayMatch[1], 10);
      const monthIdx = parseInt(isoDayMatch[2], 10) - 1;
      const day = parseInt(isoDayMatch[3], 10);
      if (monthIdx >= 0 && monthIdx < 12 && day >= 1 && day <= 31) {
        return `${months[monthIdx]} ${day}, ${year}`;
      }
    }
  }
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// --- v0.65 DELTA: Full-Month Date-First Military Timestamp & Timezone Formatter ---
function formatSyncTimestamp(dateInput = new Date()) {
  if (typeof dateInput === 'string') {
    const abbrMap = {
      Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
      Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December'
    };
    const match = dateInput.trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2},\s+\d{4}\s+.*)$/);
    if (match && abbrMap[match[1]]) {
      return `${abbrMap[match[1]]} ${match[2]}`;
    }
    const fullMatch = dateInput.trim().match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+.*$/);
    if (fullMatch) return dateInput.trim();
  }
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const tzMatch = d.toString().match(/\(([A-Za-z\s].*)\)/);
  const tz = tzMatch ? tzMatch[1].split(' ').map(w => w[0]).join('') : '';
  const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}${tz ? ' ' + tz : ''}`;
  const dateStr = formatDisplayDate(d);
  return `${dateStr} ${timeStr}`;
}

// --- v0.65 DELTA: Intelligent Date Parser (MMMM DD, YYYY, MMM DD, YYYY & ISO YYYY-MM-DD) ---
function parseUserInputDate(str) {
  if (!str || !String(str).trim()) return '';
  const s = String(str).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const check = new Date(y, m - 1, d);
    if (check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d) {
      return s;
    }
    return null;
  }
  const monthNames = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december'
  ];
  const monthAbbrFull = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const namedMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedMatch) {
    const mToken = namedMatch[1].toLowerCase();
    let mIdx = monthNames.indexOf(mToken);
    if (mIdx === -1) mIdx = monthAbbrFull.indexOf(mToken.slice(0, 3));
    const dayNum = parseInt(namedMatch[2], 10);
    const yearNum = parseInt(namedMatch[3], 10);
    if (mIdx !== -1) {
      const check = new Date(yearNum, mIdx, dayNum);
      if (check.getFullYear() === yearNum && check.getMonth() === mIdx && check.getDate() === dayNum) {
        return `${yearNum}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
      return null;
    }
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// --- Dynamic Date Beat / Completed Contextual UI Switcher ---
function updateCompletionDateUI(statusVal) {
  const lbl = document.getElementById('lbl-date-completed');
  if (!lbl) return;
  if (statusVal === "Completed") {
    lbl.innerText = "Date Completed";
  } else if (statusVal === "Beat") {
    lbl.innerText = "Date Beat";
  } else {
    lbl.innerText = "Date Beat or Completed";
  }
  if (els.f.dateComp) {
    els.f.dateComp.placeholder = C.PLACEHOLDERS.DATE_COMPLETED || "Select Beat or Completed Status...";
  }
}

// --- Universal Custom Themeable Datepicker Engine ---
let datepickerPopoverEl = null;
function initCustomDatePicker() {
  let activeInput = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  const popover = document.createElement('div');
  popover.className = 'custom-datepicker-popover';
  popover.innerHTML = `
    <div class="dp-header">
      <button type="button" class="dp-nav-btn" id="dp-prev">&lt;</button>
      <span class="dp-title" id="dp-month-label"></span>
      <button type="button" class="dp-nav-btn" id="dp-next">&gt;</button>
    </div>
    <div class="dp-weekdays">
      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
    </div>
    <div class="dp-grid" id="dp-grid-days"></div>
    <div class="dp-footer">
      <button type="button" id="dp-today">Today</button>
      <button type="button" id="dp-clear">Clear</button>
    </div>
  `;
  document.body.appendChild(popover);
  datepickerPopoverEl = popover;

  function positionPopover(inputEl) {
    if (!inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    const popWidth = 280;
    const popHeight = 310;
    let left = rect.left;
    if (left + popWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - popWidth - 10);
    }
    let top = rect.bottom + 4;
    if (top + popHeight > window.innerHeight - 10 && rect.top > popHeight + 10) {
      top = rect.top - popHeight - 4;
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function renderDays() {
    const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    document.getElementById('dp-month-label').innerText = `${months[viewMonth]} ${viewYear}`;
    const grid = document.getElementById('dp-grid-days');
    grid.innerHTML = '';

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayISO = getLocalTodayISO();
    const currentSelectedISO = activeInput ? (parseUserInputDate(activeInput.value) || '') : '';

    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'dp-day disabled';
      grid.appendChild(emptyCell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'dp-day';
      cell.innerText = d;
      const thisISO = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (thisISO === todayISO) cell.classList.add('today');
      if (thisISO === currentSelectedISO) cell.classList.add('selected');
      if (thisISO > todayISO) cell.classList.add('disabled');

      cell.onclick = (e) => {
        e.stopPropagation();
        if (activeInput) {
          activeInput.value = formatDisplayDate(thisISO);
          updateDateClass(activeInput);
        }
        popover.classList.remove('active');
      };
      grid.appendChild(cell);
    }
  }

  document.getElementById('dp-prev').onclick = (e) => {
    e.stopPropagation();
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderDays();
  };
  document.getElementById('dp-next').onclick = (e) => {
    e.stopPropagation();
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderDays();
  };
  document.getElementById('dp-today').onclick = (e) => {
    e.stopPropagation();
    if (activeInput) {
      activeInput.value = formatDisplayDate(new Date());
      updateDateClass(activeInput);
    }
    popover.classList.remove('active');
  };
  document.getElementById('dp-clear').onclick = (e) => {
    e.stopPropagation();
    if (activeInput) {
      activeInput.value = '';
      updateDateClass(activeInput);
    }
    popover.classList.remove('active');
  };

  document.querySelectorAll('.btn-date-picker').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      if (activeInput === input && popover.classList.contains('active')) {
        popover.classList.remove('active');
        return;
      }

      activeInput = input;
      const parsedISO = parseUserInputDate(input.value);
      if (parsedISO) {
        const parts = parsedISO.split('-');
        viewYear = parseInt(parts[0], 10);
        viewMonth = parseInt(parts[1], 10) - 1;
      } else {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
      }

      renderDays();
      positionPopover(input);
      popover.classList.add('active');
    };
  });

  [els.f.dateAdd, els.f.dateComp].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('blur', () => {
      const val = inp.value.trim();
      if (!val) {
        updateDateClass(inp);
        return;
      }
      const iso = parseUserInputDate(val);
      const todayISO = getLocalTodayISO();
      if (!iso) {
        showToast(C.MESSAGES.DATE_INVALID_ERROR);
        inp.value = '';
        updateDateClass(inp);
      } else if (iso > todayISO) {
        showToast(C.MESSAGES.DATE_FUTURE_ERROR);
        inp.value = '';
        updateDateClass(inp);
      } else {
        inp.value = formatDisplayDate(iso);
        updateDateClass(inp);
      }
    });
  });

  if (els.mGameBody) {
    els.mGameBody.addEventListener('scroll', () => {
      if (popover.classList.contains('active') && activeInput) {
        positionPopover(activeInput);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && !e.target.closest('.btn-date-picker')) {
      popover.classList.remove('active');
    }
  });
}

// --- Dynamic Asset Engine ---
function applyDynamicAssets() {
  if(!C.ASSETS) return;
  
  const getMime = (path) => {
    if(!path) return '';
    const lower = path.toLowerCase();
    if(lower.endsWith('.svg')) return 'image/svg+xml';
    if(lower.endsWith('.png')) return 'image/png';
    return '';
  };

  if(C.ASSETS.FAVICON_DESKTOP) {
    const el = document.getElementById('favicon-desktop');
    if(el) { el.setAttribute('href', `./${C.ASSETS.FAVICON_DESKTOP}`); el.type = getMime(C.ASSETS.FAVICON_DESKTOP); }
  }
  
  if(C.ASSETS.FAVICON_MOBILE) {
    const el1 = document.getElementById('favicon-mobile-1');
    const el2 = document.getElementById('favicon-mobile-2');
    const mime = getMime(C.ASSETS.FAVICON_MOBILE);
    if(el1) { el1.setAttribute('href', `./${C.ASSETS.FAVICON_MOBILE}`); if(mime) el1.type = mime; }
    if(el2) { el2.setAttribute('href', `./${C.ASSETS.FAVICON_MOBILE}`); if(mime) el2.type = mime; }
  }
  
  if(C.ASSETS.LOGO_BRAND) {
    const img = document.getElementById('brand-logo-img');
    if(img) {
        img.setAttribute('src', `./${C.ASSETS.LOGO_BRAND}`);
        img.style.display = 'block';
    }
  }
}

// --- CUSTOM THEMEABLE DROPDOWN ENGINE ---
function initializeCustomSelects() {
  document.querySelectorAll('select.native-hijack').forEach(select => {
    if (select.parentNode.classList.contains('custom-select-wrapper')) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger empty';
    
    let initialText = select.options[0].text;
    if (select.value) {
      const activeOpt = Array.from(select.options).find(o => o.value === select.value);
      if (activeOpt) { initialText = activeOpt.text; trigger.classList.remove('empty'); }
    }
    trigger.innerHTML = `<span>${initialText}</span>`;
    
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-options-container';
    
    if (select.dataset.selectId) {
       optionsContainer.dataset.selectId = select.dataset.selectId;
    } else if (select.id) {
       optionsContainer.dataset.selectId = select.id;
    }
    
    Array.from(select.options).forEach((option) => {
      if (option.disabled || option.hidden) return;

      const optEl = document.createElement('div');
      optEl.className = 'custom-option';
      if(option.value === select.value) optEl.classList.add('selected');
      optEl.innerText = option.text;
      
      optEl.addEventListener('click', (e) => {
        select.value = option.value;
        trigger.querySelector('span').innerText = option.text;
        trigger.classList.remove('empty');
        wrapper.classList.remove('open');
        optionsContainer.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        optEl.classList.add('selected');
        select.dispatchEvent(new Event('change'));
        e.stopPropagation();
      });
      
      optionsContainer.appendChild(optEl);
    });
    
    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsContainer);
    
    trigger.addEventListener('click', (e) => {
      const wasOpen = wrapper.classList.contains('open');
      
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
      });
      
      if (!wasOpen) {
        wrapper.classList.add('open');
        
        // Universal 5-Item Max Visible Height Clamping Across All Themes
        const visibleOpts = Array.from(optionsContainer.querySelectorAll('.custom-option'));
        if(visibleOpts.length > 5) {
            let totalHeight = 0;
            for(let i = 0; i < 5; i++) {
                totalHeight += visibleOpts[i].getBoundingClientRect().height;
            }
            optionsContainer.style.maxHeight = `${Math.ceil(totalHeight) + 2}px`;
        }
        
        optionsContainer.scrollTop = 0;
      }
      e.stopPropagation();
    });
  });
  
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  });
}

function syncCustomSelect(selectId) {
  const select = document.getElementById(selectId);
  if(!select) return;
  const wrapper = select.parentNode;
  if(!wrapper || !wrapper.classList.contains('custom-select-wrapper')) return;
  const trigger = wrapper.querySelector('.custom-select-trigger span');
  const triggerEl = wrapper.querySelector('.custom-select-trigger');
  const options = wrapper.querySelectorAll('.custom-option');
  
  options.forEach(o => o.classList.remove('selected'));
  
  if(select.value === "") {
      trigger.innerText = select.options[0].text;
      triggerEl.classList.add('empty');
  } else {
      const activeOpt = Array.from(select.options).find(o => o.value === select.value);
      if(activeOpt) {
          trigger.innerText = activeOpt.text;
          triggerEl.classList.remove('empty');
          const targetEl = Array.from(options).find(o => o.innerText === activeOpt.text);
          if(targetEl) targetEl.classList.add('selected');
      }
  }
}

// --- 3. INITIALIZATION & UI SETUP ---
const injectAlign = (emoji, text) => `<span class="optical-align"><span>${emoji}</span><span>${text}</span></span>`;
const splitEmoji = (str) => {
  const match = str.match(/^((?:[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)\s*(.*)$/u);
  return match ? (match[2] ? injectAlign(match[1], match[2]) : match[1]) : str;
};

const setVal = (el, val) => { if (el) el.value = val ?? ''; };

function formatWinnerBanner(str) {
  const match = str.match(/^([\p{Extended_Pictographic}\uD800-\uDBFF\uDC00-\uDFFF])\s*(.*?)\s*([\p{Extended_Pictographic}\uD800-\uDBFF\uDC00-\uDFFF])$/u);
  if (match) {
    return `<div class="winner-banner-wrap"><span class="winner-emoji-box">${match[1]}</span><span>${match[2]}</span><span class="winner-emoji-box">${match[3]}</span></div>`;
  }
  return splitEmoji(str);
}

// v0.66 DELTA [D-001]: Mobile WebKit Scroll-Anchor Lock Pattern
let savedScrollY = 0;
function toggleModalScrollLock(isActive) {
  if (isActive) {
    if (!document.body.classList.contains('modal-open')) {
      savedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = '100%';
      document.body.classList.add('modal-open');
    }
    requestAnimationFrame(syncAllModalScrollIndicators);
  } else {
    if (datepickerPopoverEl) datepickerPopoverEl.classList.remove('active');
    const openModals = document.querySelectorAll('.modal-overlay.active');
    if (openModals.length === 0 && document.body.classList.contains('modal-open')) {
      document.body.classList.remove('modal-open');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, savedScrollY);
    }
  }
}

// v0.67 DELTA [D-001]: Mobile Modal Themed Scroll Track & Indicator Engine
const modalScrollUpdaters = [];
function updateModalScrollIndicator(bodyEl, trackEl, thumbEl) {
  if (!bodyEl || !trackEl || !thumbEl) return;
  const scrollHeight = bodyEl.scrollHeight;
  const clientHeight = bodyEl.clientHeight;
  if (scrollHeight <= clientHeight + 2) {
    trackEl.classList.remove('visible');
    return;
  }
  trackEl.classList.add('visible');
  const trackHeight = trackEl.clientHeight || Math.max(40, clientHeight - 20);
  const ratio = clientHeight / scrollHeight;
  const thumbHeight = Math.max(24, Math.round(trackHeight * ratio));
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  const scrollPct = Math.min(1, Math.max(0, bodyEl.scrollTop / maxScroll));
  const maxTravel = Math.max(0, trackHeight - thumbHeight);
  const offsetY = Math.round(scrollPct * maxTravel);
  thumbEl.style.height = `${thumbHeight}px`;
  thumbEl.style.transform = `translateY(${offsetY}px)`;
}

function syncAllModalScrollIndicators() {
  modalScrollUpdaters.forEach(fn => fn());
}

function initModalScrollIndicators() {
  document.querySelectorAll('.modal-content').forEach(contentEl => {
    const bodyEl = contentEl.querySelector('.modal-body');
    if (!bodyEl) return;
    const hasFooter = !!contentEl.querySelector('.modal-footer');
    const trackEl = document.createElement('div');
    trackEl.className = `modal-scroll-track${hasFooter ? '' : ' no-footer'}`;
    const thumbEl = document.createElement('div');
    thumbEl.className = 'modal-scroll-thumb';
    trackEl.appendChild(thumbEl);
    contentEl.appendChild(trackEl);

    const updater = () => updateModalScrollIndicator(bodyEl, trackEl, thumbEl);
    modalScrollUpdaters.push(updater);
    bodyEl.addEventListener('scroll', updater, { passive: true });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => updater());
      ro.observe(bodyEl);
    }
  });
  window.addEventListener('resize', syncAllModalScrollIndicators, { passive: true });
}

// v0.67 DELTA [D-002]: Hardware Touch Gesture Quarantine on Modal Headers/Footers/Backdrops
function initModalTouchQuarantine() {
  document.querySelectorAll('.modal-header, .modal-footer').forEach(el => {
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('touchmove', (e) => {
      if (e.target === overlay) {
        e.preventDefault();
      }
    }, { passive: false });
  });
}

function init() {
  // v0.66 DELTA [X-005]: Dynamic iOS Apple PWA Standalone Meta Quarantine
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const appleCapableMeta = document.createElement('meta');
    appleCapableMeta.name = 'apple-mobile-web-app-capable';
    appleCapableMeta.content = 'yes';
    document.head.appendChild(appleCapableMeta);
  }

  applyDynamicAssets();
  const appleTitleMeta = document.getElementById('meta-apple-title');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', C.APP_SHORT_NAME || C.APP_NAME || "NOMICON");
  }
  document.getElementById('html-title').innerText = `${C.APP_NAME} v${C.APP_VERSION}`;
  if (els.appTitle) els.appTitle.innerText = C.APP_NAME;
  if (els.appVer) els.appVer.innerText = `v${C.APP_VERSION}`;
  els.search.placeholder = C.PLACEHOLDERS.SEARCH_PLACEHOLDER;
  document.getElementById('ui-settings-title').innerText = C.SETTINGS_TITLE;
  
  document.getElementById('s-appname-read').innerText = C.APP_NAME;
  document.getElementById('s-appver-read').innerText = `v${C.APP_VERSION}`;
  document.getElementById('s-apparch-read').innerText = C.APP_ARCHITECTURE;
  
  els.btnAdd.innerHTML = splitEmoji(C.BTN_ADD_GAME);
  els.btnSync.innerHTML = splitEmoji(C.BTN_FORCE_SYNC);
  els.btnTheme.innerHTML = splitEmoji(C.BTN_THEME);
  if (els.btnStats) els.btnStats.innerHTML = splitEmoji(C.BTN_STATS || "📊");
  els.btnRandom.innerHTML = splitEmoji(C.BTN_RANDOM_GAME);
  
  els.btnRefreshRawg.innerHTML = splitEmoji("🌐 RAWG SYNC");
  
  if (els.btnClearFilters) els.btnClearFilters.innerHTML = splitEmoji(C.BTN_CLEAR_FILTERS || "🧹 Clear Filters");
  if (els.btnSettings) els.btnSettings.innerHTML = splitEmoji(C.BTN_SETTINGS || "⚙️ Settings");
  
  document.getElementById('btn-close-game').innerHTML = "✕";
  document.getElementById('btn-close-theme').innerHTML = "✕";
  document.getElementById('btn-close-settings').innerHTML = "✕";
  if (els.btnCloseStats) els.btnCloseStats.innerHTML = "✕";
  
  els.mConfirmBody.innerText = C.MESSAGES.CONFIRM_DELETE;
  els.mConfirmCacheBody.innerText = C.MESSAGES.CACHE_CONFIRM;
  document.getElementById('modal-confirm-cache-title').innerHTML = splitEmoji("⚠️ Clear Cache");
  document.getElementById('modal-theme-title').innerHTML = splitEmoji("🎨 Select Theme");
  document.getElementById('modal-stats-title').innerHTML = splitEmoji("📊 Library Analytics");
  
  els.btnSave.innerHTML = splitEmoji("💾 Save");
  els.btnDelPrompt.innerHTML = splitEmoji("🗑 Delete");
  els.btnConfirmDel.innerHTML = splitEmoji("🗑 Delete");
  els.btnConfirmClearCache.innerHTML = splitEmoji("🗑️ Clear Data");
  els.btnAuditCache.innerHTML = splitEmoji(C.BTN_AUDIT_CACHE);
  els.btnClearCache.innerHTML = splitEmoji(C.BTN_CLEAR_CACHE);
  els.btnAuditRawg.innerHTML = splitEmoji(C.BTN_CHECK_RAWG);
  els.btnGrid.innerHTML = splitEmoji("🔲 Grid");
  els.btnList.innerHTML = splitEmoji("☰ List");
  els.btnCloseRandom.innerHTML = splitEmoji(C.BTN_WINNER_CONFIRM || "Awesome!");
  
  const chipNames = ["🔥 Must Play", "🏆 Masterpiece", "💤 Overrated", "💀 Brutal", "✨ Cozy"];
  document.getElementById('reaction-chips').innerHTML = chipNames.map(c => `<span class="chip">${splitEmoji(c)}</span>`).join('');
  
  const activeDbColl = settings.dbColl || C.DB_COLLECTION;
  document.getElementById('s-db-coll-read').innerText = `${activeDbColl} / {gameId}`;
  
  els.f.title.placeholder = C.PLACEHOLDERS.TITLE;
  if (els.f.rawgUpdated) els.f.rawgUpdated.placeholder = C.PLACEHOLDERS.RAWG_UPDATED || "Select Title...";
  if (els.f.rawgSynced) els.f.rawgSynced.placeholder = C.PLACEHOLDERS.RAWG_SYNCED || "Select Title...";
  if (els.f.releaseDate) els.f.releaseDate.placeholder = C.PLACEHOLDERS.RELEASE_DATE || "Select Title...";
  els.f.dateAdd.placeholder = C.PLACEHOLDERS.DATE_ADDED;
  els.f.dateComp.placeholder = C.PLACEHOLDERS.DATE_COMPLETED;
  els.f.coverText.innerText = C.PLACEHOLDERS.THUMBNAIL;
  els.f.desc.placeholder = C.PLACEHOLDERS.DESCRIPTION;
  els.f.dev.placeholder = C.PLACEHOLDERS.DEVELOPER;
  els.f.pub.placeholder = C.PLACEHOLDERS.PUBLISHER;
  if (els.f.genres) els.f.genres.placeholder = C.PLACEHOLDERS.GENRES;
  els.f.rawgScore.placeholder = C.PLACEHOLDERS.RAWG_RATING;
  
  els.f.plat.options[0].text = C.PLACEHOLDERS.PLATFORM;
  els.f.format.options[0].text = C.PLACEHOLDERS.FORMAT;
  if (els.f.edition) els.f.edition.options[0].text = C.PLACEHOLDERS.EDITION || "Select Edition...";
  els.f.status.options[0].text = C.PLACEHOLDERS.STATUS;
  els.fStatus.options[0].text = "All Statuses"; 
  els.fPlatform.options[0].text = "All Platforms";
  
  els.f.curr.innerHTML = `<option value="${C.DEFAULT_CURRENCY}">${C.DEFAULT_CURRENCY}</option><option value="CAD">CAD</option>`;
  
  initializeCustomSelects();
  initCustomDatePicker();
  initModalScrollIndicators();
  initModalTouchQuarantine();
  buildStarWidget();
  applyTheme(activeThemeToApply);
  buildThemeGrid();
  updateStorageMeter();
  
  try {
    const app = initializeApp(C.FIREBASE);
    db = initializeFirestore(app, { localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}) });
    setupFirebaseListeners();
  } catch(e) {
    console.error("Firebase init skipped. Local mode.", e);
    setSyncState('🔴');
  }

  updateTimestamp();
  setInterval(updateTimestamp, 1000); 

  // Listeners
  els.btnAdd.onclick = () => openGameModal();
  document.getElementById('btn-close-game').onclick = () => {
    els.mGame.classList.remove('active');
    toggleModalScrollLock(false);
  };
  els.btnCancel.onclick = (e) => { 
    e.preventDefault(); 
    els.mGame.classList.remove('active'); 
    toggleModalScrollLock(false);
  };
  
  els.btnTheme.onclick = () => { 
    els.mTheme.classList.add('active'); 
    els.themeGrid.scrollTop = 0;
    toggleModalScrollLock(true);
  };
  document.getElementById('btn-close-theme').onclick = () => { 
    els.mTheme.classList.remove('active'); 
    toggleModalScrollLock(false);
  };

  if (els.btnStats) {
    els.btnStats.onclick = () => openStatsModal();
  }
  if (els.btnCloseStats) {
    els.btnCloseStats.onclick = () => {
      els.mStats.classList.remove('active');
      toggleModalScrollLock(false);
    };
  }
  if (els.btnDismissStats) {
    els.btnDismissStats.onclick = () => {
      els.mStats.classList.remove('active');
      toggleModalScrollLock(false);
    };
  }
  
  els.btnSettings.onclick = () => { 
    els.mSettings.classList.add('active'); 
    els.mSetBody.scrollTop = 0; 
    toggleModalScrollLock(true);
  };
  els.btnCloseSettings.onclick = () => { 
    els.mSettings.classList.remove('active'); 
    toggleModalScrollLock(false);
  };
  
  els.btnAuditCache.onclick = () => {
      updateStorageMeter();
      showToast(splitEmoji(C.MESSAGES.CACHE_AUDITED));
  };
  
  els.btnAuditRawg.onclick = async () => {
    els.btnAuditRawg.classList.add('spinning');
    const spinStart = Date.now();
    await auditRawgConnection(false);
    const elapsed = Date.now() - spinStart;
    const quantizedSpin = Math.max(3200, Math.ceil(elapsed / 800) * 800);
    const remaining = Math.max(0, quantizedSpin - elapsed);
    setTimeout(() => els.btnAuditRawg.classList.remove('spinning'), remaining);
  };
  
  els.btnSync.onclick = forceSync;
  
  els.btnGrid.onclick = () => { 
    els.viewToggle.classList.remove('list-active'); 
    els.btnGrid.classList.add('active');
    els.btnList.classList.remove('active');
    els.lib.className = 'grid-view'; 
  };
  els.btnList.onclick = () => { 
    els.viewToggle.classList.add('list-active'); 
    els.btnList.classList.add('active');
    els.btnGrid.classList.remove('active');
    els.lib.className = 'list-view'; 
  };

  els.btnRandom.onclick = triggerRandomizer;
  els.btnCloseRandom.onclick = () => {
    els.mRandom.classList.remove('active');
    toggleModalScrollLock(false);
  };

  const handleTitleSearch = debounce(searchRAWG, 300);
  els.f.title.addEventListener('input', (e) => { 
    handleTitleSearch();
    updateHLTBLink(e.target.value); 
    if (e.target.value) promoteStatusAndDate(); 
  });
  
  els.f.title.addEventListener('blur', () => {
    setTimeout(() => { els.f.rawgRes.style.display = 'none'; }, 200);
  });
  
  els.f.plat.addEventListener('change', updatePlatformFields);
  els.f.status.addEventListener('change', handleStatusChange);

  // Auto-format Purchase Price to 2 decimal places (.00)
  els.f.price.addEventListener('blur', () => {
    if (els.f.price.value !== '') {
      els.f.price.value = formatCurrencyPrice(els.f.price.value);
    }
  });
  els.f.price.addEventListener('change', () => {
    if (els.f.price.value !== '') {
      els.f.price.value = formatCurrencyPrice(els.f.price.value);
    }
  });

  ['change', 'input'].forEach(evt => {
    els.f.dateAdd.addEventListener(evt, (e) => updateDateClass(e.target));
    els.f.dateComp.addEventListener(evt, (e) => updateDateClass(e.target));
  });

  const reactionContainer = document.getElementById('reaction-chips');
  if (reactionContainer) {
    reactionContainer.querySelectorAll('.chip').forEach(chip => {
      chip.onclick = (e) => { 
          e.stopPropagation();
          const rawText = chip.textContent.trim();
          if (!rawText) return;
          
          const match = rawText.match(/^([\p{Emoji_Presentation}|\p{Extended_Pictographic}]+)\s*(.*)$/u);
          const chipToAppend = match ? `${match[1]} ${match[2]}` : rawText;
          
          const currentNotes = els.f.notes.value.trim();
          els.f.notes.value = currentNotes ? `${currentNotes} ${chipToAppend} ` : `${chipToAppend} `;
      };
    });
  }

  els.btnSave.onclick = (e) => { e.preventDefault(); saveGameData(); };
  els.btnDelPrompt.onclick = (e) => { e.preventDefault(); els.mDelete.classList.add('active'); requestAnimationFrame(syncAllModalScrollIndicators); };
  els.btnCancelDel.onclick = () => els.mDelete.classList.remove('active');
  els.btnConfirmDel.onclick = deleteGame;
  
  els.btnRefreshRawg.onclick = async () => {
    const query = els.f.title.value.trim();
    const apiKey = getRawgKey();
    if (!query || !apiKey || apiKey === "YOUR_RAWG_API_KEY_HERE") return;
    
    els.btnRefreshRawg.classList.add('spinning');
    els.modalGameRawgDot.className = 'status-dot dot-yellow';
    
    let isSuccess = false;
    const spinStart = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(`https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(query)}&page_size=1`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
         console.warn(`RAWG Search returned ${res.status}: ${res.statusText}`);
         els.modalGameRawgDot.className = 'status-dot dot-red';
         showToast(splitEmoji(C.MESSAGES.RAWG_REFRESH_ERROR));
      } else {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const match = data.results[0];
          const banner = match.background_image || "";
          
          setVal(els.f.url, banner);
          if (banner) {
            els.f.coverImg.src = banner;
            els.f.coverImg.style.display = 'block';
            els.f.coverText.style.display = 'none';
          }

          if (match.genres && match.genres.length) {
            setVal(els.f.genres, match.genres.map(x=>x.name).join(', '));
          }

          setVal(els.f.rawgSynced, formatSyncTimestamp(new Date()));
          if (match.updated) {
            setVal(els.f.rawgUpdated, formatDisplayDate(match.updated));
          }
          if (match.tba || !match.released) {
            setVal(els.f.releaseDate, C.PLACEHOLDERS.TBA_LABEL || "To Be Announced...");
          } else {
            setVal(els.f.releaseDate, formatDisplayDate(match.released));
          }
          
          const relDate = match.released ? new Date(match.released) : null;
          const isFut = relDate && relDate > new Date();
          if (isFut || match.tba) {
            setVal(els.f.rawgScore, C.PLACEHOLDERS.NOT_RELEASED_LABEL || "🚀 Not yet released!");
          } else if (match.rating && parseFloat(match.rating) > 0) {
            setVal(els.f.rawgScore, `RAWG: ${match.rating} / 5.0 (Meta: ${match.metacritic || "N/A"})`);
          }
          
          try {
            const detRes = await fetch(`https://api.rawg.io/api/games/${match.id}?key=${apiKey}`);
            if (detRes.ok) {
              const det = await detRes.json();
              if (det.description_raw) setVal(els.f.desc, det.description_raw);
              if (det.developers && det.developers.length) setVal(els.f.dev, (det.developers || []).map(x=>x.name).join(', '));
              if (det.publishers && det.publishers.length) setVal(els.f.pub, (det.publishers || []).map(x=>x.name).join(', '));
              if (det.genres && det.genres.length) {
                setVal(els.f.genres, det.genres.map(x=>x.name).join(', '));
              }
              if (det.updated) {
                setVal(els.f.rawgUpdated, formatDisplayDate(det.updated));
              }
              if (det.tba || (!det.released && !match.released)) {
                setVal(els.f.releaseDate, C.PLACEHOLDERS.TBA_LABEL || "To Be Announced...");
              } else if (det.released) {
                setVal(els.f.releaseDate, formatDisplayDate(det.released));
              }
            }
          } catch(err) { console.warn("RAWG detail fetch failed:", err); }
          
          els.modalGameRawgDot.className = 'status-dot dot-green';
          isSuccess = true;
        } else {
          els.modalGameRawgDot.className = 'status-dot dot-red';
          showToast(splitEmoji(C.MESSAGES.RAWG_REFRESH_ERROR));
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn("RAWG fetch aborted or timed out.");
      } else {
        console.error("Refresh RAWG failed:", err);
      }
      els.modalGameRawgDot.className = 'status-dot dot-red';
      showToast(splitEmoji(C.MESSAGES.RAWG_REFRESH_ERROR));
    } finally {
      const elapsed = Date.now() - spinStart;
      const remaining = Math.max(0, 3200 - (elapsed % 800));
      
      if (isSuccess) {
        showToast(splitEmoji(C.MESSAGES.RAWG_REFRESH_SUCCESS || "RAWG metadata refreshed! 🔄"));
      }
      
      setTimeout(() => els.btnRefreshRawg.classList.remove('spinning'), remaining);
    }
  };

  els.btnClearCache.onclick = () => { els.mConfirmCache.classList.add('active'); requestAnimationFrame(syncAllModalScrollIndicators); };
  els.btnCancelClearCache.onclick = () => { els.mConfirmCache.classList.remove('active'); };
  els.btnConfirmClearCache.onclick = () => {
    localStorage.removeItem('nomicon_db');
    localStorage.removeItem('nomicon_settings');
    sessionStorage.removeItem('nomicon_session_theme');
    els.mConfirmCache.classList.remove('active');
    showToast(splitEmoji(C.MESSAGES.CACHE_CLEARED));
    setTimeout(() => location.reload(), 1500);
  };
  
  els.fStatus.addEventListener('change', renderLibrary);
  els.fPlatform.addEventListener('change', renderLibrary);
  els.search.addEventListener('input', renderLibrary);
  
  if (els.btnClearFilters) {
    els.btnClearFilters.onclick = () => {
      els.fStatus.value = "";
      els.fPlatform.value = "";
      syncCustomSelect('filter-status');
      syncCustomSelect('filter-platform');
      renderLibrary();
    };
  }

  auditRawgConnection(true);
  renderLibrary();
}

// --- 4. FIREBASE SYNC LOGIC ---
let syncTimeout;
function setupFirebaseListeners() {
  window.addEventListener('online', () => setSyncState('🟡'));
  window.addEventListener('offline', () => setSyncState('🔴'));
  
  const activeDbColl = settings.dbColl || C.DB_COLLECTION;
  const colRef = collection(db, activeDbColl);
  
  onSnapshot(colRef, (snapshot) => {
    let changed = false;
    snapshot.docChanges().forEach((change) => {
      if(change.doc.id === 'settings') return;
      if (change.type === "added" || change.type === "modified") { games[change.doc.id] = change.doc.data(); changed = true; }
      if (change.type === "removed") { delete games[change.doc.id]; changed = true; }
    });
    if(changed) saveLocalAndRender();
    
    clearTimeout(syncTimeout);
    if (!navigator.onLine) {
      setSyncState('🔴');
    } else if (snapshot.metadata.hasPendingWrites) {
      setSyncState('🟡');
      syncTimeout = setTimeout(() => {
        setSyncState(navigator.onLine ? '🟢' : '🔴');
      }, 4000);
    } else {
      lastSyncTime = new Date();
      updateTimestamp();
      setSyncState('🟢');
    }
  }, (error) => { setSyncState('🔴'); });
}

function setSyncState(txt) {
  els.traySyncDot.className = 'status-dot';
  if(txt.includes('🟢')) els.traySyncDot.classList.add('dot-green');
  else if(txt.includes('🟡')) els.traySyncDot.classList.add('dot-yellow');
  else els.traySyncDot.classList.add('dot-red');
}

// Universal Harmonic Sync Engine
async function triggerHarmonicSync(operationPromise, successToastMsg) {
  els.btnSync.classList.add('spinning');
  setSyncState('🟡');
  const startTime = Date.now();
  
  let isSuccess = false;
  try {
    await operationPromise;
    if (db && navigator.onLine) {
      lastSyncTime = new Date();
      updateTimestamp();
      updateStorageMeter();
      setSyncState('🟢');
      isSuccess = true;
    } else {
      setSyncState('🔴');
    }
  } catch(e) {
    console.warn("Harmonic sync caught error:", e);
    setSyncState('🔴');
  } finally {
    const elapsed = Date.now() - startTime;
    const quantizedSpin = Math.max(3200, Math.ceil(elapsed / 800) * 800);
    const remaining = Math.max(0, quantizedSpin - elapsed);
    
    if (isSuccess && successToastMsg) {
       showToast(successToastMsg);
    }
    
    setTimeout(() => els.btnSync.classList.remove('spinning'), remaining);
  }
}

function forceSync() {
  if (!db || !navigator.onLine) {
    showToast("Cannot sync: offline or detached.");
    return;
  }
  const activeDbColl = settings.dbColl || C.DB_COLLECTION;
  const fetchPromise = getDocs(collection(db, activeDbColl), { source: 'server' });
  triggerHarmonicSync(fetchPromise, C.MESSAGES.SYNC_SUCCESS);
}

function updateTimestamp() {
  if(!lastSyncTime) return;
  const now = lastSyncTime;
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateStr = `${months[now.getMonth()]} ${now.getDate().toString().padStart(2,'0')}, ${now.getFullYear()}`;
  const tzMatch = now.toString().match(/\(([A-Za-z\s].*)\)/);
  const tz = tzMatch ? tzMatch[1].split(' ').map(w => w[0]).join('') : '';
  const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')} ${tz}`;
  
  els.trayDate.innerText = dateStr;
  els.trayTime.innerText = timeStr;
}

async function pushDocToCloud(id, data) {
  if(!db) return;
  const activeDbColl = settings.dbColl || C.DB_COLLECTION;
  await setDoc(doc(db, activeDbColl, id), data); 
}

async function removeDocFromCloud(id) {
  if(!db) return;
  const activeDbColl = settings.dbColl || C.DB_COLLECTION;
  await deleteDoc(doc(db, activeDbColl, id)); 
}

function saveLocalAndRender() {
  localStorage.setItem('nomicon_db', JSON.stringify(games));
  updateStorageMeter();
  renderLibrary();
}

// --- 5. RAWG API ---
function setRawgState(state) {
  const dots = [els.modalRawgDot, els.modalGameRawgDot].filter(Boolean);
  dots.forEach(dot => {
    dot.className = 'status-dot';
    if(state === '🟢') dot.classList.add('dot-green');
    else if(state === '🟡') dot.classList.add('dot-yellow');
    else dot.classList.add('dot-red');
  });
}

let lastAuditTimestamp = 0;
async function auditRawgConnection(silent = false) {
  const now = Date.now();
  if (now - lastAuditTimestamp < 30000 && els.modalRawgDot.classList.contains('dot-green')) {
    if(!silent) showToast(C.MESSAGES.RAWG_ONLINE);
    return;
  }
  
  setRawgState('🟡');
  const apiKey = getRawgKey();
  
  if (!apiKey || apiKey === "YOUR_RAWG_API_KEY_HERE") {
      setRawgState('🔴');
      if(!silent) showToast(C.MESSAGES.RAWG_OFFLINE);
      return;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  
  try {
    const res = await fetch(`https://api.rawg.io/api/games?key=${apiKey}&page_size=1`, { signal: controller.signal });
    
    if(res.ok) {
      setRawgState('🟢');
      lastAuditTimestamp = Date.now();
      if(!silent) showToast(C.MESSAGES.RAWG_ONLINE);
    } else {
      console.warn(`RAWG Audit failed with status: ${res.status}`);
      setRawgState('🔴');
      if(!silent) showToast(C.MESSAGES.RAWG_OFFLINE);
    }
  } catch(e) {
    if (e.name === 'AbortError') {
      console.warn("RAWG audit connection timed out or was aborted by user action.");
      if (els.modalRawgDot.classList.contains('dot-green')) setRawgState('🟢');
    } else {
      console.warn(`RAWG Audit connection error:`, e);
      setRawgState('🔴');
      if(!silent) showToast(C.MESSAGES.RAWG_OFFLINE);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

function formatRawgDate(dateString, isTba = false) {
  if (isTba || !dateString) return C.PLACEHOLDERS.TBA_LABEL || 'To Be Announced...';
  return formatDisplayDate(dateString);
}

async function searchRAWG() {
  const query = els.f.title.value.trim();
  const apiKey = getRawgKey();
  
  if(query.length < 3 || !apiKey || apiKey === "YOUR_RAWG_API_KEY_HERE") { 
      els.f.rawgRes.style.display = 'none'; 
      return; 
  }
  
  try {
    const res = await fetch(`https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(query)}&page_size=10`);
    if (!res.ok) {
        console.warn(`RAWG Autocomplete failed with status: ${res.status}`);
        return;
    }
    const data = await res.json();
    renderAutocomplete(data.results);
  } catch(e) { console.error("RAWG autocomplete fetch failed:", e); }
}

function renderAutocomplete(results) {
  els.f.rawgRes.innerHTML = '';
  if(results.length === 0) { els.f.rawgRes.style.display = 'none'; return; }

  results.forEach(g => {
    const div = document.createElement('div');
    div.className = 'ac-item';
    div.innerHTML = `<img src="${g.background_image || ''}"> <span>${g.name} (${formatRawgDate(g.released, g.tba)})</span>`;
    div.onmousedown = (e) => {
      e.preventDefault();
      populateFromRAWG(g);
    };
    els.f.rawgRes.appendChild(div);
  });
  
  els.f.rawgRes.style.display = 'block';
  requestAnimationFrame(() => {
    els.f.rawgRes.scrollTop = 0;
  });
}

async function populateFromRAWG(g) {
  if (!g) return;
  els.f.rawgRes.style.display = 'none';
  setVal(els.f.title, g.name || "");
  updateHLTBLink(g.name || "");
  promoteStatusAndDate();
  
  const banner = g.background_image || "";
  
  setVal(els.f.url, banner);
  if(banner) {
    els.f.coverImg.src = banner;
    els.f.coverImg.style.display = 'block';
    els.f.coverText.style.display = 'none';
  }
  
  setVal(els.f.genres, (g.genres || []).map(x=>x.name).join(', '));

  setVal(els.f.rawgSynced, formatSyncTimestamp(new Date()));
  if (g.updated) {
    setVal(els.f.rawgUpdated, formatDisplayDate(g.updated));
  }
  if (g.tba || !g.released) {
    setVal(els.f.releaseDate, C.PLACEHOLDERS.TBA_LABEL || "To Be Announced...");
  } else {
    setVal(els.f.releaseDate, formatDisplayDate(g.released));
  }
  
  const releaseDate = g.released ? new Date(g.released) : null;
  const isFuture = releaseDate && releaseDate > new Date();

  if (isFuture || g.tba) {
    setVal(els.f.rawgScore, C.PLACEHOLDERS.NOT_RELEASED_LABEL || "🚀 Not yet released!");
  } else if (g.rating && parseFloat(g.rating) > 0) {
    setVal(els.f.rawgScore, `RAWG: ${g.rating} / 5.0 (Meta: ${g.metacritic || "N/A"})`);
  } else {
    setVal(els.f.rawgScore, "Unrated");
  }

  try {
    const apiKey = getRawgKey();
    if (apiKey && apiKey !== "YOUR_RAWG_API_KEY_HERE") {
      const res = await fetch(`https://api.rawg.io/api/games/${g.id}?key=${apiKey}`);
      if (res.ok) {
        const det = await res.json();
        setVal(els.f.desc, det.description_raw || "");
        setVal(els.f.dev, (det.developers || []).map(x=>x.name).join(', '));
        setVal(els.f.pub, (det.publishers || []).map(x=>x.name).join(', '));
        if (det.genres && det.genres.length) {
          setVal(els.f.genres, det.genres.map(x=>x.name).join(', '));
        }
        if (det.updated) {
          setVal(els.f.rawgUpdated, formatDisplayDate(det.updated));
        }
        if (det.tba || (!det.released && !g.released)) {
          setVal(els.f.releaseDate, C.PLACEHOLDERS.TBA_LABEL || "To Be Announced...");
        } else if (det.released) {
          setVal(els.f.releaseDate, formatDisplayDate(det.released));
        }
      }
    }
  } catch(e) {
    console.warn("RAWG detail fetch failed:", e);
  }
}

// --- 6. MODAL, DATA & INTERACTIVE STARS ---
function buildStarWidget() {
  els.f.ratingContainer.innerHTML = '';
  const widget = document.createElement('div');
  widget.className = 'star-widget';
  for(let i=1; i<=5; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.innerHTML = `
      <svg viewBox="0 0 24 24" fill="var(--bg-placeholder)"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>
      <svg viewBox="0 0 24 24" class="star-fg" fill="var(--accent)" style="clip-path: inset(0 100% 0 0); position:absolute; top:0; left:0;"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>
      <div class="star-half left" data-val="${i - 0.5}"></div>
      <div class="star-half right" data-val="${i}"></div>
    `;
    widget.appendChild(star);
  }
  
  const display = document.createElement('span');
  display.id = 'star-display-text';
  display.style = 'font-size:13px; color:var(--text-muted); font-weight:bold; margin-left:8px; display:inline-flex; align-items:center; line-height:1;';
  
  widget.addEventListener('click', (e) => {
    if(e.target.classList.contains('star-half')) {
      const val = parseFloat(e.target.getAttribute('data-val'));
      setStars(currentRating === val ? 0 : val);
    }
  });
  
  els.f.ratingContainer.appendChild(widget);
  els.f.ratingContainer.appendChild(display);
}

function setStars(val) {
  currentRating = val;
  document.getElementById('star-display-text').innerText = val > 0 ? val.toFixed(1) : C.PLACEHOLDERS.UNRATED_LABEL;
  const stars = els.f.ratingContainer.querySelectorAll('.star');
  stars.forEach((s, idx) => {
    const starVal = idx + 1;
    const fg = s.querySelector('.star-fg');
    if (val >= starVal) fg.style.clipPath = 'inset(0 0 0 0)';
    else if (val === starVal - 0.5) fg.style.clipPath = 'inset(0 50% 0 0)';
    else fg.style.clipPath = 'inset(0 100% 0 0)';
  });
}

function updateDateClass(el) {
  if (!el) return;
  if (el.value && el.value.trim()) {
    el.classList.remove('empty-date');
  } else {
    el.classList.add('empty-date');
  }
}

function promoteStatusAndDate() {
  if(!els.f.status.value) {
      els.f.status.value = "Backlog";
      syncCustomSelect('f-status');
      updateCompletionDateUI("Backlog");
  }
  if(!els.f.dateAdd.value) {
      els.f.dateAdd.value = formatDisplayDate(new Date());
      updateDateClass(els.f.dateAdd);
  }
}

function openGameModal(id = null) {
  els.form.reset();
  if (datepickerPopoverEl) datepickerPopoverEl.classList.remove('active');
  els.f.coverImg.style.display = 'none';
  els.f.coverText.style.display = 'block';
  els.f.rawgScore.value = "";
  if (els.f.rawgUpdated) els.f.rawgUpdated.value = "";
  if (els.f.rawgSynced) els.f.rawgSynced.value = "";
  if (els.f.releaseDate) els.f.releaseDate.value = "";
  els.f.dev.value = "";
  els.f.pub.value = "";
  if (els.f.genres) els.f.genres.value = "";
  els.f.rawgRes.style.display = 'none';
  setStars(0);
  updateHLTBLink("");
  
  els.mGame.classList.add('active');
  toggleModalScrollLock(true);
  
  els.mGameBody.scrollTo({ top: 0, behavior: 'instant' });
  requestAnimationFrame(syncAllModalScrollIndicators);
  
  auditRawgConnection(true);

  if(id && games[id]) {
    const g = games[id];
    els.mGameTitle.innerText = "Edit Game";
    els.btnDelPrompt.style.display = "block";
    
    els.lblRawgStatusText.style.display = "none";
    els.btnRefreshRawg.style.display = "inline-flex";
    
    els.f.id.value = id;
    els.f.title.value = g.title || "";
    updateHLTBLink(g.title);
    if (els.f.rawgUpdated) els.f.rawgUpdated.value = g.rawgUpdated ? formatDisplayDate(g.rawgUpdated) : "";
    if (els.f.rawgSynced) els.f.rawgSynced.value = g.rawgSynced ? formatSyncTimestamp(g.rawgSynced) : "";
    els.f.desc.value = g.desc || "";
    els.f.dev.value = g.dev || "";
    els.f.pub.value = g.pub || "";
    if (els.f.releaseDate) els.f.releaseDate.value = g.releaseDate ? formatDisplayDate(g.releaseDate) : "";
    if (els.f.genres) els.f.genres.value = g.genres || "";
    els.f.plat.value = g.plat || "";
    els.f.format.value = g.format || "";
    if (els.f.edition) els.f.edition.value = g.edition || "";
    els.f.price.value = g.price ? formatCurrencyPrice(g.price) : "";
    els.f.curr.value = g.curr || C.DEFAULT_CURRENCY;
    els.f.status.value = g.status || "Backlog";
    els.f.url.value = g.url || "";
    els.f.rawgScore.value = g.rawgScore || "";
    
    setStars(parseFloat(g.rating || 0));
    
    const displayCover = g.url;
    if(displayCover) {
      els.f.coverImg.src = displayCover;
      els.f.coverImg.style.display = 'block';
      els.f.coverText.style.display = 'none';
    }
    
    els.f.dateAdd.value = g.dateAdd ? formatDisplayDate(g.dateAdd) : "";
    els.f.dateComp.value = g.dateComp ? formatDisplayDate(g.dateComp) : "";
    
    els.f.playtime.value = g.playtime || "";
    els.f.hltbM.value = g.hltbM || "";
    els.f.hltbE.value = g.hltbE || "";
    els.f.hltbC.value = g.hltbC || "";
    els.f.achE.value = g.achE || "";
    els.f.achT.value = g.achT || "";
    els.f.notes.value = g.notes || "";
    
  } else {
    els.mGameTitle.innerText = "Add Game";
    els.btnDelPrompt.style.display = "none";
    
    els.lblRawgStatusText.style.display = "inline";
    els.btnRefreshRawg.style.display = "none";
    
    els.f.id.value = crypto.randomUUID();
    els.f.status.value = "";
    els.f.plat.value = "";
    els.f.format.value = "";
    if (els.f.edition) els.f.edition.value = "";
    els.f.curr.value = C.DEFAULT_CURRENCY;
    els.f.dateAdd.value = "";
    els.f.dateComp.value = "";
  }
  
  updateCompletionDateUI(els.f.status.value);
  updateDateClass(els.f.dateAdd);
  updateDateClass(els.f.dateComp);
  
  syncCustomSelect('f-platform');
  syncCustomSelect('f-format');
  syncCustomSelect('f-edition');
  syncCustomSelect('f-status');
  syncCustomSelect('f-currency');
  updatePlatformFields();
}

function updateHLTBLink(title) { 
  if(title && title.trim()) {
    els.hltbLink.href = `https://howlongtobeat.com/?q=${encodeURIComponent(title.trim())}`;
    els.hltbLink.innerHTML = splitEmoji("🔗 HLTB Look Up");
    els.hltbLink.classList.remove('disabled');
  } else {
    els.hltbLink.href = "#";
    els.hltbLink.innerHTML = splitEmoji(C.PLACEHOLDERS.HLTB_WARNING_TEXT);
    els.hltbLink.classList.add('disabled');
  }
}

function updatePlatformFields() {
  const p = els.f.plat.value || "";
  if(p.includes("PS")) els.f.lblAch.innerText = "Trophies";
  else if(p.includes("Xbox")) els.f.lblAch.innerText = "Achievements";
  else els.f.lblAch.innerText = "Achievements";
}

function handleStatusChange(e) {
  const val = e.target.value;
  updateCompletionDateUI(val);
  if((val === "Completed" || val === "Beat") && !els.f.dateComp.value.trim()) {
      els.f.dateComp.value = formatDisplayDate(new Date());
      updateDateClass(els.f.dateComp);
  }
}

function saveGameData() {
  if (!els.f.title.value.trim()) {
    showToast(C.MESSAGES.TITLE_REQUIRED);
    els.f.title.focus();
    return;
  }
  if (!els.f.plat.value) {
    showToast(C.MESSAGES.PLATFORM_REQUIRED);
    return;
  }
  
  const numericFields = [els.f.achE, els.f.achT, els.f.playtime, els.f.hltbM, els.f.hltbE, els.f.hltbC];
  for (let input of numericFields) {
    if (input.value && parseFloat(input.value) < 0) {
      showToast(C.MESSAGES.NUMERIC_NEGATIVE);
      return;
    }
  }

  const eVal = parseFloat(els.f.achE.value || 0);
  const tVal = parseFloat(els.f.achT.value || 0);
  if (els.f.achE.value && els.f.achT.value && eVal > tVal) {
      showToast(C.MESSAGES.ACHIEVEMENT_ERROR);
      return;
  }
  
  const today = getLocalTodayISO();
  const rawAddDate = els.f.dateAdd.value.trim();
  const rawCompDate = els.f.dateComp.value.trim();
  let addDate = "";
  let compDate = "";
  
  if (rawAddDate) {
      addDate = parseUserInputDate(rawAddDate);
      if (!addDate) { showToast(C.MESSAGES.DATE_INVALID_ERROR); return; }
      if (addDate > today) { showToast(C.MESSAGES.DATE_FUTURE_ERROR); return; }
  }
  if (rawCompDate) {
      compDate = parseUserInputDate(rawCompDate);
      if (!compDate) { showToast(C.MESSAGES.DATE_INVALID_ERROR); return; }
      if (compDate > today) { showToast(C.MESSAGES.DATE_FUTURE_ERROR); return; }
  }
  
  const id = els.f.id.value;
  const formattedPrice = els.f.price.value !== '' ? formatCurrencyPrice(els.f.price.value) : "";
  els.f.price.value = formattedPrice;
  
  const gameData = {
    id: id,
    title: els.f.title.value,
    rawgUpdated: els.f.rawgUpdated ? els.f.rawgUpdated.value : "",
    rawgSynced: els.f.rawgSynced ? els.f.rawgSynced.value : "",
    desc: els.f.desc.value, dev: els.f.dev.value, pub: els.f.pub.value,
    releaseDate: els.f.releaseDate ? els.f.releaseDate.value : "",
    genres: els.f.genres ? els.f.genres.value : "", plat: els.f.plat.value, format: els.f.format.value,
    edition: els.f.edition ? els.f.edition.value : "",
    price: formattedPrice,
    curr: els.f.curr.value || C.DEFAULT_CURRENCY,
    status: els.f.status.value, rating: currentRating, url: els.f.url.value, rawgScore: els.f.rawgScore.value,
    dateAdd: addDate, dateComp: compDate, playtime: els.f.playtime.value,
    hltbM: els.f.hltbM.value, hltbE: els.f.hltbE.value, hltbC: els.f.hltbC.value,
    notes: els.f.notes.value, achE: els.f.achE.value, achT: els.f.achT.value
  };

  games[id] = gameData;
  
  const cloudOp = pushDocToCloud(id, gameData); 
  saveLocalAndRender();         
  
  els.mGame.classList.remove('active');
  toggleModalScrollLock(false);
  
  const toastMsg = C.MESSAGES.SAVED_TOAST.replace('{title}', gameData.title);
  triggerHarmonicSync(cloudOp, toastMsg);
}

function deleteGame() {
  const id = els.f.id.value;
  const title = games[id].title;
  delete games[id];
  
  const cloudOp = removeDocFromCloud(id);
  saveLocalAndRender();
  
  els.mDelete.classList.remove('active');
  els.mGame.classList.remove('active');
  toggleModalScrollLock(false);
  
  const toastMsg = C.MESSAGES.DELETED_TOAST.replace('{title}', title);
  triggerHarmonicSync(cloudOp, toastMsg);
}

// --- 7. RENDERING & UI TOASTS ---
function renderLibrary() {
  const q = els.search.value.toLowerCase();
  const fS = els.fStatus.value;
  const fP = els.fPlatform.value;
  
  els.lib.innerHTML = '';
  let count = 0;
  const activeTheme = document.body.getAttribute('data-theme') || 'modern-dark';
  const isRetro = activeTheme === 'retro-arcade';
  const isCyberpunk = activeTheme === 'cyberpunk';
  const isSynthwave = activeTheme === 'synthwave-sunset';
  const isCrimson = activeTheme === 'gothic-crimson';
  const isWasteland = activeTheme === 'wasteland-terminal';
  
  const gamesList = Object.values(games).sort((a, b) => a.title.localeCompare(b.title));

  gamesList.forEach(g => {
    if(q && !g.title.toLowerCase().includes(q) && !(g.genres||"").toLowerCase().includes(q)) return;
    if(fS && g.status !== fS) return;
    if(fP && g.plat !== fP) return;
    count++;

    let achBadge = "";
    let isCompleted = g.status === "Completed";
    let isBeat = g.status === "Beat";
    
    let platColor = "#6b21a8";
    let platText = "#ffffff";
    let platBorder = "rgba(255,255,255,0.2)";
    const p = g.plat || "";
    if (p.includes("PS")) { platColor = "#003791"; }
    else if (p.includes("Xbox")) { platColor = "#107C10"; }
    else if (p === "NES" || p === "Nintendo 64" || p === "SNES" || p.includes("Switch")) { platColor = "#E60012"; }
    
    if (g.achE || g.achT) {
      const e = g.achE || 0;
      const t = g.achT || 0;
      const isMaxed = parseFloat(e) >= parseFloat(t) && parseFloat(t) > 0;
      
      if((g.plat||"").includes("PS")) {
        achBadge = `<span class="badge ${isMaxed ? 'anim-glint' : ''}" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${splitEmoji(`🏆 ${e}/${t}`)}</span>`;
        if (isMaxed) achBadge = `<span class="badge anim-glint" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${splitEmoji("🏆 PLATINUM")}</span>`;
      } else if((g.plat||"").includes("Xbox")) {
        achBadge = `<span class="badge ${isMaxed ? 'anim-glint' : ''}" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${e}/${t}G</span>`;
        if (isMaxed) achBadge = `<span class="badge anim-glint" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${e}G</span>`;
      } else {
        achBadge = `<span class="badge ${isMaxed ? 'anim-glint' : ''}" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${splitEmoji(`🏅 ${e}/${t}`)}</span>`;
        if (isMaxed) achBadge = `<span class="badge anim-glint" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder};">${splitEmoji("✨ 100%")}</span>`;
      }
    }

    const card = document.createElement('div');
    card.className = `game-card ${isCompleted ? 'completed-glow' : ''}`;
    card.onclick = () => openGameModal(g.id);
    
    const starIcon = isRetro ? `<svg class="retro-star-svg" viewBox="0 0 10 10"><polygon points="5,0 6.5,3.5 10,3.8 7.5,6.2 8.2,10 5,8 1.8,10 2.5,6.2 0,3.8 3.5,3.5"/></svg>` : `<span class="retro-star">★</span>`;
    
    const ratingDisp = (g.rating && parseFloat(g.rating) > 0) ? `<span class="rating-val-wrap">${starIcon}<span>${parseFloat(g.rating).toFixed(1)}</span></span>` : `<span style="color:var(--text-muted); display:inline-flex; align-items:center;">${C.PLACEHOLDERS.UNRATED_LABEL}</span>`;
    
    let compBadge = `<span class="badge" style="background:var(--border);">${g.status}</span>`;
    if (isCompleted) {
       compBadge = `<span class="badge" style="background:var(--accent-completion, var(--accent)); color:var(--text-inverse);">${splitEmoji("🏆 COMPLETED")}</span>`;
    } else if (isBeat) {
       // v0.65 DELTA: 9-Theme High-Contrast Chromatic Calibration for "🎖️ BEAT"
       const beatLabel = splitEmoji("🎖️ BEAT");
       if (isRetro) {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #00ffff); color:#050510; border:1px solid #00ffff;">${beatLabel}</span>`;
       } else if (isSynthwave) {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #ff7700); color:#0b0c10; border:1px solid #ff7700; box-shadow: 0 0 8px rgba(255,119,0,0.5);">${beatLabel}</span>`;
       } else if (isCyberpunk) {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #7928ca); color:#ffffff; border:1px solid #00e8f8; box-shadow: 0 0 8px rgba(139,0,255,0.6);">${beatLabel}</span>`;
       } else if (isCrimson) {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #526070); color:#f1f5f9; border:1px solid #94a3b8;">${beatLabel}</span>`;
       } else if (isWasteland) {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #7f1d1d); color:#ffffff; border:1px solid #ef4444;">${beatLabel}</span>`;
       } else {
         compBadge = `<span class="badge beat-badge" style="background:var(--accent-beat, #6366f1); color:#ffffff; border:1px solid rgba(255,255,255,0.2);">${beatLabel}</span>`;
       }
    } else if (isCyberpunk) {
       compBadge = `<span class="badge" style="background:#080c14; color:#00e8f8; border: 1px solid #00e8f8; box-shadow: 0 0 5px rgba(0,232,248,0.4);">${g.status}</span>`;
    }

    const titleClass = g.title.length > 36 ? "card-title title-long" : "card-title";
    const coverSrc = g.url || '';

    card.innerHTML = `
      <img src="${coverSrc}" class="card-cover" loading="lazy">
      <div class="card-details">
        <div class="card-details-text-container">
          <div class="${titleClass}">${g.title}</div>
        </div>
        <div class="card-meta" style="color:var(--accent);">
          ${ratingDisp}
        </div>
        <div class="card-footer">
          <div class="card-footer-row-1">
            <span class="badge platform-badge" style="background:${platColor}; color:${platText}; border:1px solid ${platBorder}; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${g.plat || ''}</span>
          </div>
          <div class="card-footer-row-2">
            <div class="trophy-col">${achBadge}</div>
            <div class="status-col">${compBadge}</div>
          </div>
        </div>
      </div>
    `;
    els.lib.appendChild(card);
  });

  if (count === 0) {
    els.empty.style.display = 'block';
    if (q) {
      const match = C.EMPTY_SEARCH_TEXT.match(/^(.*?)([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})+$/u);
      const text = match ? match[1].trim() : C.EMPTY_SEARCH_TEXT.replace(/🤣/g, '').trim();
      els.emptyText.innerText = text;
      els.empty.querySelector('.empty-state-emoji').innerText = '🤣🤣🤣🤣🤣🤣🤣';
    } else {
      const match = C.EMPTY_STATE_TEXT.match(/^(.*?)([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})+$/u);
      const text = match ? match[1].trim() : C.EMPTY_STATE_TEXT.replace(/😭/g, '').trim();
      els.emptyText.innerText = text;
      els.empty.querySelector('.empty-state-emoji').innerText = '😭😭😭😭😭😭😭';
    }
  } else {
    els.empty.style.display = 'none';
  }
  renderGenresCloud();
}

function renderGenresCloud() {
  const genreSet = {};
  Object.values(games).forEach(g => {
    if(g.genres) g.genres.split(',').forEach(tag => {
      const t = tag.trim();
      if(t) genreSet[t] = (genreSet[t] || 0) + 1;
    });
  });
  
  const sortedGenres = Object.entries(genreSet).sort((a,b) => a[0].localeCompare(b[0]));
  
  els.sGenresCloud.innerHTML = sortedGenres.map(([name, count]) => {
     return `<span class="chip" style="cursor:default; pointer-events:none;">${name} (${count})</span>`;
  }).join('');
  
  if(!els.sGenresCloud.innerHTML) els.sGenresCloud.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">No genres found.</span>`;
}

function showToast(msg) {
  const match = msg.match(/^((?:[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)\s*(.*)$/u);
  const matchEnd = msg.match(/^(.*?)\s*((?:[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)$/u);
  
  if(match) {
      els.toast.innerHTML = injectAlign(match[1], match[2]);
  } else if (matchEnd) {
      els.toast.innerHTML = injectAlign(matchEnd[2], matchEnd[1]);
  } else {
      els.toast.innerText = msg;
  }
  
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 3200);
}

// --- 8. SETTINGS, THEME, ANALYTICS & 3D RANDOMIZER FX ---
function openStatsModal() {
  renderStatsDashboard();
  els.mStats.classList.add('active');
  els.mStatsBody.scrollTop = 0;
  toggleModalScrollLock(true);
  requestAnimationFrame(syncAllModalScrollIndicators);
}

function renderStatsDashboard() {
  const list = Object.values(games);
  const totalGames = list.length;

  let completedCount = 0;
  let platEarned = 0;
  let platTotal = 0;
  let gsEarned = 0;
  let gsTotal = 0;
  let totalPlaytime = 0;
  let backlogHltbHours = 0;
  let backlogTrackedCount = 0;
  let ratingSum = 0;
  let ratedCount = 0;
  let rawgRatingSum = 0;
  let rawgRatedCount = 0;
  let usdTotal = 0;
  let cadTotal = 0;

  const statusMap = {
    "Completed": { name: "Completed", count: 0, color: "var(--success)" },
    "Beat": { name: "Beat", count: 0, color: "var(--accent-beat, #6366f1)" },
    "Playing": { name: "Playing", count: 0, color: "var(--accent)" },
    "Backlog": { name: "Backlog", count: 0, color: "#f59e0b" },
    "Preordered": { name: "Preordered", count: 0, color: "#06b6d4" },
    "Wishlist": { name: "Wishlist", count: 0, color: "#a855f7" },
    "Abandoned": { name: "Abandoned", count: 0, color: "var(--danger)" }
  };

  const platFamilyMap = {
    "PlayStation": { name: "PlayStation", count: 0, color: "#003791" },
    "Xbox": { name: "Xbox", count: 0, color: "#107C10" },
    "Nintendo": { name: "Nintendo", count: 0, color: "#E60012" },
    "PC": { name: "PC", count: 0, color: "#6b21a8", hasOther: false }
  };

  list.forEach(g => {
    const st = g.status || "Backlog";
    if (statusMap[st]) statusMap[st].count++;
    else statusMap["Backlog"].count++;

    if (st === "Completed") completedCount++;

    const p = g.plat || "Other";
    const isPS = p.includes("PS") || p.includes("PlayStation");
    const isXbox = p.includes("Xbox");
    const isNintendo = p === "NES" || p === "Nintendo 64" || p === "SNES" || p.includes("Switch");

    if (isPS) {
      platFamilyMap["PlayStation"].count++;
    } else if (isXbox) {
      platFamilyMap["Xbox"].count++;
    } else if (isNintendo) {
      platFamilyMap["Nintendo"].count++;
    } else {
      platFamilyMap["PC"].count++;
      if (p !== "PC") platFamilyMap["PC"].hasOther = true;
    }

    const hasAchT = g.achT !== undefined && g.achT !== null && String(g.achT).trim() !== "" && parseFloat(g.achT) > 0;
    const hasAchE = g.achE !== undefined && g.achE !== null && String(g.achE).trim() !== "" && parseFloat(g.achE) >= 0;

    if (isPS && hasAchT) {
      platTotal++;
      if (parseFloat(g.achE || 0) >= parseFloat(g.achT)) {
        platEarned++;
      }
    }

    if (isXbox && (hasAchT || (hasAchE && parseFloat(g.achE) > 0))) {
      gsEarned += parseFloat(g.achE || 0);
      gsTotal += parseFloat(g.achT || 0);
    }

    if (g.playtime && parseFloat(g.playtime) > 0) {
      totalPlaytime += parseFloat(g.playtime);
    }

    if (st === "Backlog" && g.hltbC && parseFloat(g.hltbC) > 0) {
      backlogHltbHours += parseFloat(g.hltbC);
      backlogTrackedCount++;
    }

    if (g.rating && parseFloat(g.rating) > 0) {
      ratingSum += parseFloat(g.rating);
      ratedCount++;
      if (g.rawgScore) {
        const rawgMatch = String(g.rawgScore).match(/RAWG:\s*([\d.]+)/i) || String(g.rawgScore).match(/^([\d.]+)/);
        if (rawgMatch && parseFloat(rawgMatch[1]) > 0) {
          rawgRatingSum += parseFloat(rawgMatch[1]);
          rawgRatedCount++;
        }
      }
    }

    if (g.price && parseFloat(g.price) > 0) {
      const curr = g.curr || C.DEFAULT_CURRENCY;
      if (curr === "CAD") cadTotal += parseFloat(g.price);
      else usdTotal += parseFloat(g.price);
    }
  });

  if (platFamilyMap["PC"].hasOther) {
    platFamilyMap["PC"].name = "PC / Other";
  }

  const compPct = totalGames > 0 ? ((completedCount / totalGames) * 100).toFixed(1) : "0.0";
  const avgUserStr = ratedCount > 0 ? (ratingSum / ratedCount).toFixed(1) : "N/A";
  const avgRawgStr = rawgRatedCount > 0 ? (rawgRatingSum / rawgRatedCount).toFixed(1) : "N/A";
  const avgRating = `★ ${avgUserStr} | ${avgRawgStr}`;

  const cadInUsd = cadTotal * 0.75;
  const totalSpendUsd = usdTotal + cadInUsd;
  const costPerHr = totalPlaytime > 0 ? `$${(totalSpendUsd / totalPlaytime).toFixed(2)} / HR` : "N/A";

  const sortedStatuses = Object.values(statusMap)
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);

  let statusBarHtml = '';
  let statusLegendHtml = '';
  if (totalGames > 0 && sortedStatuses.length > 0) {
    statusBarHtml = `<div class="stats-bar-track">` + sortedStatuses.map(s => {
      const pct = ((s.count / totalGames) * 100).toFixed(1);
      const label = parseFloat(pct) >= 14 ? `${Math.round(parseFloat(pct))}%` : '';
      return `<div class="stats-bar-seg" style="width:${pct}%; background:${s.color};" title="${s.name}: ${s.count} (${pct}%)">${label}</div>`;
    }).join('') + `</div>`;

    statusLegendHtml = `<div class="stats-legend">` + sortedStatuses.map(s => {
      const pct = Math.round((s.count / totalGames) * 100);
      return `<div class="stats-legend-item"><span class="stats-legend-pip" style="background:${s.color};"></span><span>${s.name} (${s.count}, ${pct}%)</span></div>`;
    }).join('') + `</div>`;
  } else {
    statusBarHtml = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:8px 0;">No status data available.</div>`;
  }

  const sortedPlatforms = Object.values(platFamilyMap)
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count);

  let platBarHtml = '';
  let platLegendHtml = '';
  if (totalGames > 0 && sortedPlatforms.length > 0) {
    platBarHtml = `<div class="stats-bar-track">` + sortedPlatforms.map(p => {
      const pct = ((p.count / totalGames) * 100).toFixed(1);
      const label = parseFloat(pct) >= 14 ? `${Math.round(parseFloat(pct))}%` : '';
      return `<div class="stats-bar-seg" style="width:${pct}%; background:${p.color};" title="${p.name}: ${p.count} (${pct}%)">${label}</div>`;
    }).join('') + `</div>`;

    platLegendHtml = `<div class="stats-legend">` + sortedPlatforms.map(p => {
      const pct = Math.round((p.count / totalGames) * 100);
      return `<div class="stats-legend-item"><span class="stats-legend-pip" style="background:${p.color};"></span><span>${p.name} (${p.count}, ${pct}%)</span></div>`;
    }).join('') + `</div>`;
  } else {
    platBarHtml = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:8px 0;">No platform data available.</div>`;
  }

  els.mStatsBody.innerHTML = `
    <div class="stats-kpi-grid">
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`🎮 ${totalGames}`)}</div>
        <div class="stats-kpi-label">Games Tracked</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`✅ ${compPct}%`)}</div>
        <div class="stats-kpi-label">Completed</div>
        <div class="stats-kpi-sub">${completedCount} / ${totalGames} Games</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`🏆 ${platEarned} / ${platTotal}`)}</div>
        <div class="stats-kpi-label">Platinums</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`🎯 ${gsEarned.toLocaleString()}G`)}</div>
        <div class="stats-kpi-label">Gamerscore</div>
        <div class="stats-kpi-sub">Out of ${gsTotal.toLocaleString()}G</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`⏱️ ${totalPlaytime.toFixed(1)} HRS`)}</div>
        <div class="stats-kpi-label">Personal Time</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`⏳ ~${backlogHltbHours.toFixed(1)} HRS`)}</div>
        <div class="stats-kpi-label">HLTB Backlog</div>
        <div class="stats-kpi-sub">${backlogTrackedCount} Backlog Games</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${avgRating}</div>
        <div class="stats-kpi-label">User | RAWG Rating</div>
        <div class="stats-kpi-sub">${ratedCount} Rated Games</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${splitEmoji(`💎 ${costPerHr}`)}</div>
        <div class="stats-kpi-label">Value Extracted</div>
        <div class="stats-kpi-sub">USD / Hour</div>
      </div>
    </div>

    <div class="settings-block">
      <h3 style="margin-bottom:8px; font-size:14px; color:var(--accent);">🕹️ Platform</h3>
      ${platBarHtml}
      ${platLegendHtml}
    </div>

    <div class="settings-block">
      <h3 style="margin-bottom:8px; font-size:14px; color:var(--accent);">🎮 Status</h3>
      ${statusBarHtml}
      ${statusLegendHtml}
    </div>

    <div class="settings-block">
      <h3 style="margin-bottom:8px; font-size:14px; color:var(--accent);">💰 Financial Summary</h3>
      <div class="stats-fin-row">
        <span style="color:var(--text-muted); font-weight:600;">Total Catalog Value (USD):</span>
        <strong style="color:var(--text-main); font-family:var(--font-heading);">$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
      </div>
      <div class="stats-fin-row">
        <span style="color:var(--text-muted); font-weight:600;">Total Catalog Value (CAD):</span>
        <strong style="color:var(--text-main); font-family:var(--font-heading);">$${cadTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD ($${cadInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD with 0.75 Exchange Rate)</strong>
      </div>
    </div>
  `;
}

function applyTheme(theme) { 
  document.body.setAttribute('data-theme', theme); 
  if(Object.keys(games).length > 0) renderLibrary();
  requestAnimationFrame(syncAllModalScrollIndicators);
}

// v0.65 DELTA: 10-Slot 2-Column Theme Grid ("Surprise Me!" First + Strict Alphabetical by Text Label)
function buildThemeGrid() {
  els.themeGrid.innerHTML = '';
  
  const btnRand = document.createElement('button');
  btnRand.className = `theme-btn ${(settings.theme === 'random' || !settings.theme) ? 'active' : ''}`;
  btnRand.innerHTML = splitEmoji(C.BTN_THEME_RANDOM);
  btnRand.onclick = () => {
    settings.theme = 'random';
    localStorage.setItem('nomicon_settings', JSON.stringify(settings));
    
    const newSessionTheme = themesList[Math.floor(Math.random() * themesList.length)].id;
    sessionStorage.setItem('nomicon_session_theme', newSessionTheme);
    applyTheme(newSessionTheme);
    
    els.themeGrid.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const newlyRolledBtn = document.getElementById(`theme-btn-${newSessionTheme}`);
    if(newlyRolledBtn) newlyRolledBtn.classList.add('active');
  };
  els.themeGrid.appendChild(btnRand);

  const stripLeadingEmoji = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

  themesList.slice().sort((a, b) => stripLeadingEmoji(a.name).localeCompare(stripLeadingEmoji(b.name))).forEach(t => {
    const btn = document.createElement('button');
    btn.id = `theme-btn-${t.id}`;
    const currentActive = settings.theme === 'random' ? sessionStorage.getItem('nomicon_session_theme') : settings.theme;
    btn.className = `theme-btn ${currentActive === t.id ? 'active' : ''}`;
    btn.innerHTML = splitEmoji(t.name);
    btn.onclick = () => {
      settings.theme = t.id;
      localStorage.setItem('nomicon_settings', JSON.stringify(settings));
      applyTheme(t.id);
      els.themeGrid.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    els.themeGrid.appendChild(btn);
  });
}

function updateStorageMeter() {
  const str = localStorage.getItem('nomicon_db') || "{}";
  const bytes = new Blob([str]).size;
  const mb = (bytes / (1024*1024)).toFixed(2);
  const max = 5.00;
  const pct = Math.min((mb / max) * 100, 100).toFixed(1);
  document.getElementById('s-storage-text').innerText = `${mb} MB / ${max.toFixed(2)} MB used (${pct}%)`;
  document.getElementById('s-storage-bar-fill').style.width = `${pct}%`;
}

function fireParticleExplosion() {
  els.fxCanvas.style.display = 'block';
  const ctx = els.fxCanvas.getContext('2d');
  els.fxCanvas.width = window.innerWidth;
  els.fxCanvas.height = window.innerHeight;
  
  let particles = [];
  const colors = ['#4da6ff', '#00cc66', '#ffaa00', '#ff4444', '#fcee09', '#ff007f'];
  
  for(let i=0; i<60; i++) {
    particles.push({
      x: window.innerWidth / 2, y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 1) * 20,
      size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
      type: 'confetti', rot: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10
    });
  }
  
  for(let i=0; i<80; i++) {
    particles.push({
      x: window.innerWidth / 2, y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
      size: Math.random() * 3 + 1, color: '#ffffff',
      type: 'spark', life: 1.0, decay: Math.random() * 0.02 + 0.01
    });
  }

  function animate() {
    if(particles.length === 0) { els.fxCanvas.style.display = 'none'; return; }
    ctx.clearRect(0, 0, els.fxCanvas.width, els.fxCanvas.height);
    
    for(let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      if(p.type === 'confetti') {
        p.x += p.vx; p.y += p.vy; p.vy += 0.5;
        p.rot += p.rotSpeed;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
        if(p.y > els.fxCanvas.height) particles.splice(i, 1);
      } else {
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
        if(p.life <= 0) particles.splice(i, 1);
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

function triggerRandomizer() {
  const keys = Object.keys(games);
  if(keys.length === 0) { showToast(C.MESSAGES.EMPTY_RANDOMIZER); return; }
  
  els.mRandom.classList.add('active');
  toggleModalScrollLock(true);
  els.diceCube.parentElement.style.display = 'block';
  
  els.diceCube.style.transition = 'none';
  els.diceCube.style.transform = 'rotateX(0deg) rotateY(0deg)';
  
  void els.diceCube.offsetWidth;
  
  els.diceCube.classList.add('tumbling');
  els.diceCube.classList.remove('settling');
  els.diceDisco.classList.add('party');
  
  els.randomRes.style.display = 'none';
  els.btnCloseRandom.style.display = 'none';
  
  setTimeout(() => {
     els.diceCube.classList.remove('tumbling');
     els.diceCube.classList.add('settling');
     
     const face = Math.floor(Math.random() * 6) + 1;
     let targetTransform = "";
     if(face === 1) targetTransform = "rotateX(0deg) rotateY(0deg)";
     if(face === 2) targetTransform = "rotateX(0deg) rotateY(90deg)";
     if(face === 3) targetTransform = "rotateX(0deg) rotateY(180deg)";
     if(face === 4) targetTransform = "rotateX(0deg) rotateY(-90deg)";
     if(face === 5) targetTransform = "rotateX(90deg) rotateY(0deg)";
     if(face === 6) targetTransform = "rotateX(-90deg) rotateY(0deg)";
     
     els.diceCube.style.transform = `rotateX(720deg) rotateY(720deg) ${targetTransform}`;
     
     setTimeout(() => {
       const pick = games[keys[Math.floor(Math.random() * keys.length)]];
       els.diceCube.parentElement.style.display = 'none';
       els.diceDisco.classList.remove('party');
       
       fireParticleExplosion();
       
       let platColor = "#6b21a8";
       let platText = "#ffffff";
       let platBorder = "rgba(255,255,255,0.2)";
       const p = pick.plat || "";
       if (p.includes("PS")) { platColor = "#003791"; }
       else if (p.includes("Xbox")) { platColor = "#107C10"; }
       else if (p === "NES" || p === "Nintendo 64" || p === "SNES" || p.includes("Switch")) { platColor = "#E60012"; }

       const titleClass = pick.title.length > 25 ? "card-title title-long" : "card-title";
       const pickCover = pick.url || '';

       els.randomRes.innerHTML = `
          <div class="game-card" style="margin:0 auto; transform:scale(1.05); pointer-events:none; border:1px solid var(--accent); box-shadow: 0 0 20px var(--accent), 0 0 40px rgba(0,0,0,0.5);">
            <img src="${pickCover}" class="card-cover">
            <div class="card-details" style="padding:15px; align-items:center; container-type: inline-size; width: 100%;">
              <div class="${titleClass}" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; line-height:1.3; text-align:center; word-break:break-word; font-size: 20px; font-weight: bold;">${pick.title}</div>
              <div class="badge" style="margin-top:12px; background:${platColor}; color:${platText}; border:1px solid ${platBorder}; box-shadow: 0 2px 6px rgba(0,0,0,0.5); height:26px; padding: 0 12px; font-size:12px; border-radius:4px;">${pick.plat || ''}</div>
            </div>
          </div>
          <div style="font-size:24px; margin-top:20px; color:var(--accent); font-weight:bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">${formatWinnerBanner(C.WINNER_BANNER_TEXT)}</div>
       `;
       
       const winnerTitle = els.randomRes.querySelector('.card-title');
       const isRetroArcade = document.body.getAttribute('data-theme') === 'retro-arcade';
       
       if (isRetroArcade) {
         winnerTitle.style.fontSize = '13px';
         if (pick.title.length > 20) winnerTitle.style.fontSize = '10.5px';
         if (pick.title.length > 32) winnerTitle.style.fontSize = '9px';
       } else {
         if (pick.title.length > 25) winnerTitle.style.fontSize = '17px';
         if (pick.title.length > 40) winnerTitle.style.fontSize = '15px';
       }
       
       els.randomRes.style.display = 'block';
       els.btnCloseRandom.style.display = 'inline-flex';
     }, 1200); 
  }, 1500); 
}

// Boot
init();