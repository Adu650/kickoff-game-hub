// Kickoff Game Hub
// Data source: Google Sheets via Google Visualization API (GViz)

const CONFIG = {
  sheetId: "13rkxqr7sohPeexiygv0dBMFV63ElDb2J",
  gamesTabName: "Games",       // MUST match your Google Sheet tab name exactly
  stationsTabName: "Stations", // optional
  fallbackGid: "0",            // fallback if sheet name fails (usually 0 = first tab)
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

  // Kickoff brand-only (green/gold/white)
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

function safeText(v) { return (v ?? "").toString().trim(); }

function normalizeYesNo(v) {
  const s = safeText(v).toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function isActiveRow(row) {
  const status = safeText(row.status).toLowerCase();
  return status === "" || status === "active" || status === "yes" || status === "true" || status === "1";
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
}

function youtubeIdFromUrl(url) {
  const u = safeText(url);
  if (!u) return "";

  // FIX: youtu.be/<id>
  const m1 = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m1?.[1]) return m1[1];

  // youtube.com/watch?v=<id>
  const m2 = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m2?.[1]) return m2[1];

  // youtube.com/embed/<id>
  const m3 = u.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3?.[1]) return m3[1];

  if (/^[A-Za-z0-9_-]{6,}$/.test(u)) return u; // pasted ID
  return "";
}

function escapeHtml(s) {
  return safeText(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function buildGvizUrlBySheet(tabName) {
  const tq = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&tq=${tq}`;
}

function buildGvizUrlByGid(gid) {
  const tq = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}&tq=${tq}`;
}

function parseGvizJson(text) {
  // If Google returns an HTML login/permission page, detect it
  const head = text.slice(0, 300).toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html")) {
    throw new Error(
      "Google returned HTML instead of GViz JSON. This usually means the Sheet is NOT published/public. " +
      "Fix: Google Sheets → File → Share → Publish to web (or Share: Anyone with link = Viewer)."
    );
  }

  // Typical response: google.visualization.Query.setResponse({...});
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);\s*$/);
  if (!match) {
    // show a small snippet for diagnosis
    const snippet = text.slice(0, 220).replace(/\s+/g, " ");
    throw new Error("Unexpected GViz response format. Snippet: " + snippet);
  }
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
    : `<div style="padding:10px; text-align:center; font-weight:700;">${title}</div>`;

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
    grid.innerHTML = `<div class="card"><b>No games found.</b><div class="muted">Try clearing filters or searching a different keyword.</div></div>`;
    return;
  }
  grid.innerHTML = filtered.map(gameCard).join("");
}

function renderFeatured() {
  const featured = GAMES.filter(g => isActiveRow(g) && normalizeYesNo(g.featured));
  const grid = $("#featuredGrid");
  if (!featured.length) {
    grid.innerHTML = `<div class="card"><b>No featured games right now.</b><div class="muted">Set <b>featured</b> to Yes in your sheet.</div></div>`;
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
    const note = escapeHtml(s.note || "");
    return `
      <div class="station">
        <div class="station-top">
          <div class="station-name">${name}</div>
          <div class="station-status">${status}</div>
        </div>
        ${note ? `<div class="muted" style="margin-top:6px">${note}</div>` : ""}
      </div>
    `;
  }).join("");
}

// ---------- Modal ----------
function openTrailer(game) {
  const id = youtubeIdFromUrl(game.trailer_url);
  if (!id) return;

  $("#modalTitle").textContent = `${safeText(game.title)} — Trailer`;
  $("#modalMeta").textContent = `${safeText(game.platform)}${game.genre ? " • " + safeText(game.genre) : ""}`;

  $("#videoWrap").innerHTML = `
    <iframe
      src="https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1"
      title="YouTube video player"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen></iframe>
  `;

  $("#trailerModal").classList.add("show");
  $("#trailerModal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#trailerModal").classList.remove("show");
  $("#trailerModal").setAttribute("aria-hidden", "true");
  $("#videoWrap").innerHTML = "";
}

// ---------- Data Loading ----------
async function loadTabByUrl(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const gviz = parseGvizJson(text);
  return gvizToObjects(gviz);
}

