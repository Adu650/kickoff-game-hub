// Kickoff Game Hub — Google Sheets loader
// Games tab gid: 528392995
// The Tournament tab is loaded by its sheet name from the same spreadsheet.

const CONFIG = {
  sheetId: "13rkxqr7sohPeexiygv0dBMFV63ElDb2J",
  gamesGid: "528392995",
  tournamentSheetName: "Tournament",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function safeText(value) {
  return (value ?? "").toString().trim();
}

function normalizeYesNo(value) {
  const normalized = safeText(value).toLowerCase();
  return ["yes", "y", "true", "1"].includes(normalized);
}

function isActiveRow(row) {
  const status = safeText(row.status).toLowerCase();
  return ["", "active", "yes", "true", "1"].includes(status);
}

function uniqSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  const url = safeText(value);
  if (!url) return "";

  try {
    const parsed = new URL(url, window.location.href);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function normalizeImageUrl(value) {
  const original = safeText(value);
  if (!original) return "";

  // Convert GitHub file-page links into raw image links.
  const githubBlob = original.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i
  );
  if (githubBlob) {
    const [, owner, repo, branch, path] = githubBlob;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  // Convert common Google Drive sharing links into direct-view image links.
  const driveFile = original.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFile?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${driveFile[1]}`;
  }

  const driveId = original.match(/[?&]id=([^&]+)/i);
  if (original.includes("drive.google.com") && driveId?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${driveId[1]}`;
  }

  return safeUrl(original);
}

function youtubeIdFromUrl(url) {
  const value = safeText(url);
  if (!value) return "";

  const shortMatch = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (shortMatch?.[1]) return shortMatch[1];

  const queryMatch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (queryMatch?.[1]) return queryMatch[1];

  const embedMatch = value.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  if (embedMatch?.[1]) return embedMatch[1];

  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return value;
  return "";
}

function setStatus(pillText, statusText, kind = "info") {
  const pill = $("#dataPill");
  const text = $("#statusText");
  if (!pill || !text) return;

  pill.textContent = pillText;
  text.textContent = statusText;
  pill.dataset.kind = kind;
}

function buildGvizUrlByGid(gid) {
  const query = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}&tq=${query}`;
}

function buildGvizUrlBySheetName(sheetName) {
  const query = encodeURIComponent("select *");
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&tq=${query}`;
}

function parseGvizJson(text) {
  const head = text.slice(0, 250).toLowerCase();

  if (head.includes("<!doctype html") || head.includes("<html")) {
    throw new Error(
      "Google returned HTML instead of data. Share the sheet as 'Anyone with the link: Viewer' or publish it to the web."
    );
  }

  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);\s*$/);
  if (!match) {
    throw new Error("Unexpected Google Sheets response.");
  }

  return JSON.parse(match[1]);
}

function gvizToObjects(gviz) {
  const columns = gviz.table.cols.map((column) => column.label || column.id);

  return gviz.table.rows.map((row) => {
    const object = {};

    columns.forEach((name, index) => {
      const cell = row.c[index];
      object[name] = cell ? (cell.f ?? cell.v) : "";
    });

    return object;
  });
}

