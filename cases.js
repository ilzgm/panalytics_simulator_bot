/* Add one object here when a new case is ready. */
const cases = [
  {
    id: "hotel-commission",
    title: "Буст-комиссия в ранжировании отелей",
    description: "Спроектируй эксперимент, расследуй SRM и реши, можно ли доверять росту выручки.",
    file: "cases/hotel-commission.html",
    duration: "10–15 минут",
    endings: "4 концовки",
    status: "Доступен"
  }
];
const catalog = document.getElementById("caseCatalog");
catalog.innerHTML = cases.map((item, index) => `
  <article class="case-card">
    <div class="scene-head"><span>КЕЙС ${String(index + 1).padStart(2, "0")}</span><span class="status">${item.status}</span></div>
    <h2>${item.title}</h2>
    <p>${item.description}</p>
    <div class="case-meta"><span class="pill">${item.duration}</span><span class="pill">${item.endings}</span></div>
    <a class="btn primary case-link" href="${item.file}">▶ ОТКРЫТЬ КЕЙС</a>
  </article>`).join("");
