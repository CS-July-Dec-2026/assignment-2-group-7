const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

/* ═══════════════════════════════════════════════════════════════
   IN-MEMORY SESSION STORE
   ═══════════════════════════════════════════════════════════════ */
const sessions = {};

function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/* ═══════════════════════════════════════════════════════════════
   DEMO USERS (no database needed)
   ═══════════════════════════════════════════════════════════════ */
const users = {
  alice: {
    username: 'alice',
    name: 'Alice Johnson',
    email: 'alice@shoplux.com',
    password: 'password123',
  },
  bob: {
    username: 'bob',
    name: 'Bob Smith',
    email: 'bob@shoplux.com',
    password: 'password456',
  },
};

/* ═══════════════════════════════════════════════════════════════
   PRODUCT CATALOG
   ═══════════════════════════════════════════════════════════════ */
const products = [
  {
    id: 1,
    name: 'Aura Headphones',
    price: 299,
    description: 'Premium wireless noise-cancelling headphones with spatial audio',
    emoji: '🎧',
    category: 'Audio',
    badge: 'Best Seller',
  },
  {
    id: 2,
    name: 'Chrono Watch Pro',
    price: 449,
    description: 'Advanced health tracking, AMOLED display, 7-day battery',
    emoji: '⌚',
    category: 'Wearables',
    badge: 'New',
  },
  {
    id: 3,
    name: 'Milano Backpack',
    price: 189,
    description: 'Handcrafted Italian leather with anti-theft compartment',
    emoji: '🎒',
    category: 'Accessories',
    badge: null,
  },
  {
    id: 4,
    name: 'Nova Keyboard',
    price: 349,
    description: 'Hot-swappable mechanical switches, per-key RGB lighting',
    emoji: '⌨️',
    category: 'Tech',
    badge: 'Popular',
  },
  {
    id: 5,
    name: 'Eclipse Sunglasses',
    price: 259,
    description: 'Titanium frame, UV400 polarized lenses, lifetime warranty',
    emoji: '🕶️',
    category: 'Fashion',
    badge: null,
  },
  {
    id: 6,
    name: 'Velocity Runners',
    price: 199,
    description: 'Carbon-plate technology, ultra-lightweight at 185g',
    emoji: '👟',
    category: 'Sports',
    badge: 'Sale',
  },
  {
    id: 7,
    name: 'Pixel Tablet',
    price: 599,
    description: '11-inch 120Hz display, stylus included, all-day battery',
    emoji: '📱',
    category: 'Tech',
    badge: 'New',
  },
  {
    id: 8,
    name: 'Lumina Desk Lamp',
    price: 129,
    description: 'Smart ambient lighting with circadian rhythm mode',
    emoji: '💡',
    category: 'Accessories',
    badge: null,
  },
];

/* ═══════════════════════════════════════════════════════════════
   MIDDLEWARE
   ═══════════════════════════════════════════════════════════════ */
app.use(express.json());
app.use(cookieParser());