async function fetchRowsFromUrl(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Google Sheets returned HTTP ${response.status}.`);
  }

  const text = await response.text();
  return gvizToObjects(parseGvizJson(text));
}

async function fetchSheetRows(gid) {
  return fetchRowsFromUrl(buildGvizUrlByGid(gid));
}

async function fetchSheetRowsByName(sheetName) {
  return fetchRowsFromUrl(buildGvizUrlBySheetName(sheetName));
}

function formatDateValue(value, includeTime = false) {
  const raw = safeText(value);
  if (!raw) return "Not announced";

  let date;

  const googleDateMatch = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (googleDateMatch) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = googleDateMatch;
    date = new Date(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  } else {
    date = new Date(raw);
  }

  if (Number.isNaN(date.getTime())) return raw;

  const options = includeTime
    ? {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    : {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      };

  return new Intl.DateTimeFormat("en-GH", options).format(date);
}

let GAMES = [];
let CURRENT_VIEW = "games";
let arrivalTimer;

function viewElement(name) {
  const map = {
    games: $("#viewGames"),
    featured: $("#viewFeatured"),
    appointments: $("#viewAppointments"),
  };

  return map[name] || null;
}

function sectionLabel(name) {
  const labels = {
    games: "Games",
    featured: "Featured Games",
    appointments: "Queue",
  };

  return labels[name] || "Section";
}

function highlightArrival(element) {
  if (!element) return;

  clearTimeout(arrivalTimer);
  $$(".is-arriving").forEach((item) => item.classList.remove("is-arriving"));

  element.classList.remove("is-arriving");
  void element.offsetWidth;
  element.classList.add("is-arriving");

  arrivalTimer = window.setTimeout(() => {
    element.classList.remove("is-arriving");
  }, 850);
}

function scrollToElement(element, updateHash = true) {
  if (!element) return;

  window.requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });

    highlightArrival(element);

    if (updateHash && element.id) {
      history.replaceState(null, "", `#${element.id}`);
    }
  });
}

