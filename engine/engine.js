/* Shared runtime utilities for Analyst Simulator cases. */
(function () {
  let activeTyping = new Map();
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
    const target = document.getElementById(id);
    if (!target) {
      console.error(`[AnalystEngine] Screen not found: ${id}`);
      return;
    }
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function typeText(text, element, options = {}) {
    const speed = Number(options.speed || 18);
    const onComplete = options.onComplete || function () {};
    const content = String(text || "");
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      element.textContent = content.slice(0, index);
      if (index >= content.length) {
        clearInterval(timer);
        activeTyping.delete(timer);
        onComplete();
      }
    }, speed);
    activeTyping.set(timer, { element, content, onComplete });
    return timer;
  }
  function finishTyping(timer, element, fullText) {
    const item = activeTyping.get(timer);
    clearInterval(timer);
    activeTyping.delete(timer);
    element.textContent = String(fullText || "");
    if (item && item.onComplete) item.onComplete();
  }
  function readJSON(key, fallback = null) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  window.AnalystEngine = { showScreen, typeText, finishTyping, readJSON, writeJSON };
})();
