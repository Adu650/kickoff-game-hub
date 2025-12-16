// Kickoff Game Hub
// Data source: Google Sheets (published) via Google Visualization API

const CONFIG = {
  sheetId: "13rkxqr7sohPeexiygv0dBMFV63ElDb2J",
  gamesTabName: "Games",
  stationsTabName: "Stations", // optional
};

// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(pillText, statusText, kind="info") {
  const pill = $("#dataPill");
  const txt = $("#statusText");
  if (!pill || !txt) return;

  pill.textContent = pillText;
  txt.textContent = statusText;

  // Kickoff brand-only colors (green/gold)
  const styles = {
    ok:   { bg: "rgba(0,255,136,.10)", border: "rgba(0,255,136,.28)", fg: "rgba(0,255,136,.95)" },
    warn: { bg: "rgba(201,162,39,.10)", border: "rgba(201,162,39,.28)", fg: "rgba(201,162,39,.95)" },
    info: { bg: "rgba(245,247,250,.06)", border: "rgba(245,247,250,.18)", fg: "rgba(245,247,250,.85)" },
  };

  const s = styles[kind] || styles.info;
  pill.style.background = s.bg;
  pill.style.borderColor = s.border;
  pill.style.color = s.fg;
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

function normalizeYesNo(v) {
  const s = safeText(v).toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function isActiveRow(row) {
  const status = safeText(row.status).toLowerCase();
  return status === "" || status === "active" || status === "yes" || status === "true" || status === "1";
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b) => a.localeCompare(b));
}

function youtubeIdFromUrl(url) {
  const u = safeText(url);
  if (!u) return "";

  // FIXED: youtu.be/<id>
  const m1 = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m1 && m1[1]) return m1[1];

  // youtube.com/watch?v=<id>
  const m2 = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m2 && m2[1]) return m2[1];

  // youtube.com/embed/<id>
  const m3 = u.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3 && m3[1]) return m3[1];

  // If user pasted just an ID
  if (/^[A-Za-z0-9_-]{6,}$/.test(u)) return u;

  return "";
}

function buildGvizUrl(tabName) {
  const tq = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&tq=${tq}`;
}

function parseGvizJson(text) {
  const match = text.match(/setResponse\((.*)\);\s*$/s);
  if (!match) throw new Error("Unexpected Google Sheets response. Make sure the sheet is published or shared.");
  return JSON.parse(match[1]);
}

function gvizToObjects(gviz) {
  const cols = gviz.table.cols.map(c => c.label || c.id);
  const rows = gviz.table.rows.map(r => {
    const obj = {};
    cols.forEach((colName, idx) => {
      const cell = r.c[idx];
      obj[colName] = cell ? (cell.f ?? cell.v) : "";
    });
    return obj;
  });
  return rows;
}

function validateGameRow(row) {
  const problems = [];
  if (!safeText(row.title)) problems.push("Missing title");
  if (safeText(row.trailer_url) && !youtubeIdFromUrl(row.trailer_url)) problems.push("Trailer URL not recognized (YouTube recommended)");
  return problems;
}

function makeQueueCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums = "23456789";
  const pick = (set) => set[Math.floor(Math.random()*set.length)];
  return `${pick(letters)}${pick(letters)}-${pick(nums)}${pick(nums)}${pick(nums)}`;
}

// ---------- State ----------
let GAMES = [];
let STATIONS = [];
let CURRENT_VIEW = "games";

// ---------- Rendering ----------
function setView(name) {
  CURRENT_VIEW = name;
  $("#viewGames").hidden = name !== "games";
  $("#viewAppointments").hidden = name !== "appointments";
  $("#viewFeatured").hidden = name !== "featured";

  $$("#navGames, #navAppointments, #navFeatured").forEach(btn => btn.classList.remove("active"));
  if (name === "games") $("#navGames").classList.add("active");
  if (name === "appointments") $("#navAppointments").classList.add("active");
  if (name === "featured") $("#navFeatured").classList.add("active");
}

function escapeHtml(s) {
  return safeText(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderFilters() {
  const platforms = uniqSorted(GAMES.map(g => safeText(g.platform)));
  const genres = uniqSorted(GAMES.map(g => safeText(g.genre)));

  const pf = $("#platformFilter");
  const gf = $("#genreFilter");

  const pfVal = pf.value;
  const gfVal = gf.value;

  pf.innerHTML = `<option value="">All platforms</option>` + platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  gf.innerHTML = `<option value="">All genres</option>` + genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");

  pf.value = platforms.includes(pfVal) ? pfVal : "";
  gf.value = genres.includes(gfVal) ? gfVal : "";
}

function gameCard(game) {
  const title = escapeHtml(game.title);
  const platform = escapeHtml(game.platform);
  const genre = escapeHtml(game.genre);
  const station = escapeHtml(game.station);
  const thumb = safeText(game.thumbnail_url);
  const hasTrailer = !!youtubeIdFromUrl(game.trailer_url);

  const badges = [
    platform ? `<span class="badge accent">${platform}</span>` : "",
    genre ? `<span class="badge">${genre}</span>` : "",
    station ? `<span class="badge">Station: ${station}</span>` : "",
  ].filter(Boolean).join("");

  const thumbHtml = thumb
    ? `<img src="${escapeHtml(thumb)}" alt="${title} cover" loading="lazy" />`
    : `<div style="padding:10px; text-align:center; font-weight:900;">${title}</div>`;

  return `
    <article class="game">
      <div class="game-thumb">${thumbHtml}</div>
      <div class="game-body">
        <div class="game-title">${title}</div>
        <div class="badges">${badges}</div>
        <div class="game-actions">
          <button class="secondary" data-action="trailer" data-id="${escapeHtml(game.game_id || title)}" ${hasTrailer ? "" : "disabled"}>
            🎬 Watch Clip
          </button>
          <button class="primary" data-action="book" data-title="${title}">📅 Book</button>
        </div>
      </div>
    </article>
  `;
}

function renderGames() {
  const q = safeText($("#searchInput").value).toLowerCase();
  const pf = safeText($("#platformFilter").value).toLowerCase();
  const gf = safeText($("#genreFilter").value).toLowerCase();

  const filtered = GAMES.filter(g => {
    if (!isActiveRow(g)) return false;
    const title = safeText(g.title).toLowerCase();
    const platform = safeText(g.platform).toLowerCase();
    const genre = safeText(g.genre).toLowerCase();

    const matchesQ = !q || title.includes(q) || platform.includes(q) || genre.includes(q);
    const matchesP = !pf || platform === pf;
    const matchesG = !gf || genre === gf;
    return matchesQ && matchesP && matchesG;
  });

  const grid = $("#gamesGrid");
  if (!filtered.length) {
    grid.innerHTML = `<div class="station"><b>No games found.</b><div class="muted">Try clearing filters or searching a different keyword.</div></div>`;
    return;
  }
  grid.innerHTML = filtered.map(gameCard).join("");
}

function renderFeatured() {
  const featured = GAMES.filter(g => isActiveRow(g) && normalizeYesNo(g.featured));
  const grid = $("#featuredGrid");
  if (!featured.length) {
    grid.innerHTML = `<div class="station"><b>No featured games right now.</b><div class="muted">Set <b>featured</b> to Yes in your sheet.</div></div>`;
    return;
  }
  grid.innerHTML = featured.map(gameCard).join("");
}

function renderStations() {
  const wrap = $("#stationsWrap");
  const list = $("#stationsList");
  if (!STATIONS.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  list.innerHTML = STATIONS.map(s => {
    const name = escapeHtml(s.station_name || s.station || "Station");
    const status = escapeHtml(s.status || "Unknown");
