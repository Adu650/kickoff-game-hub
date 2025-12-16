// Kickoff Gaming Lounge - Game List UI (Google Sheets source)
// Brand: #0B0B0B (Black), #00FF88 (Green), #C9A227 (Gold), #F5F7FA (White)

// ====== YOUR SHEET SETTINGS ======
const SHEET_ID = "13rkxqr7sohPeexiygv0dBMFV63ElDb2J";

// If your games are on the FIRST tab, gid is usually 0.
// If not, open the sheet in browser and look for: ...gid=123456789
const GID = "0";

// Google "gviz" endpoint can return CSV (works best when sheet is published or public)
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

// Expected columns in your sheet (header row):
// - title OR game OR name
// - platform OR console
// Optional:
// - id
// - featured_image (url)
const REQUIRED_TITLE_KEYS = ["title", "game", "name"];
const REQUIRED_PLATFORM_KEYS = ["platform", "console"];

// ====== DOM ======
const el = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  platform: document.getElementById("platform"),
  sort: document.getElementById("sort"),
  total: document.getElementById("totalGames"),
  showing: document.getElementById("showingGames"),
  empty: document.getElementById("emptyState"),
  year: document.getElementById("year"),
  featuredTitle: document.getElementById("featuredTitle"),
  featuredPlatform: document.getElementById("featuredPlatform"),
  featuredImage: document.getElementById("featuredImage"),
};

let GAMES = []; // <- populated from Google Sheets

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCSV(csvText) {
  // Simple CSV parser (handles quoted commas)
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cur.length || row.length) {
        row.push(cur);
        rows.push(row);
      }
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  // Remove empty trailing rows
  return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
}

function findHeaderIndex(headers, keys) {
  const lower = headers.map(h => normalize(h));
  for (const k of keys) {
    const idx = lower.indexOf(k);
    if (idx !== -1) return idx;
  }
  return -1;
}

function splitPlatforms(value) {
  // supports: "XBOX ONE, PS5" or "XBOX ONE / PS5" etc.
  return String(value || "")
    .split(/,|\/|\||•/g)
    .map(s => s.trim())
    .filter(Boolean);
}

async function loadGamesFromSheet() {
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet. HTTP ${res.status}. Make sure the sheet is Published to web or shared publicly.`);
  }

  const csv = await res.text();
  const rows = parseCSV(csv);

  if (rows.length < 2) {
    throw new Error("Sheet has no data rows. Make sure there is a header row + at least one game row.");
  }

  const headers = rows[0].map(h => String(h).trim());
  const titleIdx = findHeaderIndex(headers, REQUIRED_TITLE_KEYS);
  const platformIdx = findHeaderIndex(headers, REQUIRED_PLATFORM_KEYS);

  if (titleIdx === -1 || platformIdx === -1) {
    throw new Error(
      `Could not find required columns in sheet.\n` +
      `Expected a header like: Title + Platform (or Game/Name + Console).\n` +
      `Found headers: ${headers.join(", ")}`
    );
  }

  // optional columns
  const idIdx = findHeaderIndex(headers, ["id"]);
  const imgIdx = findHeaderIndex(headers, ["featured_image", "image", "img", "cover", "cover_url"]);

  const games = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = (r[titleIdx] || "").trim();
    const platformRaw = r[platformIdx] || "";

    if (!title) continue;

    const platforms = splitPlatforms(platformRaw);
    if (platforms.length === 0) platforms.push("Console");

    games.push({
      id: idIdx !== -1 ? (r[idIdx] || i) : i,
      title,
      platform: platforms,
      featured_image: imgIdx !== -1 ? (r[imgIdx] || "").trim() : ""
    });
  }

  return games;
}

function matchesPlatform(game, selected) {
  if (selected === "ALL") return true;
  return game.platform.includes(selected);
}

function sortGames(games, mode) {
  const copy = [...games];
  if (mode === "AZ") copy.sort((a,b)=> a.title.localeCompare(b.title));
  if (mode === "ZA") copy.sort((a,b)=> b.title.localeCompare(a.title));
  if (mode === "PLATFORM") copy.sort((a,b)=> (a.platform[0] || "").localeCompare(b.platform[0] || ""));
  return copy;
}

function setFeatured(game) {
  el.featuredTitle.textContent = game.title;
  el.featuredPlatform.textContent = `Available on: ${game.platform.join(" • ")}`;

  // If your sheet has an image URL column, we’ll use it:
  if (game.featured_image) {
    el.featuredImage.src = game.featured_image;
  }
}

function renderCard(game) {
  const platforms = game.platform || [];
  const primary = platforms[0] || "Console";
  const extraCount = Math.max(0, platforms.length - 1);

  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `Feature ${game.title}`);

  card.innerHTML = `
    <h3 class="card__title">${escapeHtml(game.title)}</h3>
    <div class="badges">
      <span class="badge badge--green">${escapeHtml(primary)}</span>
      ${extraCount > 0 ? `<span class="badge badge--gold">+${extraCount} more</span>` : ""}
    </div>
  `;

  const feature = () => setFeatured(game);
  card.addEventListener("click", feature);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") feature();
  });

  return card;
}

function applyFilters() {
  const q = normalize(el.search.value);
  const selectedPlatform = el.platform.value;
  const sortMode = el.sort.value;

  let filtered = GAMES.filter(g => {
    const titleMatch = normalize(g.title).includes(q);
    const platformMatch = matchesPlatform(g, selectedPlatform);
    return titleMatch && platformMatch;
  });

  filtered = sortGames(filtered, sortMode);

  el.grid.innerHTML = "";
  filtered.forEach(g => el.grid.appendChild(renderCard(g)));

  el.total.textContent = String(GAMES.length);
  el.showing.textContent = String(filtered.length);
  el.empty.classList.toggle("hidden", filtered.length !== 0);
}

async function init() {
  el.year.textContent = new Date().getFullYear();

  // Load from Google Sheets
  try {
    // Show a quick loading message using the emptyState block
    el.empty.classList.remove("hidden");
    el.empty.textContent = "Loading games from Kickoff Google Sheet…";

    GAMES = await loadGamesFromSheet();

    if (GAMES.length === 0) {
      el.empty.textContent = "No games found in the sheet yet.";
      return;
    }

    // Feature first game by default
    setFeatured(GAMES[0]);

    // Hook events
    el.search.addEventListener("input", applyFilters);
    el.platform.addEventListener("change", applyFilters);
    el.sort.addEventListener("change", applyFilters);

    // Render
    applyFilters();

  } catch (err) {
    console.error(err);
    el.empty.classList.remove("hidden");
    el.empty.textContent =
      "Could not load games from Google Sheets. " +
      "Make sure the sheet is Published to web or shared publicly, and headers include Title + Platform.";
  }
}

init();
