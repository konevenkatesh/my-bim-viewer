/**
 * Renders the navbar into the specified element or body.
 * @param {string} activePage - 'home', 'viewer', or 'analysis'
 */
export function setupNavbar(activePage) {
  const existingNav = document.querySelector('.navbar');
  if (existingNav) existingNav.remove();

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  
  nav.innerHTML = `
    <a href="/" class="nav-brand">BIM Manager</a>
    <div class="nav-links">
      <a href="/" class="nav-link ${activePage === 'home' ? 'active' : ''}">Home</a>
      <a href="/viewer.html" class="nav-link ${activePage === 'viewer' ? 'active' : ''}">Viewer</a>
      <a href="/analysis.html" class="nav-link ${activePage === 'analysis' ? 'active' : ''}">Analysis</a>
    </div>
  `;
  
  document.body.prepend(nav);
}
