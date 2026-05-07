/**
 * 侧边栏时钟 + 天气简易小组件
 * 仅在有 #aside-content 的页面注入一次
 */
(function () {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function buildCard() {
    const card = document.createElement('div');
    card.className = 'card-widget card-clock';
    card.innerHTML = `
      <div class="item-headline">
        <i class="far fa-clock"></i><span>此刻</span>
      </div>
      <div class="clock-body">
        <div class="clock-time" id="aside-clock-time">--:--:--</div>
        <div class="clock-date" id="aside-clock-date">----年--月--日 星期-</div>
        <div class="clock-weather" id="aside-clock-weather">🌤 正在获取天气...</div>
      </div>
    `;
    return card;
  }

  function tickClock() {
    const t = document.getElementById('aside-clock-time');
    const d = document.getElementById('aside-clock-date');
    if (!t || !d) return;
    const now = new Date();
    t.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const week = ['日','一','二','三','四','五','六'][now.getDay()];
    d.textContent = `${now.getFullYear()}年${pad(now.getMonth()+1)}月${pad(now.getDate())}日 星期${week}`;
  }

  function loadWeather() {
    const el = document.getElementById('aside-clock-weather');
    if (!el) return;
    // 免费无 key 天气接口（按 IP 自动定位）
    fetch('https://wttr.in/?format=j1&lang=zh')
      .then(r => r.json())
      .then(d => {
        const c = d.current_condition && d.current_condition[0];
        const area = d.nearest_area && d.nearest_area[0];
        if (!c) throw new Error('no data');
        const city = area && area.areaName && area.areaName[0] && area.areaName[0].value || '';
        const desc = c.lang_zh && c.lang_zh[0] && c.lang_zh[0].value || c.weatherDesc[0].value;
        el.textContent = `📍${city} ${desc} ${c.temp_C}°C`;
      })
      .catch(() => { el.textContent = '🌤 天气获取失败'; });
  }

  function mount() {
    const aside = document.querySelector('#aside-content');
    if (!aside) return;
    if (document.querySelector('.card-clock')) return;
    const card = buildCard();
    aside.insertBefore(card, aside.firstChild);
    tickClock();
    setInterval(tickClock, 1000);
    loadWeather();
  }

  document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('pjax:complete', mount);
})();
