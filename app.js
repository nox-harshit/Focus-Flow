(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "focus-flow-settings-v1";
  const MUSIC_KEY = "focus-flow-music-v2";
  const YOUTUBE_KEY_STORAGE = "focus-flow-youtube-api-key-v1";

  // Keyboard shortcut definitions
  const SHORTCUTS = {
    toggle: " ",
    reset: "r",
    fullscreen: "f",
    settings: "s",
    next: "n",
    music: "m",
    focus: "1",
    short: "2",
    long: "3"
  };

  const defaults = {
    focusMinutes: 25,
    shortMinutes: 5,
    longMinutes: 15,
    longEvery: 4,
    accentColor: "#d7ff64",
    textColor: "#f7f7f7",
    fontChoice: "system",
    fontSize: "standard",
    overlay: 25,
    blur: 0,
    backgroundType: "default",
    solidColor: "#10131d",
    gradientOne: "#10131d",
    gradientTwo: "#31234a",
    gradientAngle: 135,
    autoStart: "off",
    soundMode: "on",
    notifyMode: "off",
    task: "",
    googleFont: "",
    fontUrl: "",
    backgroundUrl: "",
    websiteUrl: ""
  };

  let settings = { ...defaults };
  let mode = "focus";
  let remaining = 25 * 60;
  let duration = 25 * 60;
  let running = false;
  let endAt = 0;
  let ticker = null;
  let completedFocus = 0;
  let sessionsCompleted = 0;
  let toastTimeout = null;
  let currentObjectUrl = null;

  const modeInfo = {
    focus: { label: "TIME TO FOCUS", button: "START FOCUS" },
    short: { label: "TAKE A BREATHER", button: "START BREAK" },
    long: { label: "RESET & RECHARGE", button: "START LONG BREAK" }
  };

  function safeNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  }

  function durationFor(m) {
    return safeNumber(settings[m + "Minutes"], 1, m === "focus" ? 180 : 90, defaults[m + "Minutes"]) * 60;
  }

  function fmt(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  }

  function toast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function saveSettings() {
    try {
      const persisted = { ...settings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch (_) {
      toast("Could not save settings in this browser.");
    }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") settings = { ...defaults, ...saved };
    } catch (_) {
      settings = { ...defaults };
    }
    settings.focusMinutes = safeNumber(settings.focusMinutes, 1, 180, 25);
    settings.shortMinutes = safeNumber(settings.shortMinutes, 1, 60, 5);
    settings.longMinutes = safeNumber(settings.longMinutes, 1, 90, 15);
    settings.longEvery = safeNumber(settings.longEvery, 2, 12, 4);
  }

  function populateInputs() {
    const fields = [
      "focusMinutes", "shortMinutes", "longMinutes", "longEvery",
      "accentColor", "textColor", "fontChoice", "fontSize",
      "googleFont", "fontUrl", "solidColor", "gradientOne", "gradientTwo",
      "gradientAngle", "autoStart", "soundMode", "notifyMode"
    ];
    for (const id of fields) {
      if ($(id) && settings[id] !== undefined) $(id).value = settings[id];
    }
    if ($("overlayRange")) $("overlayRange").value = settings.overlay;
    if ($("blurRange")) $("blurRange").value = settings.blur;
    if ($("task")) $("task").value = settings.task || "";
    updateRangeLabels();
  }

  function applyAppearance() {
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--text", settings.textColor);
    document.documentElement.style.setProperty("--overlay", Number(settings.overlay) / 100);
    document.documentElement.style.setProperty("--bg-blur", Number(settings.blur) + "px");

    const fonts = {
      system: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      rounded: '"Trebuchet MS", ui-rounded, system-ui, sans-serif'
    };
    const timerSizes = {
      compact: "clamp(74px, 16vw, 170px)",
      standard: "clamp(84px, 20vw, 220px)",
      large: "clamp(96px, 23vw, 250px)"
    };

    const timer = $("timer");
    if (timer) timer.style.fontSize = timerSizes[settings.fontSize] || timerSizes.standard;

    document.body.style.fontFamily = settings.customFontFamily
      ? `"${settings.customFontFamily.replace(/["\\]/g, "")}", ${fonts.system}`
      : (fonts[settings.fontChoice] || fonts.system);
  }

  function loadCustomFont() {
    const fontUrl = (settings.fontUrl || "").trim();
    const fontName = (settings.googleFont || "").trim();

    if (fontUrl) {
      let link = $("customFontLink");
      if (!link) {
        link = document.createElement("link");
        link.id = "customFontLink";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      if (/\.(woff2?|ttf|otf)(\?.*)?$/i.test(fontUrl)) {
        let style = $("customFontFace");
        if (!style) {
          style = document.createElement("style");
          style.id = "customFontFace";
          document.head.appendChild(style);
        }
        style.textContent = `@font-face{font-family:"FocusCustom";src:url("${fontUrl.replace(/["\\]/g, "")}") format("woff2");font-display:swap}`;
        link.remove();
        settings.customFontFamily = "FocusCustom";
      } else {
        link.href = fontUrl;
        settings.customFontFamily = fontName || "";
      }
    } else if (fontName) {
      let link = $("customFontLink");
      if (!link) {
        link = document.createElement("link");
        link.id = "customFontLink";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fontName.trim()).replace(/%20/g, "+") + ":wght@400;500;600;700&display=swap";
      settings.customFontFamily = fontName;
    } else {
      $("customFontLink")?.remove();
      $("customFontFace")?.remove();
      settings.customFontFamily = "";
    }
    applyAppearance();
  }

  function updateRangeLabels() {
    if ($("overlayValue")) $("overlayValue").textContent = settings.overlay + "%";
    if ($("blurValue")) $("blurValue").textContent = settings.blur + "px";
    if ($("angleValue")) $("angleValue").textContent = settings.gradientAngle + "°";
  }

  function showBackgroundFields() {
    const type = $("backgroundType") ? $("backgroundType").value : "default";
    for (const id of ["solidFields", "gradientFields", "fileFields", "urlFields", "websiteFields"]) {
      if ($(id)) $(id).classList.add("hidden");
    }
    if (type === "solid" && $("solidFields")) $("solidFields").classList.remove("hidden");
    if (type === "gradient" && $("gradientFields")) $("gradientFields").classList.remove("hidden");
    if ((type === "image" || type === "video") && $("fileFields")) $("fileFields").classList.remove("hidden");
    if (type === "url" && $("urlFields")) $("urlFields").classList.remove("hidden");
    if (type === "website" && $("websiteFields")) $("websiteFields").classList.remove("hidden");
  }

  function clearMedia() {
    const video = $("backgroundVideo");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.style.display = "none";
    }
    const frame = $("backgroundFrame");
    if (frame) {
      frame.removeAttribute("src");
      frame.style.display = "none";
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function applyBackground() {
    clearMedia();
    const bg = $("background");
    if (!bg) return;
    bg.style.display = "block";
    const type = settings.backgroundType;

    if (type === "solid") {
      bg.style.background = settings.solidColor;
    } else if (type === "gradient") {
      bg.style.background = `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientOne}, ${settings.gradientTwo})`;
    } else if (type === "default") {
      bg.style.background = "linear-gradient(135deg,#10131d,#050608 65%,#1b1730)";
    } else if (type === "image" || type === "video") {
      const file = $("backgroundFile")?.files?.[0];
      if (file) applyLocalFile(file, type);
      else bg.style.background = "linear-gradient(135deg,#10131d,#050608 65%,#1b1730)";
    }
    applyAppearance();
  }

  function applyLocalFile(file, preferredType) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast("Choose a supported image or video file.");
      return;
    }
    clearMedia();
    currentObjectUrl = URL.createObjectURL(file);
    const bg = $("background");
    if (!bg) return;
    bg.style.display = "block";

    if (file.type.startsWith("video/") || preferredType === "video") {
      bg.style.display = "none";
      const video = $("backgroundVideo");
      if (video) {
        video.src = currentObjectUrl;
        video.style.display = "block";
        video.play().catch(() => {});
      }
    } else {
      bg.style.background = `url("${currentObjectUrl}") center / cover no-repeat`;
    }
  }

  function setMode(nextMode, reset = true) {
    if (!modeInfo[nextMode]) return;
    stopTicker();
    mode = nextMode;
    if (reset) {
      duration = durationFor(mode);
      remaining = duration;
    }
    running = false;
    updateUI();
    saveSettings();
  }

  function updateUI() {
    const timer = $("timer");
    if (timer) {
      timer.textContent = fmt(remaining);
      timer.setAttribute("aria-label", `${fmt(remaining)}. ${running ? "Pause" : "Start"} timer`);
    }
    if ($("modeLabel")) $("modeLabel").textContent = modeInfo[mode].label;
    if ($("startBtn")) $("startBtn").textContent = running ? "PAUSE" : modeInfo[mode].button;
    if ($("progressBar")) {
      const pct = duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;
      $("progressBar").style.width = pct + "%";
    }
    if ($("sessionCount")) $("sessionCount").textContent = "SESSION " + String(completedFocus + 1).padStart(2, "0");
    if ($("totalCount")) $("totalCount").textContent = `${sessionsCompleted} completed`;

    const titlePrefix = running ? `(${fmt(remaining)}) ` : "";
    document.title = `${titlePrefix}focus.flow — ${mode === "focus" ? "Focus" : "Break"}`;

    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }

  function startTimer() {
    if (running) {
      pauseTimer();
      return;
    }
    if (remaining <= 0) remaining = durationFor(mode);
    running = true;
    endAt = Date.now() + remaining * 1000;
    ticker = setInterval(tick, 200);
    tick();
    updateUI();
  }

  function pauseTimer() {
    if (!running) return;
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    running = false;
    stopTicker();
    updateUI();
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  function tick() {
    if (!running) return;
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    updateUI();
    if (remaining <= 0) finishSession();
  }

  function finishSession() {
    running = false;
    stopTicker();
    remaining = 0;
    if (mode === "focus") {
      completedFocus++;
      sessionsCompleted++;
    }
    updateUI();
    playCompletion();
    notifyCompletion();
    toast(mode === "focus" ? "Focus session complete. Take a breather." : "Break complete. Ready to flow.");
    if (settings.autoStart === "on") {
      nextSession();
      startTimer();
    }
  }

  function nextSession() {
    if (mode === "focus") {
      const every = safeNumber(settings.longEvery, 2, 12, 4);
      setMode(completedFocus > 0 && completedFocus % every === 0 ? "long" : "short");
    } else {
      setMode("focus");
    }
  }

  function resetTimer() {
    stopTicker();
    running = false;
    duration = durationFor(mode);
    remaining = duration;
    updateUI();
    toast("Timer reset");
  }

  function skipSession() {
    nextSession();
    toast("Switched to " + (mode === "focus" ? "focus" : "break"));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen?.();
      if (p && p.catch) p.catch(() => toast("Fullscreen is unavailable in this browser."));
    } else {
      document.exitFullscreen?.().catch?.(() => {});
    }
  }

  function openSettings() {
    $("settingsPanel")?.classList.add("open");
    $("settingsBackdrop")?.classList.add("open");
    $("settingsPanel")?.setAttribute("aria-hidden", "false");
    $("closeSettings")?.focus();
  }

  function closeSettings() {
    $("settingsPanel")?.classList.remove("open");
    $("settingsBackdrop")?.classList.remove("open");
    $("settingsPanel")?.setAttribute("aria-hidden", "true");
    $("settingsBtn")?.focus();
  }

  function playCompletion() {
    if (settings.soundMode !== "on") return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      [660, 880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
      setTimeout(() => ctx.close(), 1000);
    } catch (_) {}
  }

  function notifyCompletion() {
    if (settings.notifyMode !== "on") return;
    if (!("Notification" in window)) {
      toast("Notifications are not supported here.");
      return;
    }
    if (Notification.permission === "granted") {
      new Notification("focus.flow", {
        body: mode === "focus" ? "Focus session complete. Time for a break." : "Break complete. Ready to focus?",
        icon: "./favicon.svg"
      });
    }
  }

  function setTimerDurationIfIdle() {
    if (!running) {
      duration = durationFor(mode);
      remaining = duration;
      updateUI();
    }
  }

  function setSetting(id, value, apply = true) {
    settings[id] = value;
    if (apply) {
      applyAppearance();
      saveSettings();
    }
  }

  // ==========================================================================
  // Music Player & YouTube Integration
  // ==========================================================================
  const audio = $("musicAudio") || new Audio();
  const embed = $("musicEmbed");
  let tracks = [];
  let trackIndex = -1;
  let embedPlaying = false;
  let embedPaused = false;
  let seekTimer = null;
  audio.volume = 0.7;

  function timeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  }

  function musicPanel(open) {
    const panel = $("musicPanel");
    if (!panel) return;
    const shouldOpen = typeof open === "boolean" ? open : !panel.classList.contains("open");
    panel.classList.toggle("open", shouldOpen);
    panel.setAttribute("aria-hidden", String(!shouldOpen));
    updateMiniPlayer();
  }

  function persistMusic() {
    try {
      const saved = tracks.slice(0, 25).map(t => ({
        title: t.title,
        artist: t.artist,
        url: t.url || "",
        artwork: t.artwork || "",
        kind: t.kind || "youtube",
        source: t.source || "YouTube",
        youtubeId: t.youtubeId || "",
        preview: !!t.preview
      }));
      localStorage.setItem(MUSIC_KEY, JSON.stringify({ tracks: saved, volume: audio.volume }));
    } catch (_) {}
  }

  function restoreMusic() {
    try {
      const saved = JSON.parse(localStorage.getItem(MUSIC_KEY) || "null");
      if (!saved || !Array.isArray(saved.tracks)) return;
      tracks = saved.tracks.filter(t => t && t.title);
      if (Number.isFinite(saved.volume)) {
        audio.volume = Math.min(1, Math.max(0, saved.volume));
        if ($("musicVolume")) $("musicVolume").value = audio.volume;
      }
    } catch (_) {}
  }

  function youtubeIdFromUrl(url) {
    if (!url) return "";
    const str = String(url).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(str)) return str;
    const match = str.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : "";
  }

  function isPlaying() {
    return (embedPlaying && !embedPaused) || (!audio.paused && !audio.ended && audio.src);
  }

  function stopEmbed() {
    embedPlaying = false;
    embedPaused = false;
    if (embed) {
      embed.classList.remove("show");
      embed.removeAttribute("src");
    }
    clearInterval(seekTimer);
    seekTimer = null;
  }

  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function renderPlaylist() {
    if ($("playlistCount")) {
      $("playlistCount").textContent = tracks.length + (tracks.length === 1 ? " track" : " tracks");
    }
    const list = $("playlist");
    if (!list) return;
    list.innerHTML = "";

    if (!tracks.length) {
      list.innerHTML = '<div class="playlist-empty">Your played tracks will appear here.</div>';
      return;
    }

    tracks.forEach((track, index) => {
      const row = document.createElement("div");
      row.className = "track-row" + (index === trackIndex ? " active" : "");
      const playingHere = index === trackIndex && isPlaying();

      row.innerHTML = `
        <span class="track-index">${playingHere ? "♫" : String(tracks.length - index).padStart(2, "0")}</span>
        ${track.artwork ? `<img class="track-thumb" alt="" loading="lazy" src="${track.artwork}">` : '<span class="track-thumb result-placeholder">♫</span>'}
        <span class="track-row-copy">
          <strong>${escapeHtml(track.title || "Untitled track")}</strong>
          <span>${escapeHtml(track.artist || "YouTube")}</span>
        </span>
        <span class="history-play" aria-hidden="true">${playingHere ? "Ⅱ" : "▶"}</span>
      `;
      row.addEventListener("click", () => playTrack(index));
      list.appendChild(row);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  function renderSearchResults(results) {
    const list = $("searchResults");
    if (!list) return;
    if ($("searchResultCount")) {
      $("searchResultCount").textContent = results.length ? `${results.length} found` : "No results";
    }
    list.innerHTML = "";

    if (!results.length) {
      list.innerHTML = '<div class="playlist-empty">No results yet. Try another search or song.</div>';
      return;
    }

    results.forEach(track => {
      const row = document.createElement("div");
      row.className = "track-row search-result-row";
      row.innerHTML = `
        ${track.artwork ? `<img class="track-thumb" alt="" loading="lazy" src="${track.artwork}">` : '<span class="track-thumb result-placeholder">♫</span>'}
        <span class="track-row-copy">
          <strong>${escapeHtml(track.title)}</strong>
          <span>${escapeHtml(track.artist || "YouTube")}</span>
        </span>
        <button class="result-play" type="button" aria-label="Play this result">▶</button>
      `;

      const choose = () => playSearchResult(track);
      row.addEventListener("click", choose);
      row.querySelector(".result-play")?.addEventListener("click", event => {
        event.stopPropagation();
        choose();
      });
      list.appendChild(row);
    });
  }

  // CRITICAL RULE: Tracks are added to history ONLY when the user selects them for playback!
  function playSearchResult(track) {
    const existing = tracks.findIndex(item => (track.youtubeId && item.youtubeId === track.youtubeId) || (track.url && item.url === track.url));
    if (existing >= 0) tracks.splice(existing, 1);
    tracks.unshift({ ...track });
    if (tracks.length > 25) tracks.length = 25;
    trackIndex = 0;
    persistMusic();
    renderPlaylist();
    playTrack(0);
  }

  function updateMiniPlayer() {
    const track = tracks[trackIndex];
    const playing = isPlaying();
    const panelOpen = $("musicPanel")?.classList.contains("open");

    const mini = $("musicMini");
    if (mini) {
      mini.classList.toggle("visible", !panelOpen && !!track);
      mini.setAttribute("aria-hidden", String(panelOpen || !track));
    }
    $("musicBtn")?.classList.toggle("playing", playing);

    if ($("miniTitle")) $("miniTitle").textContent = track ? track.title : "Nothing playing";
    if ($("miniArtist")) $("miniArtist").textContent = track ? (track.artist || "Unknown artist") : "Open player";
    if ($("miniPlay")) $("miniPlay").textContent = playing ? "Ⅱ" : "▶";

    const miniArt = $("miniArt");
    if (miniArt) {
      miniArt.style.backgroundImage = track && track.artwork
        ? `url("${track.artwork.replace(/["\\]/g, "")}")`
        : "linear-gradient(135deg,#d7ff64,#4c8d7b)";
    }
  }

  function updateMusicUI() {
    const track = tracks[trackIndex];
    const playing = isPlaying();

    if ($("trackTitle")) $("trackTitle").textContent = track ? track.title : "Nothing playing";
    if ($("trackArtist")) $("trackArtist").textContent = track ? (track.artist || "Unknown artist") : "Search or pick a focus soundtrack";
    if ($("trackSource")) $("trackSource").textContent = track ? (track.source || "YouTube") : "Ready";

    const art = $("albumArt");
    if (art) {
      art.style.backgroundImage = track && track.artwork
        ? `linear-gradient(0deg,rgba(0,0,0,.15),rgba(0,0,0,.15)),url("${track.artwork.replace(/["\\]/g, "")}")`
        : "linear-gradient(135deg,#d7ff64,#4c8d7b)";
      art.classList.toggle("has-art", Boolean(track && track.artwork));
      art.classList.toggle("playing", playing);
    }
    const glyph = $("albumGlyph");
    if (glyph) glyph.style.display = track && track.artwork ? "none" : "block";

    const toggle = $("toggleMusic");
    if (toggle) {
      toggle.textContent = playing ? "Ⅱ" : "▶";
      toggle.setAttribute("aria-label", playing ? "Pause music" : "Play music");
    }

    if (embedPlaying) {
      if ($("musicCurrent")) $("musicCurrent").textContent = "YouTube";
      if ($("musicDuration")) $("musicDuration").textContent = "Live";
      if ($("musicSeek")) $("musicSeek").value = 0;
    } else if (audio.src && Number.isFinite(audio.duration) && audio.duration > 0) {
      if ($("musicCurrent")) $("musicCurrent").textContent = timeLabel(audio.currentTime);
      if ($("musicDuration")) $("musicDuration").textContent = timeLabel(audio.duration);
      if ($("musicSeek")) $("musicSeek").value = (audio.currentTime / audio.duration) * 100;
    }

    updateMiniPlayer();
    renderPlaylist();
  }

  function playEmbed(track) {
    stopAudio();
    embedPlaying = true;
    embedPaused = false;
    if (embed && track.youtubeId) {
      embed.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(track.youtubeId) + "?autoplay=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
      embed.classList.add("show");
    }
    updateMusicUI();
    toast("Playing “" + (track.title || "video") + "”");
  }

  function playAudioStream(track) {
    stopEmbed();
    if (!track.url) return;
    audio.src = track.url;
    audio.play().catch(() => toast("Could not play audio track."));
    updateMusicUI();
    toast("Playing “" + (track.title || "track") + "”");
  }

  function playTrack(index) {
    if (!tracks.length) {
      toast("Search or select a track first.");
      return;
    }
    trackIndex = (index + tracks.length) % tracks.length;
    const track = tracks[trackIndex];
    if (track.kind === "youtube" || track.youtubeId) {
      playEmbed(track);
    } else if (track.url) {
      playAudioStream(track);
    }
    updateMusicUI();
  }

  function togglePlayback() {
    const track = tracks[trackIndex];
    if (trackIndex < 0 && tracks.length) {
      playTrack(0);
      return;
    }
    if (!track) {
      toast("Select a track from search or presets first.");
      return;
    }

    if (embedPlaying) {
      const command = embedPaused ? "playVideo" : "pauseVideo";
      embed?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
      embedPaused = !embedPaused;
      updateMusicUI();
      return;
    }

    if (audio.src) {
      if (audio.paused) audio.play().catch(() => toast("Could not play track."));
      else audio.pause();
      updateMusicUI();
    } else if (track.youtubeId) {
      playEmbed(track);
    }
  }

  function nextMusicTrack(direction = 1) {
    if (!tracks.length) return;
    const next = (Math.max(trackIndex, 0) + direction + tracks.length) % tracks.length;
    playTrack(next);
  }

  // Public catalog helpers (iTunes / Audius) when no YouTube API key is saved
  async function searchFreeCatalogs(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    try {
      const res = await fetch("https://itunes.apple.com/search?media=music&entity=song&limit=8&term=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("itunes error");
      const data = await res.json();
      return (data.results || []).filter(item => item.previewUrl).map(item => ({
        title: item.trackName,
        artist: item.artistName,
        url: item.previewUrl,
        artwork: (item.artworkUrl100 || "").replace("100x100bb", "300x300bb").replace("100x100", "300x300"),
        kind: "audio",
        source: "Audio preview",
        preview: true
      }));
    } catch (_) {
      return [];
    }
  }

  // ==========================================================================
  // Initialization & Event Listeners
  // ==========================================================================
  function init() {
    loadSettings();
    populateInputs();
    if ($("backgroundType")) $("backgroundType").value = settings.backgroundType || "default";
    showBackgroundFields();
    applyAppearance();
    loadCustomFont();
    applyBackground();

    if (settings.backgroundType === "url" && settings.backgroundUrl) {
      if ($("backgroundUrl")) $("backgroundUrl").value = settings.backgroundUrl;
      const p = settings.backgroundUrl.toLowerCase();
      if (/\.(mp4|webm|ogg|mov)(\?.*)?$/.test(p)) {
        if ($("background")) $("background").style.display = "none";
        const v = $("backgroundVideo");
        if (v) {
          v.src = settings.backgroundUrl;
          v.style.display = "block";
          v.play().catch(() => {});
        }
      } else if ($("background")) {
        $("background").style.background = `url("${settings.backgroundUrl.replace(/["\\]/g, "")}") center / cover no-repeat`;
      }
    }
    if (settings.websiteUrl && $("websiteUrl")) $("websiteUrl").value = settings.websiteUrl;

    duration = durationFor(mode);
    remaining = duration;
    updateUI();

    // Wire Timer Controls
    $("startBtn")?.addEventListener("click", startTimer);
    $("timer")?.addEventListener("click", startTimer);
    $("timer")?.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startTimer(); } });
    $("resetBtn")?.addEventListener("click", resetTimer);
    $("skipBtn")?.addEventListener("click", skipSession);
    $("settingsBtn")?.addEventListener("click", openSettings);
    $("closeSettings")?.addEventListener("click", closeSettings);
    $("settingsBackdrop")?.addEventListener("click", closeSettings);

    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", e => {
      const target = e.target;
      const typing = target && (target.matches("input,textarea,select") || target.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key === "Escape") {
          if ($("settingsPanel")?.classList.contains("open")) closeSettings();
          else if ($("musicPanel")?.classList.contains("open")) musicPanel(false);
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (e.code === "Space" || key === SHORTCUTS.toggle) {
        e.preventDefault();
        startTimer();
      } else if (key === SHORTCUTS.reset) {
        resetTimer();
      } else if (key === SHORTCUTS.fullscreen) {
        toggleFullscreen();
      } else if (key === SHORTCUTS.settings) {
        $("settingsPanel")?.classList.contains("open") ? closeSettings() : openSettings();
      } else if (key === SHORTCUTS.next) {
        skipSession();
      } else if (key === SHORTCUTS.music) {
        musicPanel();
      } else if (key === SHORTCUTS.focus) {
        setMode("focus");
      } else if (key === SHORTCUTS.short) {
        setMode("short");
      } else if (key === SHORTCUTS.long) {
        setMode("long");
      } else if (key === "escape") {
        if ($("settingsPanel")?.classList.contains("open")) closeSettings();
        else if ($("musicPanel")?.classList.contains("open")) musicPanel(false);
      }
    });

    // Durations
    for (const id of ["focusMinutes", "shortMinutes", "longMinutes", "longEvery"]) {
      $(id)?.addEventListener("change", () => {
        const max = id === "focusMinutes" ? 180 : id === "longEvery" ? 12 : 90;
        const min = id === "longEvery" ? 2 : 1;
        settings[id] = safeNumber($(id).value, min, max, defaults[id]);
        $(id).value = settings[id];
        saveSettings();
        if (id !== "longEvery") setTimerDurationIfIdle();
      });
    }

    // Appearance inputs
    for (const id of ["accentColor", "textColor", "fontChoice", "fontSize"]) {
      $(id)?.addEventListener("input", () => setSetting(id, $(id).value));
    }
    $("overlayRange")?.addEventListener("input", () => {
      settings.overlay = Number($("overlayRange").value);
      updateRangeLabels();
      applyAppearance();
      saveSettings();
    });
    $("blurRange")?.addEventListener("input", () => {
      settings.blur = Number($("blurRange").value);
      updateRangeLabels();
      applyAppearance();
      saveSettings();
    });
    $("solidColor")?.addEventListener("input", () => {
      settings.solidColor = $("solidColor").value;
      if ($("backgroundType")?.value === "solid") applyBackground();
      saveSettings();
    });
    for (const id of ["gradientOne", "gradientTwo", "gradientAngle"]) {
      $(id)?.addEventListener("input", () => {
        settings[id] = id === "gradientAngle" ? Number($(id).value) : $(id).value;
        updateRangeLabels();
        if ($("backgroundType")?.value === "gradient") applyBackground();
        saveSettings();
      });
    }
    $("applyFont")?.addEventListener("click", () => {
      settings.googleFont = $("googleFont")?.value.trim() || "";
      settings.fontUrl = $("fontUrl")?.value.trim() || "";
      if (!settings.googleFont && !settings.fontUrl) {
        toast("Enter a Google Font name or font URL.");
        return;
      }
      loadCustomFont();
      saveSettings();
      toast("Custom font applied");
    });

    // Preset Backgrounds
    $("gradientPresets")?.addEventListener("click", e => {
      const button = e.target.closest("[data-gradient]");
      if (!button) return;
      const parts = button.dataset.gradient.split("|");
      settings.gradientOne = parts[0];
      settings.gradientTwo = parts[1];
      settings.gradientAngle = Number(parts[2]) || 135;
      settings.backgroundType = "gradient";
      if ($("gradientOne")) $("gradientOne").value = settings.gradientOne;
      if ($("gradientTwo")) $("gradientTwo").value = settings.gradientTwo;
      if ($("gradientAngle")) $("gradientAngle").value = settings.gradientAngle;
      if ($("backgroundType")) $("backgroundType").value = "gradient";
      showBackgroundFields();
      updateRangeLabels();
      applyBackground();
      saveSettings();
      toast(`${button.textContent.trim()} gradient applied`);
    });

    $("imagePresets")?.addEventListener("click", e => {
      const button = e.target.closest("[data-image]");
      if (!button) return;
      clearMedia();
      settings.backgroundType = "url";
      settings.backgroundUrl = button.dataset.image;
      if ($("backgroundType")) $("backgroundType").value = "url";
      if ($("backgroundUrl")) $("backgroundUrl").value = settings.backgroundUrl;
      showBackgroundFields();
      const bg = $("background");
      if (bg) {
        bg.style.display = "block";
        bg.style.background = `url("${settings.backgroundUrl}") center / cover no-repeat`;
      }
      saveSettings();
      toast(`${button.textContent.trim()} background applied`);
    });

    $("useVideoPreset")?.addEventListener("click", () => {
      clearMedia();
      settings.backgroundType = "url";
      settings.backgroundUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
      if ($("backgroundType")) $("backgroundType").value = "url";
      if ($("backgroundUrl")) $("backgroundUrl").value = settings.backgroundUrl;
      showBackgroundFields();
      if ($("background")) $("background").style.display = "none";
      const v = $("backgroundVideo");
      if (v) {
        v.src = settings.backgroundUrl;
        v.style.display = "block";
        v.play().catch(() => toast("Check connection or browser autoplay permissions."));
      }
      saveSettings();
      toast("Ambient video loaded");
    });

    $("stopVideoPreset")?.addEventListener("click", () => {
      clearMedia();
      settings.backgroundType = "default";
      if ($("backgroundType")) $("backgroundType").value = "default";
      showBackgroundFields();
      applyBackground();
      saveSettings();
      toast("Video stopped");
    });

    $("backgroundType")?.addEventListener("change", () => {
      settings.backgroundType = $("backgroundType").value;
      showBackgroundFields();
      if (["default", "solid", "gradient"].includes(settings.backgroundType)) applyBackground();
      saveSettings();
    });

    $("backgroundFile")?.addEventListener("change", () => {
      const file = $("backgroundFile").files?.[0];
      if (!file) return;
      settings.backgroundType = file.type.startsWith("video/") ? "video" : "image";
      if ($("backgroundType")) $("backgroundType").value = settings.backgroundType;
      showBackgroundFields();
      applyLocalFile(file, settings.backgroundType);
      saveSettings();
    });

    $("applyUrl")?.addEventListener("click", () => {
      const url = $("backgroundUrl")?.value.trim();
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
        clearMedia();
        const bg = $("background");
        if (bg) bg.style.display = "block";
        const path = parsed.pathname.toLowerCase();
        if (/\.(mp4|webm|ogg|mov)$/.test(path)) {
          if (bg) bg.style.display = "none";
          const v = $("backgroundVideo");
          if (v) {
            v.src = parsed.href;
            v.style.display = "block";
            v.play().catch(() => {});
          }
        } else if (bg) {
          bg.style.background = `url("${parsed.href.replace(/["\\]/g, "")}") center / cover no-repeat`;
        }
        settings.backgroundUrl = parsed.href;
        settings.backgroundType = "url";
        saveSettings();
        toast("Background URL applied");
      } catch (_) {
        toast("Enter a valid http or https URL.");
      }
    });

    $("applyWebsite")?.addEventListener("click", () => {
      const url = $("websiteUrl")?.value.trim();
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
        clearMedia();
        if ($("background")) $("background").style.display = "none";
        const f = $("backgroundFrame");
        if (f) {
          f.src = parsed.href;
          f.style.display = "block";
        }
        settings.websiteUrl = parsed.href;
        settings.backgroundType = "website";
        saveSettings();
        toast("Website requested — embedding depends on host headers");
      } catch (_) {
        toast("Enter a valid http or https URL.");
      }
    });

    $("clearBackground")?.addEventListener("click", () => {
      clearMedia();
      if ($("backgroundFile")) $("backgroundFile").value = "";
      if ($("backgroundUrl")) $("backgroundUrl").value = "";
      if ($("websiteUrl")) $("websiteUrl").value = "";
      settings.backgroundType = "default";
      if ($("backgroundType")) $("backgroundType").value = "default";
      showBackgroundFields();
      applyBackground();
      saveSettings();
      toast("Background reset to default");
    });

    $("task")?.addEventListener("input", () => {
      settings.task = $("task").value;
      saveSettings();
    });

    $("autoStart")?.addEventListener("change", () => {
      settings.autoStart = $("autoStart").value;
      saveSettings();
    });

    $("soundMode")?.addEventListener("change", () => {
      settings.soundMode = $("soundMode").value;
      saveSettings();
    });

    $("notifyMode")?.addEventListener("change", async () => {
      settings.notifyMode = $("notifyMode").value;
      if (settings.notifyMode === "on" && "Notification" in window && Notification.permission === "default") {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") toast("Notifications were not enabled.");
        } catch (_) {}
      }
      if (!("Notification" in window) && settings.notifyMode === "on") {
        toast("Notifications are not supported in this browser.");
      }
      saveSettings();
    });

    $("resetSettings")?.addEventListener("click", () => {
      if (!confirm("Reset all focus.flow preferences to defaults?")) return;
      settings = { ...defaults };
      mode = "focus";
      stopTicker();
      running = false;
      if ($("backgroundFile")) $("backgroundFile").value = "";
      if ($("backgroundUrl")) $("backgroundUrl").value = "";
      if ($("websiteUrl")) $("websiteUrl").value = "";
      populateInputs();
      if ($("backgroundType")) $("backgroundType").value = "default";
      showBackgroundFields();
      applyBackground();
      duration = durationFor(mode);
      remaining = duration;
      updateUI();
      saveSettings();
      toast("Settings restored to default");
    });

    $("exportSettings")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "focus-flow-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $("importSettingsBtn")?.addEventListener("click", () => $("importSettingsFile")?.click());
    $("importSettingsFile")?.addEventListener("change", async () => {
      const file = $("importSettingsFile").files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
        settings = { ...defaults, ...data };
        settings.focusMinutes = safeNumber(settings.focusMinutes, 1, 180, 25);
        settings.shortMinutes = safeNumber(settings.shortMinutes, 1, 60, 5);
        settings.longMinutes = safeNumber(settings.longMinutes, 1, 90, 15);
        settings.longEvery = safeNumber(settings.longEvery, 2, 12, 4);
        populateInputs();
        if ($("backgroundType")) {
          $("backgroundType").value = ["default", "solid", "gradient", "image", "video", "url", "website"].includes(settings.backgroundType)
            ? settings.backgroundType
            : "default";
        }
        showBackgroundFields();
        applyAppearance();
        applyBackground();
        setTimerDurationIfIdle();
        saveSettings();
        toast("Settings imported successfully");
      } catch (_) {
        toast("That settings file is not valid JSON.");
      }
      $("importSettingsFile").value = "";
    });

    // Music Player Event Handlers
    $("musicBtn")?.addEventListener("click", () => musicPanel());
    $("closeMusic")?.addEventListener("click", () => musicPanel(false));
    $("miniPlay")?.addEventListener("click", ev => {
      ev.stopPropagation();
      togglePlayback();
    });
    $("musicMini")?.addEventListener("click", () => musicPanel(true));
    $("toggleMusic")?.addEventListener("click", togglePlayback);
    $("prevTrack")?.addEventListener("click", () => nextMusicTrack(-1));
    $("nextTrack")?.addEventListener("click", () => nextMusicTrack(1));

    $("musicVolume")?.addEventListener("input", () => {
      const vol = Number($("musicVolume").value);
      audio.volume = vol;
      const ytVol = Math.round(vol * 100);
      if (embedPlaying) {
        embed?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [ytVol] }), "*");
      }
      persistMusic();
    });

    $("musicSeek")?.addEventListener("input", () => {
      if (embedPlaying) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = (Number($("musicSeek").value) / 100) * audio.duration;
      }
    });

    // YouTube API Key management
    const apiKeyInput = $("youtubeApiKey");
    const savedApiKey = localStorage.getItem(YOUTUBE_KEY_STORAGE) || "";
    if (apiKeyInput) apiKeyInput.value = savedApiKey;

    $("saveApiKey")?.addEventListener("click", () => {
      const key = apiKeyInput?.value.trim() || "";
      if (!key) {
        localStorage.removeItem(YOUTUBE_KEY_STORAGE);
        toast("Saved API key removed from this browser.");
        return;
      }
      localStorage.setItem(YOUTUBE_KEY_STORAGE, key);
      toast("YouTube API key saved in browser storage.");
    });

    // Curated Focus Station Chips
    $("focusStations")?.addEventListener("click", e => {
      const chip = e.target.closest(".station-chip");
      if (!chip) return;
      const track = {
        title: chip.dataset.title || chip.textContent.trim(),
        artist: chip.dataset.artist || "YouTube Live",
        youtubeId: chip.dataset.id,
        url: "https://www.youtube.com/watch?v=" + chip.dataset.id,
        kind: "youtube",
        source: "Curated Station",
        artwork: `https://i.ytimg.com/vi/${chip.dataset.id}/hqdefault.jpg`
      };
      playSearchResult(track);
    });

    // Music Search Action
    async function performSearch() {
      const query = $("musicSearch")?.value.trim();
      if (!query) {
        toast("Type a song title, artist, or YouTube URL.");
        return;
      }

      // 1. Direct YouTube link or Video ID check!
      const directId = youtubeIdFromUrl(query);
      if (directId) {
        const directTrack = {
          title: `YouTube Video (${directId})`,
          artist: "YouTube",
          url: "https://www.youtube.com/watch?v=" + directId,
          youtubeId: directId,
          kind: "youtube",
          source: "Direct YouTube Link",
          artwork: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`
        };
        // Render in search results for user to click or auto-play
        renderSearchResults([directTrack]);
        toast("YouTube link detected. Tap result to play.");
        return;
      }

      // 2. Live YouTube Data API v3 search
      const apiKey = (localStorage.getItem(YOUTUBE_KEY_STORAGE) || "").trim();
      if (apiKey) {
        toast("Searching YouTube…");
        if ($("searchMusic")) $("searchMusic").disabled = true;
        try {
          const params = new URLSearchParams({
            part: "snippet",
            type: "video",
            videoEmbeddable: "true",
            maxResults: "10",
            q: query,
            key: apiKey
          });
          const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.error?.message || "YouTube search failed. Check key restrictions.");
          }
          const results = (data.items || []).filter(item => item.id?.videoId).map(item => ({
            title: item.snippet?.title || "Untitled video",
            artist: item.snippet?.channelTitle || "YouTube",
            url: "https://www.youtube.com/watch?v=" + item.id.videoId,
            youtubeId: item.id.videoId,
            kind: "youtube",
            source: "YouTube",
            artwork: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ""
          }));
          renderSearchResults(results);
          toast(results.length ? `${results.length} YouTube results found` : "No YouTube results found.");
        } catch (error) {
          toast(error.message || "YouTube search error. Trying catalog search…");
          const fallback = await searchFreeCatalogs(query);
          renderSearchResults(fallback);
        } finally {
          if ($("searchMusic")) $("searchMusic").disabled = false;
        }
        return;
      }

      // 3. If no YouTube API key configured, search preview catalog & prompt user
      toast("Searching music catalog…");
      if ($("searchMusic")) $("searchMusic").disabled = true;
      try {
        const results = await searchFreeCatalogs(query);
        renderSearchResults(results);
        if (results.length) {
          toast(`Found ${results.length} playable previews. (Add YouTube key for full YouTube search)`);
        } else {
          toast("No results found. Paste a direct YouTube link or save a YouTube API key.");
          document.querySelector(".api-key-settings")?.setAttribute("open", "");
        }
      } catch (err) {
        renderSearchResults([]);
        toast("Search error. Check your connection.");
      } finally {
        if ($("searchMusic")) $("searchMusic").disabled = false;
      }
    }

    $("searchMusic")?.addEventListener("click", performSearch);
    $("musicSearch")?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch();
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (!embedPlaying) updateMusicUI();
    });
    audio.addEventListener("loadedmetadata", updateMusicUI);
    audio.addEventListener("play", updateMusicUI);
    audio.addEventListener("pause", updateMusicUI);
    audio.addEventListener("ended", () => {
      nextMusicTrack(1);
    });

    restoreMusic();
    updateMusicUI();

    // Browser tab visibility handling
    document.addEventListener("visibilitychange", () => {
      if (running) tick();
    });

    // Fade out loading screen smoothly
    const loader = $("loader");
    if (loader) {
      setTimeout(() => {
        loader.classList.add("loaded");
        setTimeout(() => loader.remove(), 600);
      }, 450);
    }
  }

  // Safety fallback for loader in case of any network delay
  setTimeout(() => {
    const loader = $("loader");
    if (loader && !loader.classList.contains("loaded")) {
      loader.classList.add("loaded");
      setTimeout(() => loader.remove(), 600);
    }
  }, 1600);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