function setView(name, options = {}) {
  const { scroll = false, updateHash = true, focus = false } = options;
  const target = viewElement(name);
  if (!target) return;

  CURRENT_VIEW = name;

  $("#viewGames").hidden = name !== "games";
  $("#viewAppointments").hidden = name !== "appointments";
  $("#viewFeatured").hidden = name !== "featured";

  $$("#navGames, #navAppointments, #navFeatured, #navVisit").forEach((button) => {
    button.classList.remove("active");
  });

  if (name === "games") $("#navGames")?.classList.add("active");
  if (name === "appointments") $("#navAppointments")?.classList.add("active");
  if (name === "featured") $("#navFeatured")?.classList.add("active");

  const feedback = $("#navFeedback");
  if (feedback) {
    feedback.textContent = `${sectionLabel(name)} section opened.`;
  }

  if (scroll) {
    scrollToElement(target, updateHash);
  }

  if (focus) {
    const heading = target.querySelector("h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
}

function renderFilters() {
  const platforms = uniqSorted(
    GAMES.flatMap((game) =>
      safeText(game.platform)
        .split(/,|\/|\||•/g)
        .map((value) => value.trim())
    )
  );

  const genres = uniqSorted(GAMES.map((game) => safeText(game.genre)));

  const platformFilter = $("#platformFilter");
  const genreFilter = $("#genreFilter");

  const currentPlatform = platformFilter.value;
  const currentGenre = genreFilter.value;

  platformFilter.innerHTML =
    `<option value="">All platforms</option>` +
    platforms
      .map((platform) => `<option value="${escapeHtml(platform)}">${escapeHtml(platform)}</option>`)
      .join("");

  genreFilter.innerHTML =
    `<option value="">All genres</option>` +
    genres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join("");

  platformFilter.value = platforms.includes(currentPlatform) ? currentPlatform : "";
  genreFilter.value = genres.includes(currentGenre) ? currentGenre : "";
}

function gameCard(game) {
  const title = escapeHtml(game.title);
  const platformRaw = safeText(game.platform);
  const genre = escapeHtml(game.genre);
  const station = escapeHtml(game.station);
  const thumbnail = normalizeImageUrl(game.thumbnail_url);
  const hasTrailer = Boolean(youtubeIdFromUrl(game.trailer_url));

  const platforms = platformRaw
    ? platformRaw
        .split(/,|\/|\||•/g)
        .map((platform) => platform.trim())
        .filter(Boolean)
    : [];

  const tag = safeText(game.tag).toLowerCase();

  const badges = [
    ...platforms.map((platform) => `<span class="badge accent">${escapeHtml(platform)}</span>`),
    genre ? `<span class="badge">${genre}</span>` : "",
    station ? `<span class="badge">Station: ${station}</span>` : "",
    tag === "new" ? `<span class="badge badge--new">NEW</span>` : "",
    tag === "popular" ? `<span class="badge badge--popular">POPULAR</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <article class="game">
      <div class="game-thumb">
        ${
          thumbnail
            ? `<img
                src="${escapeHtml(thumbnail)}"
                alt="${title} cover"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.style.display='none';this.nextElementSibling.hidden=false;"
              /><div class="thumb-fallback" hidden>${title}</div>`
            : `<div class="thumb-fallback">${title}</div>`
        }
      </div>

      <div class="game-info">
        <h3 class="game-title">${title}</h3>
        <div class="badges">${badges}</div>

        <div class="game-actions">
          <button
            class="secondary"
            data-action="trailer"
            data-id="${escapeHtml(game.game_id || game.title)}"
            type="button"
            ${hasTrailer ? "" : "disabled"}
          >
            🎬 Watch Clip
          </button>

          <button
            class="primary"
            data-action="book"
            data-title="${title}"
            type="button"
          >
            Join Queue
          </button>
        </div>
      </div>
    </article>
  `;
}

function matchesPlatform(gamePlatformCell, selected) {
  if (!selected) return true;

  const platforms = safeText(gamePlatformCell)
    .split(/,|\/|\||•/g)
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean);

  return platforms.includes(selected.toLowerCase());
}

function renderGames() {
  const query = safeText($("#searchInput").value).toLowerCase();
  const platform = safeText($("#platformFilter").value);
  const genre = safeText($("#genreFilter").value).toLowerCase();

  const filtered = GAMES.filter((game) => {
    if (!isActiveRow(game)) return false;

    const title = safeText(game.title).toLowerCase();
    const gamePlatform = safeText(game.platform);
    const gameGenre = safeText(game.genre).toLowerCase();

    const matchesQuery =
      !query ||
      title.includes(query) ||
      gamePlatform.toLowerCase().includes(query) ||
      gameGenre.includes(query);

    const matchesSelectedPlatform = matchesPlatform(gamePlatform, platform);
    const matchesGenre = !genre || gameGenre === genre;

    return matchesQuery && matchesSelectedPlatform && matchesGenre;
  });

  const grid = $("#gamesGrid");

  grid.innerHTML = filtered.length
    ? filtered.map(gameCard).join("")
    : `
      <div class="emptyState">
        <strong>No games found.</strong>
        <p>Try clearing the filters or searching for a different keyword.</p>
      </div>
    `;
}

function renderFeatured() {
  const featured = GAMES.filter(
    (game) => isActiveRow(game) && normalizeYesNo(game.featured)
  );

  const grid = $("#featuredGrid");

  grid.innerHTML = featured.length
    ? featured.map(gameCard).join("")
    : `
      <div class="emptyState">
        <strong>No featured games right now.</strong>
        <p>Set the featured column to Yes in the Games sheet.</p>
      </div>
    `;
}

function normalizeTournament(row) {
  return {
    tournament_id: safeText(row.tournament_id || row.id || row["Tournament ID"]),
    title: safeText(row.title || row.tournament || row["Tournament Title"]),
    game: safeText(row.game || row["Game"]),
    date: safeText(row.date || row.tournament_date || row["Date"]),
    time: safeText(row.time || row.start_time || row["Time"]),
    registration_deadline: safeText(
      row.registration_deadline ||
      row.deadline ||
      row["Registration Deadline"]
    ),
    poster_url: safeText(row.poster_url || row.poster || row["Poster URL"]),
    signup_url: safeText(row.signup_url || row.signup || row["Signup URL"]),
    location: safeText(row.location || row["Location"]),
    status: safeText(row.status || row["Status"]),
  };
}

function renderTournament(tournament) {
  const status = $("#tournamentStatus");
  const content = $("#tournamentContent");

  if (!tournament) {
    status.textContent = "No event";
    content.innerHTML = `
      <div class="tournamentEmpty">
        No tournament is currently announced. Check back soon or follow Kickoff Gaming Lounge on TikTok.
      </div>
    `;
    return;
  }

  const posterUrl = normalizeImageUrl(tournament.poster_url);
  const signupUrl = safeUrl(tournament.signup_url);
  const title = escapeHtml(tournament.title || "Kickoff Tournament");
  const game = escapeHtml(tournament.game || "Game to be announced");
  const location = escapeHtml(tournament.location || "Kickoff Gaming Lounge");
  const dateText = formatDateValue(tournament.date);
  const timeText = escapeHtml(tournament.time || "Time to be announced");
  const deadlineText = formatDateValue(tournament.registration_deadline, true);

  status.textContent = "Open";

  content.innerHTML = `
    <div class="tournamentDetails">
      <div>
        <h3 class="tournamentName">${title}</h3>
        <p class="tournamentGame">${game}</p>
      </div>

      <div class="tournamentMeta">
        <div class="tournamentMeta__item">
          <span class="tournamentMeta__label">Date</span>
          <span class="tournamentMeta__value">${escapeHtml(dateText)}</span>
        </div>

        <div class="tournamentMeta__item">
          <span class="tournamentMeta__label">Time</span>
          <span class="tournamentMeta__value">${timeText}</span>
        </div>

        <div class="tournamentMeta__item">
          <span class="tournamentMeta__label">Location</span>
          <span class="tournamentMeta__value">${location}</span>
        </div>
      </div>

      <div class="tournamentDeadline">
        <strong>Registration deadline</strong>
        <span>${escapeHtml(deadlineText)}</span>
      </div>

      <div class="tournamentActions${posterUrl && signupUrl ? "" : " tournamentActions--single"}">
        ${
          signupUrl
            ? `
              <a
                class="btn btn--primary"
                href="${escapeHtml(signupUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sign Up Now
              </a>
            `
            : `<span class="btn btn--primary" aria-disabled="true">Signup link coming soon</span>`
        }

        ${
          posterUrl
            ? `
              <a
                class="btn btn--secondary"
                href="${escapeHtml(posterUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Full Poster
              </a>
            `
            : ""
        }
      </div>
    </div>
  `;
}

async function refreshGames() {
  const rows = await fetchSheetRows(CONFIG.gamesGid);

  GAMES = rows
    .map((row) => ({
      game_id: safeText(row.game_id || row.id || row["Game ID"]),
      title: safeText(row.title || row.game || row["Game Title"]),
      platform: safeText(row.platform || row.console || row["Platform"]),
      genre: safeText(row.genre || row["Genre"]),
      trailer_url: safeText(row.trailer_url || row.trailer || row["Trailer URL"]),
      thumbnail_url: safeText(
        row.thumbnail_url ||
        row.thumbnail ||
        row.image_url ||
        row.cover_url ||
        row.image ||
        row.photo ||
        row["Thumbnail URL"] ||
        row["Image URL"] ||
        row["Cover URL"] ||
        row["Image"] ||
        row["Photo"]
      ),
      station: safeText(row.station || row["Station"]),
      status: safeText(row.status || row["Status"]),
      featured: safeText(row.featured || row["Featured"]),
      tag: safeText(row.tag || row["Tag"]),
    }))
    .filter((game) => game.title);

  const activeCount = GAMES.filter(isActiveRow).length;
  $("#gameCount").textContent = activeCount.toString();

  renderFilters();
  renderGames();
  renderFeatured();

  return activeCount;
}

async function refreshTournament() {
  try {
    const rows = await fetchSheetRowsByName(CONFIG.tournamentSheetName);
    const activeTournament = rows
      .map(normalizeTournament)
      .find((row) => isActiveRow(row) && row.title);

    renderTournament(activeTournament || null);
  } catch (error) {
    console.error("Tournament loading error:", error);
    $("#tournamentStatus").textContent = "Unavailable";
    $("#tournamentContent").innerHTML = `
      <div class="tournamentEmpty">
        The tournament information could not be loaded. Check the Tournament tab gid and sharing settings.
      </div>
    `;
  }
}

async function refreshData() {
  setStatus("Loading…", "Fetching the latest games and tournament information.", "info");

  try {
    const activeCount = await refreshGames();
    await refreshTournament();
    setStatus(
      `Loaded ${activeCount} active`,
      "Game list and tournament information were refreshed.",
      "ok"
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Error",
      error.message || "The game list could not be loaded from Google Sheets.",
      "warn"
    );

    await refreshTournament();
  }
}

function closeModal() {
  const modal = $("#trailerModal");
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
  $("#videoWrap").innerHTML = "";
}

function openInitialHash() {
  const hash = window.location.hash.replace("#", "");

  if (["viewGames", "games"].includes(hash)) {
    setView("games", { scroll: true, updateHash: false });
    return;
  }

  if (["viewFeatured", "featured"].includes(hash)) {
    setView("featured", { scroll: true, updateHash: false });
    return;
  }

  if (["viewAppointments", "queue"].includes(hash)) {
    setView("appointments", { scroll: true, updateHash: false });
    return;
  }

  if (hash === "visit-us") {
    scrollToElement($("#visit-us"), false);
    $("#navVisit")?.classList.add("active");
  }
}

function wireEvents() {
  $("#year").textContent = new Date().getFullYear();

  $$("#navGames, #navAppointments, #navFeatured").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view, {
        scroll: true,
        updateHash: true,
        focus: false,
      });
    });
  });

  $("#navVisit")?.addEventListener("click", () => {
    $$("#navGames, #navAppointments, #navFeatured, #navVisit").forEach((button) => {
      button.classList.remove("active");
    });

    $("#navVisit").classList.add("active");
    $("#navFeedback").textContent = "Visit Us section opened.";
    scrollToElement($("#visit-us"), true);
  });

  $("#refreshBtn")?.addEventListener("click", refreshData);
  $("#searchInput")?.addEventListener("input", renderGames);
  $("#platformFilter")?.addEventListener("change", renderGames);
  $("#genreFilter")?.addEventListener("change", renderGames);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.action === "book") {
      setView("appointments", {
        scroll: true,
        updateHash: true,
      });

      if (button.dataset.title) {
        $("#statusText").textContent =
          `Selected: ${safeText(button.dataset.title)}. Tell staff when checking in.`;
      }
    }

    if (button.dataset.action === "trailer") {
      const id = safeText(button.dataset.id);

      const game =
        GAMES.find((item) => safeText(item.game_id) === id) ||
        GAMES.find((item) => safeText(item.title) === id);

      if (!game) return;

      const videoId = youtubeIdFromUrl(game.trailer_url);
      if (!videoId) return;

      $("#modalTitle").textContent = `${safeText(game.title)} — Trailer`;
      $("#modalMeta").textContent =
        `${safeText(game.platform)}${game.genre ? ` • ${safeText(game.genre)}` : ""}`;

      $("#videoWrap").innerHTML = `
        <iframe
          src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1"
          title="${escapeHtml(game.title)} trailer"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
      `;

      const modal = $("#trailerModal");
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modalOpen");
      modal.querySelector(".modal__dialog")?.focus();
    }
  });

  $("#modalBackdrop")?.addEventListener("click", closeModal);
  $("#closeModalBtn")?.addEventListener("click", closeModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  $("#joinQueueBtn")?.addEventListener("click", () => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const numbers = "23456789";
    const pick = (characters) =>
      characters[Math.floor(Math.random() * characters.length)];

    const code =
      `${pick(letters)}${pick(letters)}-` +
      `${pick(numbers)}${pick(numbers)}${pick(numbers)}`;

    $("#slipCode").textContent = code;
    $("#slipTimestamp").textContent = new Date().toLocaleString("en-GH");
    $("#queueSlip").hidden = false;

    $("#queueSlip").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  });

  window.addEventListener("hashchange", openInitialHash);
}

wireEvents();
setView("games");
refreshData().finally(() => {
  window.setTimeout(openInitialHash, 100);
});
