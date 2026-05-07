/**
 * 整个文章卡片点击跳转（不止标题）
 * 点击卡片内任意非链接区域 = 点击标题
 */
(function () {
  function bindCardClick() {
    document.querySelectorAll('#recent-posts .recent-post-item').forEach(card => {
      if (card.dataset.bound) return;
      card.dataset.bound = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', e => {
        if (e.target.closest('a, button')) return;
        const link = card.querySelector('.article-title, .post-title a, a.article-title, h3.post-title a');
        if (!link) return;
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          window.open(link.href, '_blank');
        } else {
          window.location.href = link.href;
        }
      });
    });
  }
  document.addEventListener('DOMContentLoaded', bindCardClick);
  document.addEventListener('pjax:complete', bindCardClick);
})();
