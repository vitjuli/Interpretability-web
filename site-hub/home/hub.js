(() => {
  'use strict';
  const cards = [...document.querySelectorAll('.dashboard-card')];
  const buttons = [...document.querySelectorAll('[data-topic]')];
  const search = document.getElementById('dashboard-search');
  const result = document.getElementById('result-count');
  const clear = document.getElementById('clear-filters');
  const empty = document.getElementById('empty-state');
  const catalogue = document.getElementById('catalogue');
  const names = {
    all: 'All views',
    geometry: 'Math & geometry',
    features: 'Features & circuits',
    clustering: 'Clustering & latent structure',
    interventions: 'Causal interventions'
  };
  let topic = 'all';

  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const index = cards.map(card => ({
    card,
    topics: new Set(card.dataset.topics.split(' ')),
    text: normalize(card.textContent + ' ' + card.dataset.keywords)
  }));

  function updateHash() {
    const params = new URLSearchParams();
    if (topic !== 'all') params.set('topic', topic);
    if (search.value.trim()) params.set('q', search.value.trim());
    const hash = params.toString() || 'catalogue';
    // Keep typing and filter changes out of the browser's Back history.
    try { history.replaceState(null, '', '#' + hash); } catch (_) { /* Local-file preview can still filter. */ }
  }

  function render(syncUrl = true) {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const item of index) {
      const visible = (topic === 'all' || item.topics.has(topic)) && terms.every(term => item.text.includes(term));
      item.card.hidden = !visible;
      if (visible) shown += 1;
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.topic === topic));
    const qualifier = topic !== 'all' ? ' · ' + names[topic] : '';
    result.textContent = `${shown} of ${cards.length} dashboards${qualifier}`;
    clear.hidden = topic === 'all' && !search.value;
    empty.hidden = shown !== 0;
    if (syncUrl) updateHash();
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const requested = params.get('topic');
    topic = Object.prototype.hasOwnProperty.call(names, requested) ? requested : 'all';
    search.value = params.get('q') || '';
    render(false);
  }

  function reset() {
    topic = 'all';
    search.value = '';
    render();
    search.focus({ preventScroll: true });
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    topic = button.dataset.topic;
    render();
  }));
  search.addEventListener('input', () => render());
  search.addEventListener('search', () => render());
  clear.addEventListener('click', reset);
  document.getElementById('reset-search').addEventListener('click', reset);
  window.addEventListener('hashchange', readHash);
  document.querySelectorAll('[data-filter-jump]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      topic = new URLSearchParams(link.hash.slice(1)).get('topic') || 'all';
      search.value = '';
      render();
      catalogue.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      buttons.find(button => button.dataset.topic === topic)?.focus({ preventScroll: true });
    });
  });
  document.querySelector('.catalogue-tools').hidden = false;
  readHash();
})();