async function loadGames() {
  // Try by sheet name first, then fallback by gid
  try {
    return await loadTabByUrl(buildGvizUrlBySheet(CONFIG.gamesTabName));
  } catch (e1) {
    console.warn("Load by sheet name failed:", e1.message);
    return await loadTabByUrl(buildGvizUrlByGid(CONFIG.fallbackGid));
  }
}

async function refreshData() {
  setStatus("Loading…", "Fetching the latest game list.", "info");

  try {
    const rows = await loadGames();

    const mapped = rows.map(r => ({
      game_id: safeText(r.game_id || r.id || r["game id"] || r["Game ID"]),
      title: safeText(r.title || r.game || r["Game Title"] || r["title"]),
      platform: safeText(r.platform || r.console || r["Platform"]),
      genre: safeText(r.genre || r["Genre"]),
      trailer_url: safeText(r.trailer_url || r.trailer || r["Trailer URL"]),
      thumbnail_url: safeText(r.thumbnail_url || r.thumbnail || r["Thumbnail URL"]),
      station: safeText(r.station || r["Station"]),
      status: safeText(r.status || r["Status"]),
      featured: safeText(r.featured || r["Featured"]),
    }));

    GAMES = mapped;

    // Stations optional
    try {
      const srows = await loadTabByUrl(buildGvizUrlBySheet(CONFIG.stationsTabName));
      STATIONS = srows.map(r => ({
        station_name: safeText(r.station_name || r.station || r["Station Name"]),
        status: safeText(r.status || r["Status"]),
        note: safeText(r.note || r["Note"]),
      })).filter(s => safeText(s.station_name));
    } catch {
      STATIONS = [];
    }

    renderFilters();
    renderGames();
    renderFeatured();
    renderStations();

    const activeCount = mapped.filter(isActiveRow).length;

    // Validation (soft)
    const bad = [];
    mapped.forEach((g, i) => {
      const probs = validateGameRow(g);
      if (probs.length) bad.push({ row: i+2, probs, title: g.title || "(blank)" });
    });

    const warnMsg = bad.length ? ` • ${bad.length} row(s) need attention` : "";
    setStatus(`Loaded ${activeCount} active`, `Game list updated.${warnMsg}`, bad.length ? "warn" : "ok");

    if (bad.length) console.warn("Validation warnings:", bad);

  } catch (err) {
    console.error(err);
    setStatus(
      "Error",
      err.message || "Could not load data. Ensure your sheet is published/public and tab names match.",
      "warn"
    );
  }
}

// ---------- Events ----------
function wireEvents() {
  $("#year").textContent = new Date().getFullYear();

  $$("#navGames, #navAppointments, #navFeatured").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  $("#refreshBtn").addEventListener("click", refreshData);
  $("#searchInput").addEventListener("input", renderGames);
  $("#platformFilter").addEventListener("change", renderGames);
  $("#genreFilter").addEventListener("change", renderGames);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "trailer") {
      const id = safeText(btn.dataset.id);
      const game =
        GAMES.find(g => safeText(g.game_id) === id) ||
        GAMES.find(g => safeText(g.title) === id);
      if (game) openTrailer(game);
    }

    if (action === "book") {
      setView("appointments");
      $("#joinQueueBtn").focus();
      if (btn.dataset.title) {
        $("#statusText").textContent = `Selected: ${safeText(btn.dataset.title)} (tell staff when checking in).`;
      }
    }
  });

  $("#modalBackdrop").addEventListener("click", closeModal);
  $("#closeModalBtn").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  $("#joinQueueBtn").addEventListener("click", () => {
    const code = makeQueueCode();
    const now = new Date();
    $("#slipCode").textContent = code;
    $("#slipTimestamp").textContent = now.toLocaleString();
    $("#queueSlip").hidden = false;
  });

  $("#bookBtn").addEventListener("click", () => {
    alert("Reserve-a-time is coming soon. For now, join the queue and staff will assign a station.");
  });

  $("#aboutLink").addEventListener("click", (e) => {
    e.preventDefault();
    alert("Kickoff Game Hub: Browse games, watch clips, and join the queue. Updates are managed in a Google Sheet.");
  });
}

// ---------- Start ----------
wireEvents();
setView("games");
refreshData();
