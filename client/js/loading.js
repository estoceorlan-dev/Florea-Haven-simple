// Skeleton markup lives beside its content in each HTML page.
export function setLoading(target, loading, { showContent = true } = {}) {
  const content = typeof target === 'string' ? document.querySelector(target) : target;
  if (!content) return;

  content.setAttribute('aria-busy', String(loading));
  content.hidden = loading || !showContent;
  for (const skeleton of document.querySelectorAll('[data-loading-for]')) {
    if (skeleton.dataset.loadingFor === content.id) skeleton.hidden = !loading;
  }
}
