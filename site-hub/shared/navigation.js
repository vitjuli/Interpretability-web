(() => {
  const script = document.currentScript;
  const root = new URL('../', script.src);
  const current = script.dataset.dashboard;
  const dashboards = [
    ['grammar', 'Grammar agreement'], ['physics', 'Physics concepts'],
    ['decay', 'Alpha / beta decay'], ['b1', 'Multilingual circuits'],
    ['latent', 'Latent states & clustering'], ['geometry', 'Geometry & mathematics']
  ];
  const nav = document.createElement('nav');
  nav.className = 'research-nav';
  nav.setAttribute('aria-label', 'Research dashboard navigation');
  const home = document.createElement('a');
  home.href = root.href;
  home.textContent = '← All dashboards';
  nav.append(home);
  const title = document.createElement('span');
  title.className = 'research-nav__name';
  title.textContent = dashboards.find(([id]) => id === current)?.[1] || 'Research explorer';
  nav.append(title);
  const status = document.createElement('span');
  status.className = 'research-nav__status';
  status.textContent = current === 'geometry' ? 'Saved experiment results' : 'Research archive';
  nav.append(status);
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Switch dashboard');
  for (const [id, name] of dashboards) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    option.selected = id === current;
    select.append(option);
  }
  select.addEventListener('change', () => {
    window.location.href = new URL(`dashboards/${select.value}/`, root).href;
  });
  nav.append(select);
  document.body.prepend(nav);
})();
