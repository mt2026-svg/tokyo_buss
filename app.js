// =============================================
//  CONFIG
// =============================================
const WORKER_URL = 'https://odpt-proxy-toei-bus.takahara-design.workers.dev/';

const WARN_MS     = 3 * 60 * 1000;
const CRITICAL_MS = 1 * 60 * 1000;

// =============================================
//  多言語
// =============================================
let lang = 'ja';

const I18N = {
  ja: {
    appTitle:          '🚌 都営バス NAVI',
    langBtn:           'EN',
    gpsBtn:            '📍 現在地のバス停を検索',
    gpsSearching:      '位置情報取得中...',
    gpsError:          'GPS取得失敗。バス停名で検索してください',
    searchPlaceholder: 'バス停名で検索（例：新宿）',
    searchBtn:         '検索',
    searching:         '検索中...',
    emptyMsg:          'バス停名を入力するか\n現在地ボタンで検索できます',
    noStops:           '見つかりませんでした',
    back:              'もどる',
    ttBack:            '時刻表へ',
    cdLabel:           '発車まで　あと',
    cdTtLink:          '時刻表を見る',
    loading:           '読み込み中...',
    noTimetable:       '時刻表データがありません',
    meter:             'm',
    nearStop:          'バス停',
  },
  en: {
    appTitle:          '🚌 Toei Bus NAVI',
    langBtn:           '日本語',
    gpsBtn:            '📍 Find Nearby Bus Stops',
    gpsSearching:      'Getting location...',
    gpsError:          'GPS failed. Try searching by name',
    searchPlaceholder: 'Search stop name (e.g. Shinjuku)',
    searchBtn:         'Search',
    searching:         'Searching...',
    emptyMsg:          'Enter a stop name or\ntap the location button',
    noStops:           'No stops found',
    back:              'Back',
    ttBack:            'Timetable',
    cdLabel:           'Departing in',
    cdTtLink:          'View Timetable',
    loading:           'Loading...',
    noTimetable:       'No timetable available',
    meter:             'm',
    nearStop:          'Stop',
  },
};

function t(key) { return I18N[lang][key] || key; }

function toggleLang() {
  lang = lang === 'ja' ? 'en' : 'ja';
  applyLang();
}

function applyLang() {
  document.getElementById('top-title').textContent         = t('appTitle');
  document.getElementById('lang-btn').textContent          = t('langBtn');
  document.getElementById('gps-btn').textContent           = t('gpsBtn');
  document.getElementById('cd-label').textContent          = t('cdLabel');
  document.getElementById('cd-tt-link').textContent        = t('cdTtLink');
  document.getElementById('search-input').placeholder      = t('searchPlaceholder');
  document.getElementById('search-submit').textContent     = t('searchBtn');
  document.getElementById('tt-back').textContent           = '◀ ' + t('back');
  document.getElementById('cd-back').textContent           = '◀ ' + t('ttBack');
  const emptyMsg = document.getElementById('empty-msg');
  if (emptyMsg) emptyMsg.textContent = t('emptyMsg');
}

// =============================================
//  STATE
// =============================================
let currentStop      = null;
let currentTimetable = [];
let cdTargetMs       = null;
let cdRouteName      = '';
let tickTimer        = null;

