/**
 * 首页打字机：每隔 N 秒从 hitokoto 拉一句新的一言
 * 直接替换 #subtitle 里已渲染的文字
 */
(function () {
  const INTERVAL = 8000; // 每 8 秒换一句

  function isHome() {
    return location.pathname === '/' || location.pathname === '/index.html';
  }

  function fetchHitokoto() {
    return fetch('https://v1.hitokoto.cn/?c=i&c=k&c=d&encode=json')
      .then(r => r.json())
      .then(d => d.hitokoto)
      .catch(() => null);
  }

  async function swap() {
    const el = document.querySelector('#subtitle');
    if (!el) return;
    const text = await fetchHitokoto();
    if (!text) return;
    // 如果 typed.js 实例还在循环，destroy 后手动接管
    if (window.typed && typeof window.typed.destroy === 'function') {
      try { window.typed.destroy(); } catch (e) {}
      window.typed = null;
    }
    // 淡出再淡入，过渡自然
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = text;
      el.style.opacity = '1';
    }, 400);
  }

  function start() {
    if (!isHome()) return;
    swap();
    setInterval(swap, INTERVAL);
  }

  document.addEventListener('DOMContentLoaded', start);
  // 兼容 pjax
  document.addEventListener('pjax:complete', start);
})();
