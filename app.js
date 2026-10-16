(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "focus-flow-settings-v1";
  // Change these values to customize the keyboard shortcuts.
  const SHORTCUTS = { toggle: " ", reset: "r", fullscreen: "f", settings: "s", next: "n", focus: "1", short: "2", long: "3" };
  const defaults = {
    focusMinutes:25, shortMinutes:5, longMinutes:15, longEvery:4,
    accentColor:"#d7ff64", textColor:"#f7f7f7", fontChoice:"system", fontSize:"standard",
    overlay:25, blur:0, backgroundType:"default", solidColor:"#10131d",
    gradientOne:"#10131d", gradientTwo:"#31234a", gradientAngle:135,
    autoStart:"off", soundMode:"on", notifyMode:"off", task:"",
    googleFont:"", fontUrl:"", backgroundUrl:"", websiteUrl:""
  };
  let settings = {...defaults};
  let mode = "focus", remaining = 25 * 60, duration = 25 * 60;
  let running = false, endAt = 0, ticker = null, completedFocus = 0, sessionsCompleted = 0;
  let toastTimeout = null, currentObjectUrl = null, toastQueue = null;

  const modeInfo = {
    focus: {label:"TIME TO FOCUS", button:"START FOCUS"},
    short: {label:"TAKE A BREATHER", button:"START BREAK"},
    long: {label:"RESET & RECHARGE", button:"START LONG BREAK"}
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
    return String(Math.floor(seconds / 60)).padStart(2,"0") + ":" + String(seconds % 60).padStart(2,"0");
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $("toast").classList.remove("show"), 2400);
  }
  function saveSettings() {
    try {
      const persisted = {...settings};
      // Uploaded files are object URLs and cannot be restored after reload.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch (e) { toast("Could not save settings in this browser."); }
  }
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") settings = {...defaults, ...saved};
    } catch (_) { settings = {...defaults}; }
    settings.focusMinutes = safeNumber(settings.focusMinutes,1,180,25);
    settings.shortMinutes = safeNumber(settings.shortMinutes,1,60,5);
    settings.longMinutes = safeNumber(settings.longMinutes,1,90,15);
    settings.longEvery = safeNumber(settings.longEvery,2,12,4);
  }
  function populateInputs() {
    for (const id of ["focusMinutes","shortMinutes","longMinutes","longEvery","accentColor","textColor","fontChoice","fontSize","googleFont","fontUrl","solidColor","gradientOne","gradientTwo","gradientAngle","autoStart","soundMode","notifyMode"]) {
      if ($(id) && settings[id] !== undefined) $(id).value = settings[id];
    }
    $("overlayRange").value = settings.overlay;
    $("blurRange").value = settings.blur;
    $("task").value = settings.task || "";
    updateRangeLabels();
  }
  function applyAppearance() {
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--text", settings.textColor);
    document.documentElement.style.setProperty("--overlay", Number(settings.overlay)/100);
    document.documentElement.style.setProperty("--bg-blur", Number(settings.blur)+"px");
    const fonts = {
      system:'Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      serif:'Georgia,"Times New Roman",serif',
      mono:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      rounded:'"Trebuchet MS",ui-rounded,system-ui,sans-serif'
    };
    const timerSizes = {compact:"clamp(76px,16vw,170px)",standard:"clamp(88px,20vw,220px)",large:"clamp(100px,23vw,250px)"};
    $("timer").style.fontSize = timerSizes[settings.fontSize] || timerSizes.standard;
    document.body.style.fontFamily = settings.customFontFamily ? `"${settings.customFontFamily.replace(/["\\]/g,"")}", ${fonts.system}` : (fonts[settings.fontChoice] || fonts.system);
  }
  function loadCustomFont() {
    const fontUrl = (settings.fontUrl || "").trim();
    const fontName = (settings.googleFont || "").trim();
    if (fontUrl) {
      let link = document.getElementById("customFontLink");
      if (!link) { link = document.createElement("link"); link.id = "customFontLink"; link.rel = "stylesheet"; document.head.appendChild(link); }
      // Google Fonts CSS URLs are stylesheets; direct font URLs are registered with @font-face.
      if (/\\.(woff2?|ttf|otf)(\\?.*)?$/i.test(fontUrl)) {
        let style = document.getElementById("customFontFace");
        if (!style) { style = document.createElement("style"); style.id = "customFontFace"; document.head.appendChild(style); }
        style.textContent = `@font-face{font-family:"FocusCustom";src:url("${fontUrl.replace(/["\\]/g,"")}") format("woff2");font-display:swap}`;
        link.remove();
        settings.customFontFamily = "FocusCustom";
      } else {
        link.href = fontUrl;
        settings.customFontFamily = fontName || "";
      }
    } else if (fontName) {
      let link = document.getElementById("customFontLink");
      if (!link) { link = document.createElement("link"); link.id = "customFontLink"; link.rel = "stylesheet"; document.head.appendChild(link); }
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fontName.trim()).replace(/%20/g,"+") + ":wght@400;500;600;700&display=swap";
      settings.customFontFamily = fontName;
    } else {
      document.getElementById("customFontLink")?.remove();
      document.getElementById("customFontFace")?.remove();
      settings.customFontFamily = "";
    }
    applyAppearance();
  }
  function updateRangeLabels() {
    $("overlayValue").textContent = settings.overlay + "%";
    $("blurValue").textContent = settings.blur + "px";
    $("angleValue").textContent = settings.gradientAngle + "°";
  }
  function showBackgroundFields() {
    const type = $("backgroundType").value;
    for (const id of ["solidFields","gradientFields","fileFields","urlFields","websiteFields"]) $(id).classList.add("hidden");
    if (type === "solid") $("solidFields").classList.remove("hidden");
    if (type === "gradient") $("gradientFields").classList.remove("hidden");
    if (type === "image" || type === "video") $("fileFields").classList.remove("hidden");
    if (type === "url") $("urlFields").classList.remove("hidden");
    if (type === "website") $("websiteFields").classList.remove("hidden");
  }
  function clearMedia() {
    $("backgroundVideo").pause();
    $("backgroundVideo").removeAttribute("src");
    $("backgroundVideo").load();
    $("backgroundVideo").style.display = "none";
    $("backgroundFrame").removeAttribute("src");
    $("backgroundFrame").style.display = "none";
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
  }
  function applyBackground() {
    clearMedia();
    const bg = $("background");
    bg.style.display = "block";
    const type = settings.backgroundType;
    if (type === "solid") bg.style.background = settings.solidColor;
    else if (type === "gradient") bg.style.background = `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientOne}, ${settings.gradientTwo})`;
    else if (type === "default") bg.style.background = "linear-gradient(135deg,#10131d,#050608 65%,#1b1730)";
    else if (type === "image" || type === "video") {
      const file = $("backgroundFile").files[0];
      if (file) applyLocalFile(file, type);
      else bg.style.background = "linear-gradient(135deg,#10131d,#050608 65%,#1b1730)";
    }
    applyAppearance();
  }
  function applyLocalFile(file, preferredType) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { toast("Choose a supported image or video file."); return; }
    clearMedia();
    currentObjectUrl = URL.createObjectURL(file);
    $("background").style.display = "block";
    if (file.type.startsWith("video/") || preferredType === "video") {
      $("background").style.display = "none";
      const video = $("backgroundVideo");
      video.src = currentObjectUrl;
      video.style.display = "block";
      video.play().catch(() => {});
    } else {
      $("background").style.background = `url("${currentObjectUrl}") center / cover no-repeat`;
    }
  }
  function setMode(nextMode, reset=true) {
    if (!modeInfo[nextMode]) return;
    stopTicker();
    mode = nextMode;
    if (reset) { duration = durationFor(mode); remaining = duration; }
    running = false;
    updateUI();
    saveSettings();
  }
  function updateUI() {
    $("timer").textContent = fmt(remaining);
    $("modeLabel").textContent = modeInfo[mode].label;
    $("startBtn").textContent = running ? "PAUSE" : modeInfo[mode].button;
    $("progressBar").style.width = (duration > 0 ? Math.max(0,Math.min(100,remaining/duration*100)) : 0) + "%";
    $("sessionCount").textContent = "SESSION " + String(completedFocus + 1).padStart(2,"0");
    $("totalCount").textContent = sessionsCompleted + (sessionsCompleted === 1 ? " completed" : " completed");
    document.title = `${fmt(remaining)} — ${mode === "focus" ? "Focus" : "Break"}`;
    document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
    $("timer").setAttribute("aria-label", `${fmt(remaining)}. ${running ? "Pause" : "Start"} timer`);
  }
  function startTimer() {
    if (running) { pauseTimer(); return; }
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
  function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }
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
    toast(mode === "focus" ? "Focus session complete. Take a break." : "Break complete. Ready when you are.");
    if (settings.autoStart === "on") {
      nextSession();
      startTimer();
    }
  }
  function nextSession() {
    if (mode === "focus") {
      const every = safeNumber(settings.longEvery,2,12,4);
      setMode(completedFocus > 0 && completedFocus % every === 0 ? "long" : "short");
    } else setMode("focus");
  }
  function resetTimer() {
    stopTicker(); running = false; duration = durationFor(mode); remaining = duration; updateUI(); toast("Timer reset");
  }
  function skipSession() { nextSession(); toast("Switched to " + (mode === "focus" ? "focus" : "break")); }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen?.();
      if (p && p.catch) p.catch(() => toast("Fullscreen is unavailable in this browser."));
    } else document.exitFullscreen?.().catch?.(() => {});
  }
  function openSettings() {
    $("settingsPanel").classList.add("open");
    $("settingsBackdrop").classList.add("open");
    $("settingsPanel").setAttribute("aria-hidden","false");
    $("closeSettings").focus();
  }
  function closeSettings() {
    $("settingsPanel").classList.remove("open");
    $("settingsBackdrop").classList.remove("open");
    $("settingsPanel").setAttribute("aria-hidden","true");
    $("settingsBtn").focus();
  }
  function playCompletion() {
    if (settings.soundMode !== "on") return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      [660,880,660].forEach((freq,i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i*.18);
        gain.gain.exponentialRampToValueAtTime(.12, ctx.currentTime + i*.18 + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + i*.18 + .15);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i*.18); osc.stop(ctx.currentTime + i*.18 + .16);
      });
      setTimeout(() => ctx.close(), 1000);
    } catch (_) {}
  }
  function notifyCompletion() {
    if (settings.notifyMode !== "on") return;
    if (!("Notification" in window)) { toast("Notifications are not supported here."); return; }
    if (Notification.permission === "granted") new Notification("Focus timer", {body: mode === "focus" ? "Focus session complete. Time for a break." : "Break complete. Ready to focus?"});
  }
  function setTimerDurationIfIdle() {
    if (!running) { duration = durationFor(mode); remaining = duration; updateUI(); }
  }
  function setSetting(id, value, apply=true) {
    settings[id] = value;
    if (apply) { applyAppearance(); saveSettings(); }
  }

  loadSettings();
  populateInputs();
  $("backgroundType").value = settings.backgroundType || "default";
  showBackgroundFields();
  applyAppearance();
  loadCustomFont();
  applyBackground();
  if (settings.backgroundType === "url" && settings.backgroundUrl) {
    $("backgroundUrl").value = settings.backgroundUrl;
    const p = settings.backgroundUrl.toLowerCase();
    if (/\\.(mp4|webm|ogg|mov)(\\?.*)?$/.test(p)) {
      $("background").style.display = "none"; $("backgroundVideo").src = settings.backgroundUrl; $("backgroundVideo").style.display = "block"; $("backgroundVideo").play().catch(() => {});
    } else { $("background").style.background = `url("${settings.backgroundUrl.replace(/["\\]/g,"")}") center / cover no-repeat`; }
  }
  if (settings.websiteUrl) $("websiteUrl").value = settings.websiteUrl;
  duration = durationFor(mode); remaining = duration; updateUI();

  $("startBtn").addEventListener("click", startTimer);
  $("timer").addEventListener("click", startTimer);
  $("timer").addEventListener("keydown", e => { if (e.key === "Enter") startTimer(); });
  $("resetBtn").addEventListener("click", resetTimer);
  $("skipBtn").addEventListener("click", skipSession);
  $("settingsBtn").addEventListener("click", openSettings);
  $("closeSettings").addEventListener("click", closeSettings);
  $("settingsBackdrop").addEventListener("click", closeSettings);
  document.querySelectorAll(".mode-btn").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));

  document.addEventListener("keydown", e => {
    const target = e.target;
    const typing = target && (target.matches("input,textarea,select") || target.isContentEditable);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key === "Escape") {
        if ($("settingsPanel").classList.contains("open")) closeSettings();
        else if ($("musicPanel").classList.contains("open")) musicPanel(false);
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (e.code === "Space" || key === SHORTCUTS.toggle) { e.preventDefault(); startTimer(); }
    else if (key === SHORTCUTS.reset) resetTimer();
    else if (key === SHORTCUTS.fullscreen) toggleFullscreen();
    else if (key === SHORTCUTS.settings) $("settingsPanel").classList.contains("open") ? closeSettings() : openSettings();
    else if (key === SHORTCUTS.next) skipSession();
    else if (key === SHORTCUTS.focus) setMode("focus");
    else if (key === SHORTCUTS.short) setMode("short");
    else if (key === SHORTCUTS.long) setMode("long");
    else if (key === "m") musicPanel();
    else if (key === "escape") {
      if ($("settingsPanel").classList.contains("open")) closeSettings();
      else if ($("musicPanel").classList.contains("open")) musicPanel(false);
    }
  });

  for (const id of ["focusMinutes","shortMinutes","longMinutes","longEvery"]) {
    $(id).addEventListener("change", () => {
      const max = id === "focusMinutes" ? 180 : id === "longEvery" ? 12 : 90;
      const min = id === "longEvery" ? 2 : 1;
      settings[id] = safeNumber($(id).value,min,max,defaults[id]);
      $(id).value = settings[id];
      saveSettings();
      if (id !== "longEvery") setTimerDurationIfIdle();
    });
  }
  for (const id of ["accentColor","textColor","fontChoice","fontSize"]) {
    $(id).addEventListener("input", () => { setSetting(id,$(id).value); });
  }
  $("overlayRange").addEventListener("input", () => {
    settings.overlay = Number($("overlayRange").value); updateRangeLabels(); applyAppearance(); saveSettings();
  });
  $("blurRange").addEventListener("input", () => {
    settings.blur = Number($("blurRange").value); updateRangeLabels(); applyAppearance(); saveSettings();
  });
  $("solidColor").addEventListener("input", () => { settings.solidColor = $("solidColor").value; if ($("backgroundType").value === "solid") applyBackground(); saveSettings(); });
  for (const id of ["gradientOne","gradientTwo","gradientAngle"]) {
    $(id).addEventListener("input", () => {
      settings[id] = id === "gradientAngle" ? Number($(id).value) : $(id).value;
      updateRangeLabels();
      if ($("backgroundType").value === "gradient") applyBackground();
      saveSettings();
    });
  }
  $("applyFont").addEventListener("click", () => {
    settings.googleFont = $("googleFont").value.trim();
    settings.fontUrl = $("fontUrl").value.trim();
    if (!settings.googleFont && !settings.fontUrl) { toast("Enter a Google Font name or font URL."); return; }
    loadCustomFont(); saveSettings(); toast("Custom font applied");
  });
  $("gradientPresets").addEventListener("click", e => {
    const button = e.target.closest("[data-gradient]");
    if (!button) return;
    const parts = button.dataset.gradient.split("|");
    settings.gradientOne = parts[0]; settings.gradientTwo = parts[1]; settings.gradientAngle = Number(parts[2]) || 135;
    settings.backgroundType = "gradient";
    $("gradientOne").value = settings.gradientOne; $("gradientTwo").value = settings.gradientTwo; $("gradientAngle").value = settings.gradientAngle;
    $("backgroundType").value = "gradient"; showBackgroundFields(); updateRangeLabels(); applyBackground(); saveSettings(); toast(button.textContent + " gradient applied");
  });
  $("imagePresets").addEventListener("click", e => {
    const button = e.target.closest("[data-image]");
    if (!button) return;
    clearMedia(); settings.backgroundType = "url"; settings.backgroundUrl = button.dataset.image;
    $("backgroundType").value = "url"; $("backgroundUrl").value = settings.backgroundUrl; showBackgroundFields();
    $("background").style.display = "block"; $("background").style.background = `url("${settings.backgroundUrl}") center / cover no-repeat`;
    saveSettings(); toast(button.textContent + " background applied");
  });
  $("useVideoPreset").addEventListener("click", () => {
    clearMedia(); settings.backgroundType = "url"; settings.backgroundUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
    $("backgroundType").value = "url"; $("backgroundUrl").value = settings.backgroundUrl; showBackgroundFields();
    $("background").style.display = "none"; $("backgroundVideo").src = settings.backgroundUrl; $("backgroundVideo").style.display = "block";
    $("backgroundVideo").play().catch(() => toast("Press play or check your connection to load the video."));
    saveSettings(); toast("Ambient video loaded");
  });
  $("stopVideoPreset").addEventListener("click", () => { clearMedia(); settings.backgroundType = "default"; $("backgroundType").value = "default"; showBackgroundFields(); applyBackground(); saveSettings(); toast("Video stopped"); });

  $("backgroundType").addEventListener("change", () => {
    settings.backgroundType = $("backgroundType").value;
    showBackgroundFields();
    if (["default","solid","gradient"].includes(settings.backgroundType)) applyBackground();
    saveSettings();
  });
  $("backgroundFile").addEventListener("change", () => {
    const file = $("backgroundFile").files[0];
    if (!file) return;
    settings.backgroundType = file.type.startsWith("video/") ? "video" : "image";
    $("backgroundType").value = settings.backgroundType;
    showBackgroundFields();
    applyLocalFile(file, settings.backgroundType);
    saveSettings();
  });
  $("applyUrl").addEventListener("click", () => {
    const url = $("backgroundUrl").value.trim();
    try {
      const parsed = new URL(url);
      if (!["http:","https:"].includes(parsed.protocol)) throw new Error();
      clearMedia();
      $("background").style.display = "block";
      const path = parsed.pathname.toLowerCase();
      if (/\.(mp4|webm|ogg|mov)$/.test(path)) {
        $("background").style.display = "none";
        $("backgroundVideo").src = parsed.href;
        $("backgroundVideo").style.display = "block";
        $("backgroundVideo").play().catch(() => {});
      } else {
        $("background").style.background = `url("${parsed.href.replace(/["\\]/g,"")}") center / cover no-repeat`;
      }
      settings.backgroundUrl = parsed.href; settings.backgroundType = "url"; saveSettings();
      toast("Background URL applied");
    } catch (_) { toast("Enter a valid http or https URL."); }
  });
  $("applyWebsite").addEventListener("click", () => {
    const url = $("websiteUrl").value.trim();
    try {
      const parsed = new URL(url);
      if (!["http:","https:"].includes(parsed.protocol)) throw new Error();
      clearMedia();
      $("background").style.display = "none";
      $("backgroundFrame").src = parsed.href;
      $("backgroundFrame").style.display = "block";
      settings.websiteUrl = parsed.href; settings.backgroundType = "website"; saveSettings();
      toast("Website requested — embedding depends on the site");
    } catch (_) { toast("Enter a valid http or https URL."); }
  });
  $("clearBackground").addEventListener("click", () => {
    clearMedia(); $("backgroundFile").value = ""; $("backgroundUrl").value = ""; $("websiteUrl").value = "";
    settings.backgroundType = "default"; $("backgroundType").value = "default"; showBackgroundFields(); applyBackground(); saveSettings(); toast("Background reset");
  });
  $("task").addEventListener("input", () => { settings.task = $("task").value; saveSettings(); });
  $("autoStart").addEventListener("change", () => { settings.autoStart = $("autoStart").value; saveSettings(); });
  $("soundMode").addEventListener("change", () => { settings.soundMode = $("soundMode").value; saveSettings(); });
  $("notifyMode").addEventListener("change", async () => {
    settings.notifyMode = $("notifyMode").value;
    if (settings.notifyMode === "on" && "Notification" in window && Notification.permission === "default") {
      try { const permission = await Notification.requestPermission(); if (permission !== "granted") toast("Notifications were not enabled."); } catch (_) {}
    }
    if (!("Notification" in window) && settings.notifyMode === "on") toast("Notifications are not supported here.");
    saveSettings();
  });
  $("resetSettings").addEventListener("click", () => {
    if (!confirm("Reset all preferences to their defaults?")) return;
    settings = {...defaults}; mode = "focus"; stopTicker(); running = false;
    $("backgroundFile").value = ""; $("backgroundUrl").value = ""; $("websiteUrl").value = "";
    populateInputs(); $("backgroundType").value = "default"; showBackgroundFields(); applyBackground();
    duration = durationFor(mode); remaining = duration; updateUI(); saveSettings(); toast("Settings restored");
  });
  $("exportSettings").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(settings,null,2)],{type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "focus-flow-settings.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href),1000);
  });
  $("importSettingsBtn").addEventListener("click", () => $("importSettingsFile").click());
  $("importSettingsFile").addEventListener("change", async () => {
    const file = $("importSettingsFile").files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
      settings = {...defaults,...data};
      settings.focusMinutes = safeNumber(settings.focusMinutes,1,180,25);
      settings.shortMinutes = safeNumber(settings.shortMinutes,1,60,5);
      settings.longMinutes = safeNumber(settings.longMinutes,1,90,15);
      settings.longEvery = safeNumber(settings.longEvery,2,12,4);
      populateInputs(); $("backgroundType").value = ["default","solid","gradient","image","video","url","website"].includes(settings.backgroundType) ? settings.backgroundType : "default";
      showBackgroundFields(); applyAppearance(); applyBackground(); setTimerDurationIfIdle(); saveSettings(); toast("Settings imported");
    } catch (_) { toast("That settings file is not valid."); }
    $("importSettingsFile").value = "";
  });
  // YouTube search results and recently played history.
  const MUSIC_KEY = "focus-flow-music-v2";
  const audio = $("musicAudio");
  const embed = $("musicEmbed");
  let tracks = [], trackIndex = -1;
  let resolving = false, embedPlaying = false, embedPaused = false, seekTimer = null, audiusHostCache = "";
  audio.volume = 0.7;
  function timeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    return Math.floor(seconds/60) + ":" + String(Math.floor(seconds%60)).padStart(2,"0");
  }
  function musicPanel(open) {
    const shouldOpen = typeof open === "boolean" ? open : !$("musicPanel").classList.contains("open");
    $("musicPanel").classList.toggle("open", shouldOpen);
    $("musicPanel").setAttribute("aria-hidden", String(!shouldOpen));
    updateMiniPlayer();
  }
  function persistMusic() {
    try {
      const saved = tracks.filter(t => t.kind !== "local").map(t => ({
        title: t.title, artist: t.artist, url: t.url || "", artwork: t.artwork || "",
        kind: t.kind || "", source: t.source || "", youtubeId: t.youtubeId || "", preview: !!t.preview
      }));
      localStorage.setItem(MUSIC_KEY, JSON.stringify({ tracks: saved, volume: audio.volume }));
    } catch (_) {}
  }
  function restoreMusic() {
    try {
      const saved = JSON.parse(localStorage.getItem(MUSIC_KEY) || "null");
      if (!saved || !Array.isArray(saved.tracks)) return;
      tracks = saved.tracks.filter(t => t && t.title && t.youtubeId && t.kind === "youtube");
      if (Number.isFinite(saved.volume)) {
        audio.volume = Math.min(1, Math.max(0, saved.volume));
        $("musicVolume").value = audio.volume;
      }
    } catch (_) {}
  }
  function youtubeIdFromUrl(url) {
    if (!url) return "";
    const match = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : "";
  }
  function classifyUrl(url) {
    if (!url) return "";
    const value = String(url);
    if (youtubeIdFromUrl(value)) return "youtube";
    if (/soundcloud\.com\//i.test(value)) return "soundcloud";
    if (/^https?:\/\//i.test(value) && /\.(mp3|m4a|aac|ogg|wav|flac|webm)(\?.*)?$/i.test(value)) return "audio";
    if (/preview\.itunes\.apple\.com|dzcdn\.net|audius/i.test(value)) return "audio";
    if (/^https?:\/\//i.test(value)) return "audio";
    if (value.startsWith("blob:")) return "local";
    return "";
  }
  function fetchJson(url, timeout=9000) {
    return Promise.race([
      fetch(url).then(res => { if (!res.ok) throw new Error("http"); return res.json(); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout))
    ]);
  }
  function jsonp(url, timeout=9000) {
    return new Promise((resolve, reject) => {
      const name = "ffcb" + Math.random().toString(36).slice(2);
      let done = false;
      const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeout);
      function cleanup() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[name];
        script.remove();
      }
      window[name] = data => { if (done) return; cleanup(); resolve(data); };
      const script = document.createElement("script");
      script.src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=" + name;
      script.onerror = () => { if (done) return; cleanup(); reject(new Error("jsonp")); };
      document.head.appendChild(script);
    });
  }
  async function searchITunes(query) {
    const data = await fetchJson("https://itunes.apple.com/search?media=music&entity=song&limit=8&term=" + encodeURIComponent(query));
    return (data.results || []).filter(item => item.previewUrl).map(item => ({
      title: item.trackName, artist: item.artistName, url: item.previewUrl,
      artwork: (item.artworkUrl100 || "").replace("100x100bb", "300x300bb").replace("100x100", "300x300"),
      kind: "audio", source: "Apple Music preview", preview: true
    }));
  }
  async function searchDeezer(query) {
    const data = await jsonp("https://api.deezer.com/search?q=" + encodeURIComponent(query) + "&limit=8");
    return ((data && data.data) || []).filter(item => item.preview).map(item => ({
      title: item.title, artist: item.artist && item.artist.name, url: item.preview,
      artwork: item.album && (item.album.cover_medium || item.album.cover),
      kind: "audio", source: "Deezer preview", preview: true
    }));
  }
  async function getAudiusHost() {
    if (audiusHostCache) return audiusHostCache;
    const data = await fetchJson("https://api.audius.co");
    const hosts = data && data.data;
    if (!hosts || !hosts.length) throw new Error("audius");
    audiusHostCache = hosts[0].replace(/\/$/, "");
    return audiusHostCache;
  }
  async function searchAudius(query) {
    const host = await getAudiusHost();
    const data = await fetchJson(host + "/v1/tracks/search?app_name=FocusFlow&query=" + encodeURIComponent(query));
    return ((data && data.data) || []).slice(0, 8).map(item => {
      const art = item.artwork || {};
      return {
        title: item.title,
        artist: item.user && (item.user.name || item.user.handle),
        url: host + "/v1/tracks/" + item.id + "/stream?app_name=FocusFlow",
        artwork: art["480x480"] || art["150x150"] || "",
        kind: "audio", source: "Audius", preview: false
      };
    });
  }
  async function searchCatalogs(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const settled = await Promise.allSettled([searchITunes(q), searchDeezer(q), searchAudius(q)]);
    const merged = [];
    const seen = new Set();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const track of result.value) {
        const key = (track.title + "|" + track.artist).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(track);
      }
    }
    return merged;
  }
  async function resolveTrack(track) {
    const youtubeId = youtubeIdFromUrl(track.url);
    if (youtubeId) return { ...track, kind: "youtube", youtubeId, source: track.source || "YouTube", url: track.url };
    const kind = classifyUrl(track.url);
    if (kind === "soundcloud") return { ...track, kind: "soundcloud", source: "SoundCloud" };
    if (kind === "audio" || kind === "local") return { ...track, kind, source: track.source || (kind === "local" ? "Local file" : "Direct audio") };
    const query = [track.title, track.artist].filter(Boolean).join(" ");
    if (!query) return { ...track, kind: "unresolved", source: "Needs audio" };
    try {
      const itunes = await searchITunes(query);
      if (itunes[0]) return { ...track, ...itunes[0], title: track.title || itunes[0].title, artist: track.artist || itunes[0].artist };
    } catch (_) {}
    try {
      const deezer = await searchDeezer(query);
      if (deezer[0]) return { ...track, ...deezer[0], title: track.title || deezer[0].title, artist: track.artist || deezer[0].artist };
    } catch (_) {}
    try {
      const audius = await searchAudius(query);
      if (audius[0]) return { ...track, ...audius[0], title: track.title || audius[0].title, artist: track.artist || audius[0].artist };
    } catch (_) {}
    return { ...track, kind: "unresolved", source: "No playable match" };
  }
  function isPlaying() {
    return (embedPlaying && !embedPaused) || (!audio.paused && !audio.ended && audio.src);
  }
  function stopEmbed() {
    embedPlaying = false;
    embedPaused = false;
    embed.classList.remove("show");
    embed.removeAttribute("src");
    clearInterval(seekTimer);
    seekTimer = null;
  }
  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  function renderPlaylist() {
    $("playlistCount").textContent = tracks.length + (tracks.length === 1 ? " track" : " tracks");
    const list = $("playlist");
    list.innerHTML = "";
    if (!tracks.length) {
      list.innerHTML = '<div class="playlist-empty">Your played tracks will appear here.</div>';
      return;
    }
    tracks.forEach((track, index) => {
      const row = document.createElement("div");
      row.className = "track-row" + (index === trackIndex ? " active" : "");
      const playingHere = index === trackIndex && isPlaying();
      row.innerHTML = `<span class="track-index">${playingHere ? "♫" : String(tracks.length-index).padStart(2,"0")}</span>${track.artwork ? '<img class="track-thumb" alt="" loading="lazy">' : ''}<span class="track-row-copy"><strong></strong><span></span></span><span class="history-play" aria-hidden="true">▶</span>`;
      if (track.artwork) row.querySelector(".track-thumb").src = track.artwork;
      row.querySelector("strong").textContent = track.title || "Untitled track";
      row.querySelector(".track-row-copy span").textContent = [track.artist || "YouTube", "YouTube"].filter(Boolean).join(" · ");
      row.addEventListener("click", () => playTrack(index));
      list.appendChild(row);
    });
  }
  function renderSearchResults(results) {
    const list = $("searchResults");
    $("searchResultCount").textContent = results.length ? `${results.length} found` : "No results";
    list.innerHTML = "";
    if (!results.length) {
      list.innerHTML = '<div class="playlist-empty">No results yet. Try another song or artist.</div>';
      return;
    }
    results.forEach(track => {
      const row = document.createElement("div");
      row.className = "track-row search-result-row";
      row.innerHTML = `${track.artwork ? '<img class="track-thumb" alt="" loading="lazy">' : '<span class="track-thumb result-placeholder">♫</span>'}<span class="track-row-copy"><strong></strong><span></span></span><button class="result-play" type="button" aria-label="Play this result">▶</button>`;
      if (track.artwork) row.querySelector(".track-thumb").src = track.artwork;
      row.querySelector("strong").textContent = track.title;
      row.querySelector(".track-row-copy span").textContent = track.artist || "YouTube";
      const choose = () => playSearchResult(track);
      row.addEventListener("click", choose);
      row.querySelector(".result-play").addEventListener("click", event => { event.stopPropagation(); choose(); });
      list.appendChild(row);
    });
  }
  function playSearchResult(track) {
    const existing = tracks.findIndex(item => item.youtubeId === track.youtubeId);
    if (existing >= 0) tracks.splice(existing, 1);
    tracks.unshift(track);
    if (tracks.length > 20) tracks.length = 20;
    trackIndex = 0;
    persistMusic();
    renderPlaylist();
    playTrack(0);
  }
  function updateMiniPlayer() {
    const track = tracks[trackIndex];
    const playing = isPlaying();
    const panelOpen = $("musicPanel").classList.contains("open");
    $("musicMini").classList.toggle("visible", !panelOpen && !!track);
    $("musicMini").setAttribute("aria-hidden", String(panelOpen || !track));
    $("musicBtn").classList.toggle("playing", playing);
    $("miniTitle").textContent = track ? track.title : "Nothing playing";
    $("miniArtist").textContent = track ? (track.artist || "Unknown artist") : "Open player";
    $("miniPlay").textContent = playing ? "Ⅱ" : "▶";
    const miniArt = $("miniArt");
    miniArt.style.backgroundImage = track && track.artwork ? `url("${track.artwork.replace(/["\\]/g,"")}")` : "linear-gradient(135deg,#d7ff64,#4c8d7b)";
  }
  function updateMusicUI() {
    const track = tracks[trackIndex];
    const playing = isPlaying();
    $("trackTitle").textContent = track ? track.title : "Nothing playing";
    $("trackArtist").textContent = track ? (track.artist || "Unknown artist") : "Search YouTube to play a track";
    $("trackSource").textContent = track ? (track.source || "Queue") + (track.preview ? " · 30s" : "") : "Ready";
    const art = $("albumArt");
    art.style.backgroundImage = track && track.artwork ? `linear-gradient(0deg,rgba(0,0,0,.08),rgba(0,0,0,.08)),url("${track.artwork.replace(/["\\]/g, "")}")` : "linear-gradient(135deg,#d7ff64,#4c8d7b)";
    art.classList.toggle("has-art", Boolean(track && track.artwork));
    art.classList.toggle("playing", playing);
    const glyph = $("albumGlyph");
    if (glyph) glyph.style.display = track && track.artwork ? "none" : "block";
    $("toggleMusic").textContent = playing ? "Ⅱ" : "▶";
    $("toggleMusic").setAttribute("aria-label", playing ? "Pause music" : "Play music");
    $("musicCurrent").textContent = embedPlaying ? "YouTube" : "0:00";
    $("musicDuration").textContent = embedPlaying ? "Playing" : "0:00";
    $("musicSeek").value = 0;
    updateMiniPlayer();
    renderPlaylist();
  }
  function playEmbed(track) {
    stopAudio();
    embedPlaying = true;
    embedPaused = false;
    if (track.kind === "youtube") {
      embed.src = "https://www.youtube-nocookie.com/embed/" + track.youtubeId + "?autoplay=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
    }
    embed.classList.add("show");
    $("musicCurrent").textContent = "live";
    $("musicDuration").textContent = "embed";
    $("musicSeek").value = 0;
    updateMusicUI();
    toast("Playing " + (track.title || "embed"));
  }
  async function playTrack(index) {
    if (!tracks.length) { toast("Search YouTube and choose a track first."); return; }
    trackIndex = (index + tracks.length) % tracks.length;
    let track = tracks[trackIndex];
    if (track.kind === "unresolved" || (!track.url && !track.youtubeId)) {
      toast("Looking up “" + (track.title || "track") + "”…");
      track = await resolveTrack(track);
      tracks[trackIndex] = track;
      persistMusic();
    }
    playEmbed(track);
    updateMusicUI();
  }
  function togglePlayback() {
    const track = tracks[trackIndex];
    if (trackIndex < 0 && tracks.length) { playTrack(0); return; }
    if (embedPlaying) {
      const command = embedPaused ? "playVideo" : "pauseVideo";
      embed.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
      embedPaused = !embedPaused;
      updateMusicUI();
      return;
    }
    if (audio.paused) audio.play().catch(() => toast("Could not play this track."));
    else audio.pause();
  }
  function nextMusicTrack(direction=1) {
    if (!tracks.length) return;
    let next;
    next = (Math.max(trackIndex,0) + direction + tracks.length) % tracks.length;
    playTrack(next);
  }
  $("musicBtn").addEventListener("click", () => musicPanel());
  $("closeMusic").addEventListener("click", () => musicPanel(false));
  $("miniPlay").addEventListener("click", ev => { ev.stopPropagation(); togglePlayback(); });
  $("musicMini").addEventListener("click", () => musicPanel(true));
  $("toggleMusic").addEventListener("click", togglePlayback);
  $("prevTrack").addEventListener("click", () => nextMusicTrack(-1));
  $("nextTrack").addEventListener("click", () => nextMusicTrack(1));
  $("musicVolume").addEventListener("input", () => {
    const volume = Math.round(Number($("musicVolume").value) * 100);
    audio.volume = Number($("musicVolume").value);
    if (embedPlaying) embed.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [volume] }), "*");
    persistMusic();
  });
  $("musicSeek").addEventListener("input", () => {
    if (embedPlaying) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number($("musicSeek").value)/100*audio.duration;
  });
  const YOUTUBE_KEY_STORAGE = "focus-flow-youtube-api-key-v1";
  const apiKeyInput = $("youtubeApiKey");
  const savedApiKey = localStorage.getItem(YOUTUBE_KEY_STORAGE) || "";
  if (apiKeyInput) apiKeyInput.value = savedApiKey;
  $("saveApiKey")?.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      localStorage.removeItem(YOUTUBE_KEY_STORAGE);
      toast("Saved API key removed from this browser.");
      return;
    }
    localStorage.setItem(YOUTUBE_KEY_STORAGE, key);
    toast("API key saved in this browser.");
  });
  $("searchMusic").addEventListener("click", async () => {
    const query = $("musicSearch").value.trim();
    if (!query) { toast("Type a song or artist to search."); return; }
    const apiKey = (localStorage.getItem(YOUTUBE_KEY_STORAGE) || "").trim();
    if (!apiKey) {
      toast("Open YouTube API setup and save your API key first.");
      document.querySelector(".api-key-settings")?.setAttribute("open", "");
      apiKeyInput?.focus();
      return;
    }
    toast("Searching YouTube…");
    $("searchMusic").disabled = true;
    try {
      const params = new URLSearchParams({
        part: "snippet", type: "video", videoEmbeddable: "true",
        maxResults: "10", q: query, key: apiKey
      });
      const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || "YouTube search failed. Check your API key and restrictions.";
        throw new Error(message);
      }
      const results = (data.items || []).filter(item => item.id?.videoId).map(item => ({
        title: item.snippet?.title || "Untitled video",
        artist: item.snippet?.channelTitle || "YouTube",
        url: "https://www.youtube.com/watch?v=" + item.id.videoId,
        youtubeId: item.id.videoId, kind: "youtube", source: "YouTube",
        artwork: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ""
      }));
      renderSearchResults(results);
      toast(results.length ? `${results.length} YouTube results found` : "No results found. Try another search.");
    } catch (error) {
      renderSearchResults([]);
      toast(error.message || "Search failed. Check your internet connection and API settings.");
    } finally {
      $("searchMusic").disabled = false;
    }
  });
  $("musicSearch").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("searchMusic").click(); } });
  audio.addEventListener("timeupdate", () => { if (!embedPlaying) updateMusicUI(); });
  audio.addEventListener("loadedmetadata", updateMusicUI);
  audio.addEventListener("play", updateMusicUI);
  audio.addEventListener("pause", updateMusicUI);
  restoreMusic();
  updateMusicUI();

  document.addEventListener("visibilitychange", () => { if (running) tick(); });
})();