// Custom session middleware
app.use((req, res, next) => {
  let sessionId = req.cookies['SHOPLUX_SESSION'];

  // If no valid session exists, create one
  if (!sessionId || !sessions[sessionId]) {
    sessionId = generateSessionId();
    sessions[sessionId] = { cart: [], createdAt: Date.now() };
    res.cookie('SHOPLUX_SESSION', sessionId, {
      httpOnly: false, // Deliberately insecure — allows JS to read cookie for demo
      sameSite: 'lax',
    });
  }

  req.sessionId = sessionId;
  req.session = sessions[sessionId];
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

/* ═══════════════════════════════════════════════════════════════
   REFERRAL ROUTE — THE ATTACK SURFACE
   ───────────────────────────────────────────────────────────────
   This route simulates a "Refer a Friend" feature.
   The `ref` query parameter is presented as a referral tracking
   code, but it is actually a session ID.
   
   When a victim clicks a link like:
     http://localhost:3000/refer/SAVE20?ref=abc123def456...
   
   The server sets the victim's session cookie to the value in
   `ref`, which is the ATTACKER's session ID.
   ═══════════════════════════════════════════════════════════════ */
app.get('/refer/:code', (req, res) => {
  // This route just serves the referral landing page.
  // The session fixation happens CLIENT-SIDE: the refer.html page
  // contains a "referral tracking" script that reads the `ref`
  // query parameter from the URL and sets it as the session cookie
  // using document.cookie (possible because httpOnly is false).
  //
  // The server is NOT explicitly overwriting the cookie here —
  // the victim's own browser does it via JavaScript.
  res.sendFile(path.join(__dirname, 'public', 'refer.html'));
});

/* ═══════════════════════════════════════════════════════════════
   API ROUTES
   ═══════════════════════════════════════════════════════════════ */

// --- Products ---
app.get('/api/products', (req, res) => {
  res.json(products);
});

// --- Session Info (for debug panel) ---
app.get('/api/session-info', (req, res) => {
  res.json({
    sessionId: req.sessionId,
    isAuthenticated: !!req.session.user,
    user: req.session.user || null,
    cartCount: (req.session.cart || []).reduce((sum, item) => sum + item.quantity, 0),
  });
});

// --- Login (VULNERABLE) ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username?.toLowerCase()];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  ❌ VULNERABILITY: SESSION ID IS NOT REGENERATED         ║
  // ║                                                           ║
  // ║  The session ID remains the same before and after login.  ║
  // ║  If an attacker set this session ID beforehand (via the   ║
  // ║  referral link), they share the same session and become   ║
  // ║  authenticated as this user.                              ║
  // ╚═══════════════════════════════════════════════════════════╝

  req.session.user = {
    username: user.username,
    name: user.name,
    email: user.email,
  };
  req.session.isAuthenticated = true;

  
  // FOR FIXING THE ERROR UNCOMMENT THE BELOW LINES

  // const oldCart = req.session.cart || [];
  // delete sessions[req.sessionId];

  // const newSessionId = generateSessionId();
  // sessions[newSessionId] = {
  //   cart: oldCart,
  //   user: { username: user.username, name: user.name, email: user.email },
  //   isAuthenticated: true,
  //   createdAt: Date.now(),
  // };

  // res.cookie('SHOPLUX_SESSION', newSessionId, {
  //   httpOnly: false,
  //   sameSite: 'lax',
  // });

  // return res.json({
  //   success: true,
  //   user: { username: user.username, name: user.name, email: user.email },
  //   newSession: true,
  // });

  res.json({
    success: true,
    user: { username: user.username, name: user.name, email: user.email },
  });
});

// --- Logout ---
app.post('/api/logout', (req, res) => {
  delete sessions[req.sessionId];
  res.clearCookie('SHOPLUX_SESSION');
  res.json({ success: true });
});

// --- Profile ---
app.get('/api/profile', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

// --- Cart ---
app.get('/api/cart', (req, res) => {
  res.json(req.session.cart || []);
});

app.post('/api/cart/add', (req, res) => {
  const { productId } = req.body;
  const product = products.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  if (!req.session.cart) req.session.cart = [];

  const cartItem = req.session.cart.find((item) => item.id === productId);
  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    req.session.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      emoji: product.emoji,
      quantity: 1,
    });
  }

  res.json({ cart: req.session.cart });
});

app.post('/api/cart/remove', (req, res) => {
  const { productId } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter((item) => item.id !== productId);
  }
  res.json({ cart: req.session.cart || [] });
});

/* ═══════════════════════════════════════════════════════════════
   START SERVER
   ═══════════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║                                                   ║');
  console.log('  ║   💎  ShopLux — Premium Shopping                  ║');
  console.log(`  ║   🌐  http://localhost:${PORT}                       ║`);
  console.log('  ║                                                   ║');
  console.log('  ║   ⚠️   SESSION FIXATION VULNERABILITY DEMO        ║');
  console.log('  ║   📚  For educational purposes only               ║');
  console.log('  ║                                                   ║');
  console.log('  ║   Demo Accounts:                                  ║');
  console.log('  ║     alice / password123                           ║');
  console.log('  ║     bob   / password456                           ║');
  console.log('  ║                                                   ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
});
