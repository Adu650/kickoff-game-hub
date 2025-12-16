// Kickoff Game Hub — GID-based loader (most reliable for Google Sheets)
// Games tab gid: 528392995

const CONFIG = {
  sheetId: "13rkxqr7sohPeexiygv0dBMFV63ElDb2J",
  gamesGid: "528392995",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
function escapeHtml(s) {
  return safeText(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function youtubeIdFromUrl(url) {
  const u = safeText(url);
  if (!u) return "";
  const m1 = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m1?.[1]) return m1[1];
  const m2 = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m2?.[1]) return m2[1];
  const m3 = u.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3?.[1]) return m3[1];
  if (/^[A-Za-z0-9_-]{6,}$/.test(u)) return u;
  return "";
}

function setStatus(pillText, statusText, kind="info") {
  const pill = $("#dataPill");
  const txt = $("#statusText");
  if (!pill || !txt) return;

  pill.textContent = pillText;
  txt.textContent = statusText;

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

function buildGvizUrlByGid(gid) {
  const tq = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}&tq=${tq}`;
}

function parseGvizJson(text) {
  const head = text.slice(0, 250).toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html")) {
    throw new Error(
      "Google returned HTML instead of data. Fix: Share the sheet as 'Anyone with link: Viewer' OR File → Publish to web."
    );
  }
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);\s*$/);
  if (!match) throw new Error("Unexpected GViz response (not setResponse).");
  return JSON.parse(match[1]);
}

function gvizToObjects(gviz) {
  const cols = gviz.table.cols.map(c => c.label || c.id);
  return gviz.table.rows.map(r => {
    const obj = {};
    cols.forEach((name, idx) => {
      const cell = r.c[idx];
      obj[name] = cell ? (cell.f ?? cell.v) : "";
    });
    return obj;
  });
}

// ---------- UI ----------
let GAMES = [];
let CURRENT_VIEW = "games";

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
  // Optional improvement: split multi-platform cells into separate filter options
  const platforms = uniqSorted(
    GAMES.flatMap(g => safeText(g.platform).split(/,|\/|\||•/g).map(x => x.trim())).filter(Boolean)
  );
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
  const platformRaw = safeText(game.platform);
  const genre = escapeHtml(game.genre);
  const station = escapeHtml(game.station);
  const thumb = safeText(game.thumbnail_url);
  const hasTrailer = !!youtubeIdFromUrl(game.trailer_url);

  const platforms = platformRaw
    ? platformRaw.split(/,|\/|\||•/g).map(p => p.trim()).filter(Boolean)
    : [];

  const badges = [
    ...platforms.map(p => `<span class="badge accent">${escapeHtml(p)}</span>`),
    genre ? `<span class="badge">${genre}</span>` : "",
    station ? `<span class="badge">Station: ${station}</span>` : ""
  ].filter(Boolean).join("");

  return `
    <article class="game">
      <div class="game-thumb">
        ${
          thumb
            ? `<img src="${escapeHtml(thumb)}" alt="${title} cover" loading="lazy" />`
            : `<div class="thumb-fallback">${title}</div>`
        }
      </div>

      <div class="game-info">
        <div class="game-title">${title}</div>
        <div class="badges">${badges}</div>

        <div class="game-actions">
          <button class="secondary" data-action="trailer"
                  data-id="${escapeHtml(game.game_id || title)}"
                  ${hasTrailer ? "" : "disabled"}>
            🎬 Watch Clip
          </button>
          <button class="primary" data-action="book" data-title="${title}">
            📅 Book
          </button>
        </div>
      </div>
    </article>
  `;
}

function matchesPlatform(gamePlatformCell, selected) {
  if (!selected) return true;
  const parts = safeText(gamePlatformCell)
    .split(/,|\/|\||•/g)
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
  return parts.includes(selected.toLowerCase());
}

function renderGames() {
  const q = safeText($("#searchInput").value).toLowerCase();
  const pf = safeText($("#platformFilter").value);
  const gf = safeText($("#genreFilter").value).toLowerCase();

  const filtered = GAMES.filter(g => {
    if (!isActiveRow(g)) return false;

    const title = safeText(g.title).toLowerCase();
    const platform = safeText(g.platform);
    const genre = safeText(g.genre).toLowerCase();

    const matchesQ = !q || title.includes(q) || platform.toLowerCase().includes(q) || genre.includes(q);
    const matchesP = matchesPlatform(platform, pf);
    const matchesG = !gf || genre === gf;

    return matchesQ && matchesP && matchesG;
  });

  const grid = $("#gamesGrid");
  grid.innerHTML = filtered.length
    ? filtered.map(gameCard).join("")
    : `<div class="card"><b>No games found.</b><div class="muted">Try clearing filters or searching a different keyword.</div></div>`;
}

function renderFeatured() {
  const featured = GAMES.filter(g => isActiveRow(g) && normalizeYesNo(g.featured));
  const grid = $("#featuredGrid");
  grid.innerHTML = featured.length
    ? featured.map(gameCard).join("")
    : `<div class="card"><b>No featured games right now.</b><div class="muted">Set <b>featured</b> to Yes in your sheet.</div></div>`;
}

async function refreshData() {
  setStatus("Loading…", "Fetching the latest game list.", "info");

  try {
    const url = buildGvizUrlByGid(CONFIG.gamesGid);
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const gviz = parseGvizJson(text);
    const rows = gvizToObjects(gviz);

    GAMES = rows.map(r => ({
      game_id: safeText(r.game_id || r.id || r["Game ID"]),
      title: safeText(r.title || r.game || r["Game Title"]),
      platform: safeText(r.platform || r.console || r["Platform"]),
      genre: safeText(r.genre || r["Genre"]),
      trailer_url: safeText(r.trailer_url || r.trailer || r["Trailer URL"]),
      thumbnail_url: safeText(r.thumbnail_url || r.thumbnail || r["Thumbnail URL"]),
      station: safeText(r.station || r["Station"]),
      status: safeText(r.status || r["Status"]),
      featured: safeText(r.featured || r["Featured"]),
    }));

    const activeCount = GAMES.filter(isActiveRow).length;

    renderFilters();
    renderGames();
    renderFeatured();

    setStatus(`Loaded ${activeCount} active`, "Game list updated from Google Sheets.", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Error", err.message || "Failed to load games from Google Sheets.", "warn");
  }
}

function closeModal() {
  const modal = $("#trailerModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  $("#videoWrap").innerHTML = "";
}

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

    if (btn.dataset.action === "book") {
      setView("appointments");
      $("#joinQueueBtn")?.focus();
      if (btn.dataset.title) {
        $("#statusText").textContent = `Selected: ${safeText(btn.dataset.title)} (tell staff when checking in).`;
      }
    }

    if (btn.dataset.action === "trailer") {
      const id = safeText(btn.dataset.id);
      const game = GAMES.find(g => safeText(g.game_id) === id) || GAMES.find(g => safeText(g.title) === id);
      if (!game) return;

      const vid = youtubeIdFromUrl(game.trailer_url);
      if (!vid) return;

      $("#modalTitle").textContent = `${safeText(game.title)} — Trailer`;
      $("#modalMeta").textContent = `${safeText(game.platform)}${game.genre ? " • " + safeText(game.genre) : ""}`;
      $("#videoWrap").innerHTML =
        `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&rel=0&modestbranding=1"
          allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;

      const modal = $("#trailerModal");
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    }
  });

  $("#modalBackdrop")?.addEventListener("click", closeModal);
  $("#closeModalBtn")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  $("#joinQueueBtn")?.addEventListener("click", () => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const nums = "23456789";
    const pick = (set) => set[Math.floor(Math.random()*set.length)];
    const code = `${pick(letters)}${pick(letters)}-${pick(nums)}${pick(nums)}${pick(nums)}`;

    $("#slipCode").textContent = code;
    $("#slipTimestamp").textContent = new Date().toLocaleString();
    $("#queueSlip").hidden = false;
  });

  $("#bookBtn")?.addEventListener("click", () => {
    alert("Reserve-a-time is coming soon. For now, join the queue and staff will assign a station.");
  });

  $("#aboutLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    alert("Kickoff Game Hub: Browse games, watch clips, and join the queue. Updates are managed in a Google Sheet.");
  });
}

// ---------- Start ----------
wireEvents();
setView("games");
refreshData();
