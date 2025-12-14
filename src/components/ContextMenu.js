
/**
 * Context Menu Component
 * Creates a custom right-click menu for the viewer
 */
export function setupContextMenu(container, { onIsolate, onHide, onShowAll }) {
  // Create menu element
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  // Menu structure
  const items = [
    { label: 'Isolate Element', icon: '🎯', action: onIsolate },
    { label: 'Hide Element', icon: '👁️‍🗨️', action: onHide },
    { type: 'divider' },
    { label: 'Show All', icon: '👁️', action: onShowAll },
  ];
  
  // Build menu items
  items.forEach(item => {
    if (item.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        menu.appendChild(divider);
        return;
    }

    const div = document.createElement('div');
    div.className = 'context-menu-item';
    div.innerHTML = `<span>${item.icon}</span> ${item.label}`;
    
    div.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent falling through
        if (item.action) item.action();
        hide();
    });
    
    menu.appendChild(div);
  });
  
  document.body.appendChild(menu);
  
  // Helper to show menu
  const show = (x, y) => {
    // Adjust position to keep in viewport
    const rect = menu.getBoundingClientRect();
    let top = y;
    let left = x;
    
    // Check bottom edge
    if (y + rect.height > window.innerHeight) {
        top = y - rect.height;
    }
    
    // Check right edge
    if (x + rect.width > window.innerWidth) {
        left = x - rect.width;
    }
    
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.display = 'block';
  };
  
  // Helper to hide menu
  const hide = () => {
    menu.style.display = 'none';
  };
  
  // Close when clicking elsewhere
  document.addEventListener('click', () => hide());
  document.addEventListener('contextmenu', (e) => {
      // If clicking outside the menu (and not opening it), hide it
      // But we will handle opening in the viewer logic
      if (!menu.contains(e.target)) {
          hide();
      }
  });
  
  return { show, hide };
}