// =============================================
//  VIEW SWITCH
// =============================================
function showView(id) {
  ['view-search','view-timetable','view-countdown'].forEach(v => {
    document.getElementById(v).classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
  if (id !== 'view-countdown') {
    clearAlert();
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
}
function showSearch()    { showView('view-search'); }
function showTimetable() { showView('view-timetable'); }

function showCountdown(targetMs, routeName) {
  cdTargetMs  = targetMs;
  cdRouteName = routeName;
  document.getElementById('cd-stop-name').textContent  = currentStop ? currentStop.name : '';
  document.getElementById('cd-route-name').textContent = routeName;
  showView('view-countdown');
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 16);
}

// =============================================
//  GPS検索
// =============================================
function searchNearby() {
  const btn    = document.getElementById('gps-btn');
  const status = document.getElementById('search-status');
  btn.disabled    = true;
  btn.textContent = t('gpsSearching');
  status.textContent = '';

  if (!navigator.geolocation) {
    status.textContent  = t('gpsError');
    btn.disabled        = false;
    btn.textContent     = t('gpsBtn');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      status.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
      try {
        var url  = WORKER_URL + '?mode=stops&lat=' + lat + '&lng=' + lng + '&radius=400';
        var res  = await fetch(url);
        var data = await res.json();
        renderStopList(data, true);
      } catch(e) {
        renderStopList([], true);
        console.error(e);
      }
      btn.disabled    = false;
      btn.textContent = t('gpsBtn');
    },
    function() {
      status.textContent  = t('gpsError');
      btn.disabled        = false;
      btn.textContent     = t('gpsBtn');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// =============================================
//  バス停名検索
// =============================================
async function searchByName() {
  var input  = document.getElementById('search-input');
  var status = document.getElementById('search-status');
  var submit = document.getElementById('search-submit');
  var query  = input.value.trim();
  if (!query) return;

  submit.disabled     = true;
  status.textContent  = t('searching');

  try {
    var url  = WORKER_URL + '?mode=search&q=' + encodeURIComponent(query);
    var res  = await fetch(url);
    var data = await res.json();
    renderStopList(data, false);
    status.textContent = data.length ? data.length + '件' : t('noStops');
  } catch(e) {
    status.textContent = t('noStops');
    renderStopList([], false);
    console.error(e);
  }
  submit.disabled = false;
}

// =============================================
//  バス停リスト描画
// =============================================
function renderStopList(stops, hasGps) {
  var list    = document.getElementById('stop-list');
  var oldMsg  = document.getElementById('empty-msg');
  if (oldMsg) oldMsg.remove();

  if (!stops || !stops.length) {
    list.innerHTML = '<div id="empty-msg" style="text-align:center;color:#aaa;font-size:13px;margin-top:60px;line-height:2.4;white-space:pre-line">' + t('noStops') + '</div>';
    return;
  }

  list.innerHTML = stops.map(function(stop) {
    var distLabel = (hasGps && stop.distance != null)
      ? stop.distance + t('meter')
      : t('nearStop');
    var distCls = (hasGps && stop.distance != null) ? '' : 'no-gps';
    return '<div class="stop-card" onclick="selectStop(\'' + escHtml(stop.id) + '\',\'' + escHtml(stop.name) + '\')">'
      + '<span class="stop-dist ' + distCls + '">' + distLabel + '</span>'
      + '<span class="stop-name">' + escHtml(stop.name) + '</span>'
      + '<span class="stop-arrow">›</span>'
      + '</div>';
  }).join('');
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// =============================================
//  時刻表
// =============================================
async function selectStop(id, name) {
  currentStop = { id: id, name: name };
  document.getElementById('tt-stop-name').textContent = name;
  document.getElementById('tt-body').innerHTML =
    '<p style="text-align:center;color:#aaa;padding:40px 0">' + t('loading') + '</p>';
  showView('view-timetable');

  try {
    var url  = WORKER_URL + '?mode=timetable&pole=' + encodeURIComponent(id);
    var res  = await fetch(url);
    var data = await res.json();
    parseTimetable(data);
    renderTimetable();
  } catch(e) {
    document.getElementById('tt-body').innerHTML =
      '<p style="text-align:center;color:#aaa;padding:40px 0">' + t('noTimetable') + '</p>';
    console.error(e);
  }
}

function getTodayCalendar() {
  var dow = new Date().getDay();
  return (dow === 0 || dow === 6) ? 'SaturdayHoliday' : 'Weekday';
}

function nowMs() {
  var n = new Date();
  return (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) * 1000
       + n.getMilliseconds();
}

function timeStrToMs(str) {
  var parts = str.split(':').map(Number);
  return (parts[0] * 3600 + parts[1] * 60) * 1000;
}

function addEntry(entry, routes) {
  var objects  = entry['odpt:busstopPoleTimetableObject'] || [];
  var destSign = objects.length > 0 ? (objects[0]['odpt:destinationSign'] || '') : '';
  var destRaw  = entry['odpt:destinationBusstopPole'] || '';
  var dest     = destRaw.split('.').pop() || '';
  var label    = destSign || dest || (entry['odpt:busroute'] || '').split('.').pop() || '不明';
  var times = objects
    .map(function(o) { return o['odpt:departureTime'] || o['odpt:arrivalTime']; })
    .filter(Boolean).sort();
  if (!times.length) return;
  if (!routes[label]) routes[label] = [];
  routes[label] = Array.from(new Set(routes[label].concat(times))).sort();
}

function parseTimetable(data) {
  var dow = new Date().getDay();
  var isWeekday = (dow !== 0 && dow !== 6);
  var routes = {};

  // パス1: 今日の曜日に合うエントリのみ
  data.forEach(function(entry) {
    var title      = (entry['dc:title'] || '') + (entry['odpt:note'] || '');
    var hasWeekday = title.includes('\u5e73\u65e5'); // 平日
    var hasHoliday = title.includes('\u4f11\u65e5'); // 休日
    if (hasWeekday || hasHoliday) {
      if (isWeekday  && !hasWeekday) return;
      if (!isWeekday && !hasHoliday) return;
    }
    addEntry(entry, routes);
  });

  // パス2: パス1で空なら全エントリを通す
  if (Object.keys(routes).length === 0) {
    data.forEach(function(entry) { addEntry(entry, routes); });
  }

  currentTimetable = Object.keys(routes).map(function(route) {
    return { route: route, times: routes[route] };
  });
}

function renderTimetable() {
  var body = document.getElementById('tt-body');
  if (!currentTimetable.length) {
    body.innerHTML = '<p style="text-align:center;color:#aaa;padding:40px 0">' + t('noTimetable') + '</p>';
    return;
  }
  var now = nowMs();
  body.innerHTML = currentTimetable.map(function(item) {
    var route   = item.route;
    var times   = item.times;
    var nextIdx = times.findIndex(function(tm) { return timeStrToMs(tm) > now; });
    var chips   = times.map(function(time, i) {
      var ms  = timeStrToMs(time);
      var cls = (i === nextIdx) ? 'next' : (ms <= now ? 'past' : '');
      return '<div class="tt-time-chip ' + cls + '" onclick="onChipClick(\'' + time + '\',\'' + escHtml(route) + '\')">' + time + '</div>';
    }).join('');
    return '<div class="tt-route-block">'
      + '<div class="tt-route-label">' + escHtml(route) + '</div>'
      + '<div class="tt-times">' + chips + '</div>'
      + '</div>';
  }).join('');
}

function onChipClick(timeStr, routeName) {
  showCountdown(timeStrToMs(timeStr), routeName);
}

// =============================================
//  COUNTDOWN
// =============================================
function tick() {
  if (cdTargetMs === null) return;
  var now  = nowMs();
  var diff = cdTargetMs - now;
  if (diff < -60000) diff += 86400000;
  diff = Math.max(0, diff);

  var m  = Math.floor(diff / 60000);
  var s  = Math.floor((diff % 60000) / 1000);
  var ms = Math.floor((diff % 1000) / 10);

  var elMin = document.getElementById('cd-min');
  var elSec = document.getElementById('cd-sec');
  var elMs  = document.getElementById('cd-ms');
  if (elMin) elMin.textContent = String(m).padStart(2,'0');
  if (elSec) elSec.textContent = String(s).padStart(2,'0');
  if (elMs)  elMs.textContent  = String(ms).padStart(2,'0');

  var h    = Math.floor(cdTargetMs / 3600000) % 24;
  var min2 = Math.floor((cdTargetMs % 3600000) / 60000);
  var elNext = document.getElementById('cd-next-time');
  if (elNext) elNext.textContent =
    String(h).padStart(2,'0') + ':' + String(min2).padStart(2,'0') + ' 発';

  updateAlertState(diff);
}

// =============================================
//  ALERT STATE
// =============================================
function updateAlertState(diffMs) {
  var body = document.body;
  var zt   = document.getElementById('zebra-top');
  var zb   = document.getElementById('zebra-bottom');
  if (!zt || !zb) return;
  body.classList.remove('warning','critical');
  zt.classList.remove('visible');
  zb.classList.remove('visible');
  if (diffMs < CRITICAL_MS) {
    body.classList.add('critical');
    zt.classList.add('visible'); zb.classList.add('visible');
  } else if (diffMs < WARN_MS) {
    body.classList.add('warning');
    zt.classList.add('visible'); zb.classList.add('visible');
  }
}

function clearAlert() {
  document.body.classList.remove('warning','critical');
  var zt = document.getElementById('zebra-top');
  var zb = document.getElementById('zebra-bottom');
  if (zt) zt.classList.remove('visible');
  if (zb) zb.classList.remove('visible');
}

// =============================================
//  INIT
// =============================================
applyLang();
