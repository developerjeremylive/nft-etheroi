/**
 * NFT.etheroi - Cloudflare Worker
 * Platform for creating, buying, selling and collecting unique digital objects
 */

export interface NFT {
  id: string;
  name: string;
  description: string;
  image: string;
  creator: string;
  owner: string;
  price: number;
  forSale: boolean;
  auction: boolean;
  auctionEnd?: number;
  createdAt: number;
  tags: string[];
}

export interface Env {
  NFT_METADATA: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, url);
    }
    
    // Handle static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (url.pathname === '/manifest.json') {
      return new Response(MANIFEST_JSON, {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/sw.js') {
      return new Response(SW_CODE, {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

function handleAPI(request: Request, url: URL): Response {
  const path = url.pathname;
  
  // GET /api/nfts - Get sample NFTs
  if (path === '/api/nfts' && request.method === 'GET') {
    const sampleNFTs = getSampleNFTs();
    return new Response(JSON.stringify(sampleNFTs), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // POST /api/nfts - Create NFT (returns sample data, actual storage is client-side)
  if (path === '/api/nfts' && request.method === 'POST') {
    return new Response(JSON.stringify({ success: true, message: 'NFT stored locally' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  return new Response('API endpoint not found', { status: 404 });
}

function getSampleNFTs(): NFT[] {
  return [
    {
      id: "1",
      name: "Cosmic Dreams #001",
      description: "A mesmerizing digital artwork exploring the depths of cosmic consciousness",
      image: "https://picsum.photos/seed/nft1/400/400",
      creator: "0x1234...abcd",
      owner: "0x1234...abcd",
      price: 0.5,
      forSale: true,
      auction: false,
      createdAt: Date.now() - 86400000 * 5,
      tags: ["art", "cosmic", "abstract"]
    },
    {
      id: "2",
      name: "Digital Genesis",
      description: "The beginning of a new digital era captured in pixels",
      image: "https://picsum.photos/seed/nft2/400/400",
      creator: "0x5678...efgh",
      owner: "0x5678...efgh",
      price: 1.2,
      forSale: true,
      auction: true,
      auctionEnd: Date.now() + 86400000 * 2,
      createdAt: Date.now() - 86400000 * 3,
      tags: ["art", "genesis", "digital"]
    },
    {
      id: "3",
      name: "Neon Samurai",
      description: "A fusion of traditional Japanese art with cyberpunk aesthetics",
      image: "https://picsum.photos/seed/nft3/400/400",
      creator: "0x9abc...ijkl",
      owner: "0x9abc...ijkl",
      price: 2.5,
      forSale: true,
      auction: false,
      createdAt: Date.now() - 86400000 * 7,
      tags: ["art", "samurai", "neon"]
    },
    {
      id: "4",
      name: "Ethereal Portals",
      description: "Gates to other dimensions waiting to be discovered",
      image: "https://picsum.photos/seed/nft4/400/400",
      creator: "0xmnop...qrst",
      owner: "0xmnop...qrst",
      price: 0.8,
      forSale: true,
      auction: false,
      createdAt: Date.now() - 86400000 * 2,
      tags: ["art", "portal", "ethereal"]
    },
    {
      id: "5",
      name: "Blockchain Harmony",
      description: "Visual representation of decentralized harmony",
      image: "https://picsum.photos/seed/nft5/400/400",
      creator: "0xuvwx...yz12",
      owner: "0xuvwx...yz12",
      price: 3.0,
      forSale: true,
      auction: true,
      auctionEnd: Date.now() + 86400000 * 1,
      createdAt: Date.now() - 86400000 * 10,
      tags: ["art", "blockchain", "harmony"]
    },
    {
      id: "6",
      name: "Virtual Reality Dreams",
      description: "Where virtual meets reality in perfect synchronization",
      image: "https://picsum.photos/seed/nft6/400/400",
      creator: "0x3456...7890",
      owner: "0x3456...7890",
      price: 1.5,
      forSale: true,
      auction: false,
      createdAt: Date.now() - 86400000 * 1,
      tags: ["art", "vr", "dream"]
    }
  ];
}

const MANIFEST_JSON = JSON.stringify({
  "name": "NFT.etheroi",
  "short_name": "etheroi",
  "description": "Create, buy, sell and collect unique digital objects",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f1a",
  "theme_color": "#6C63FF",
  "icons": [
    {
      "src": "/images/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/images/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}, null, 2);

const SW_CODE = `const CACHE_NAME = 'nft-etheroi-v1';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((cacheNames) => {
    return Promise.all(cacheNames.map((cacheName) => {
      if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
    }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => {
    if (response) return response;
    return fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
      return response;
    });
  }));
});`;

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="NFT.etheroi - Create, buy, sell and collect unique digital objects">
  <meta name="theme-color" content="#6C63FF">
  <title>NFT.etheroi - Digital Art Marketplace</title>
  <link rel="manifest" href="/manifest.json">
  <style>
    :root {
      --primary: #6C63FF;
      --primary-dark: #5a52d5;
      --secondary: #00d4aa;
      --dark: #1a1a2e;
      --darker: #0f0f1a;
      --light: #f5f5f7;
      --gray: #8b8b9e;
      --danger: #ff6b6b;
      --success: #00d4aa;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--darker);
      color: var(--light);
      min-height: 100vh;
      line-height: 1.6;
    }
    
    .bg-animation {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      overflow: hidden;
    }
    
    .bg-animation::before {
      content: '';
      position: absolute;
      width: 200%;
      height: 200%;
      background: 
        radial-gradient(circle at 20% 80%, rgba(108, 99, 255, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(0, 212, 170, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 40% 40%, rgba(108, 99, 255, 0.08) 0%, transparent 40%);
      animation: bgMove 20s ease-in-out infinite;
    }
    
    @keyframes bgMove {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      50% { transform: translate(-5%, -5%) rotate(5deg); }
    }
    
    header {
      background: rgba(26, 26, 46, 0.9);
      backdrop-filter: blur(20px);
      padding: 1rem 2rem;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      border-bottom: 1px solid rgba(108, 99, 255, 0.2);
    }
    
    .header-content {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .logo span { font-weight: 300; }
    
    nav { display: flex; gap: 2rem; align-items: center; }
    nav a { color: var(--gray); text-decoration: none; font-weight: 500; transition: color 0.3s; }
    nav a:hover, nav a.active { color: var(--primary); }
    nav .hidden { display: none !important; }
    
    .btn {
      padding: 0.6rem 1.5rem;
      border-radius: 50px;
      border: none;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 0.9rem;
    }
    
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--primary-dark);
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(108, 99, 255, 0.4);
    }
    
    .btn-secondary {
      background: transparent;
      color: var(--primary);
      border: 2px solid var(--primary);
    }
    
    .btn-secondary:hover {
      background: var(--primary);
      color: white;
    }
    
    .btn-danger {
      background: var(--danger);
      color: white;
    }
    
    .btn-danger:hover {
      background: #e55555;
    }
    
    main {
      padding-top: 100px;
      max-width: 1400px;
      margin: 0 auto;
      padding-left: 2rem;
      padding-right: 2rem;
      padding-bottom: 4rem;
    }
    
    .hero {
      text-align: center;
      padding: 4rem 0;
    }
    
    .hero h1 {
      font-size: 3.5rem;
      margin-bottom: 1rem;
      line-height: 1.2;
    }
    
    .hero h1 span {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .hero p {
      font-size: 1.2rem;
      color: var(--gray);
      max-width: 600px;
      margin: 0 auto 2rem;
    }
    
    .hero-buttons { display: flex; gap: 1rem; justify-content: center; }
    
    .filters { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    
    .filter-btn {
      padding: 0.5rem 1.2rem;
      border-radius: 50px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: var(--gray);
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .filter-btn:hover, .filter-btn.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    
    .nft-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 2rem;
    }
    
    .nft-card {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.3s;
      cursor: pointer;
    }
    
    .nft-card:hover {
      transform: translateY(-10px);
      border-color: var(--primary);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }
    
    .nft-image { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .nft-info { padding: 1.2rem; }
    .nft-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; }
    .nft-creator { font-size: 0.85rem; color: var(--gray); margin-bottom: 1rem; }
    
    .nft-footer { display: flex; justify-content: space-between; align-items: center; }
    .nft-price { font-size: 1rem; font-weight: 700; color: var(--secondary); }
    
    .nft-status {
      font-size: 0.75rem;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      background: rgba(0, 212, 170, 0.2);
      color: var(--secondary);
    }
    
    .nft-status.auction {
      background: rgba(255, 107, 107, 0.2);
      color: var(--danger);
    }
    
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
      padding: 2rem;
    }
    
    .modal-overlay.active { display: flex; }
    
    .modal {
      background: var(--dark);
      border-radius: 24px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
      animation: modalIn 0.3s ease;
    }
    
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    
    .modal-image { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .modal-content { padding: 2rem; }
    
    .modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.5rem;
    }
    
    .modal h2 { font-size: 2rem; margin-bottom: 0.5rem; }
    .modal-description { color: var(--gray); margin-bottom: 1.5rem; }
    
    .modal-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .detail-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 1rem;
      border-radius: 12px;
    }
    
    .detail-label { font-size: 0.8rem; color: var(--gray); margin-bottom: 0.3rem; }
    .detail-value { font-weight: 600; }
    
    .section-title {
      font-size: 2rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, var(--primary), transparent);
    }
    
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      padding: 4rem 0;
    }
    
    .feature-card {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 20px;
      padding: 2rem;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.3s;
    }
    
    .feature-card:hover {
      border-color: var(--primary);
      transform: translateY(-5px);
    }
    
    .feature-icon { font-size: 3rem; margin-bottom: 1rem; }
    .feature-card h3 { margin-bottom: 0.5rem; }
    .feature-card p { color: var(--gray); font-size: 0.9rem; }
    
    .create-section {
      max-width: 600px;
      margin: 0 auto;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .form-group { margin-bottom: 1.5rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
    
    .form-group input,
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 1rem;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: var(--light);
      font-size: 1rem;
    }
    
    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    footer {
      background: var(--dark);
      padding: 3rem 2rem;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    footer p { color: var(--gray); }
    
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--primary);
      color: white;
      padding: 1rem 2rem;
      border-radius: 12px;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s;
      z-index: 300;
    }
    
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.error { background: var(--danger); }
    .toast.success { background: var(--success); }
    
    /* Login Modal */
    .login-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 500;
    }
    
    .login-overlay.hidden { display: none; }
    
    .login-card {
      background: var(--dark);
      border-radius: 24px;
      padding: 3rem;
      width: 100%;
      max-width: 400px;
      text-align: center;
      animation: modalIn 0.3s ease;
    }
    
    .login-card h2 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .login-card p { color: var(--gray); margin-bottom: 2rem; }
    
    .login-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    
    .login-input-group {
      position: relative;
      margin-bottom: 1rem;
    }
    
    .login-input-group input {
      width: 100%;
      padding: 1rem 1rem 1rem 3rem;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: var(--light);
      font-size: 1rem;
      transition: all 0.3s;
    }
    
    .login-input-group input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(108, 99, 255, 0.2);
    }
    
    .login-input-group::before {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--gray);
      font-size: 1.2rem;
    }
    
    .login-input-email::before { content: '✉️'; }
    .login-input-password::before { content: '🔒'; }
    
    .login-forgot {
      display: block;
      margin-top: 1rem;
      color: var(--primary);
      font-size: 0.85rem;
      text-decoration: none;
    }
    
    .login-forgot:hover { text-decoration: underline; }
    
    .login-error {
      color: var(--danger);
      font-size: 0.9rem;
      margin-bottom: 1rem;
      display: none;
    }
    
    .login-error.show { display: block; }
    
    @media (max-width: 768px) {
      .hero h1 { font-size: 2rem; }
      nav { display: none; }
      .nft-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
    }
  </style>
</head>
<body>
  <div class="bg-animation"></div>
  
  <!-- Login Modal -->
  <div class="login-overlay" id="loginOverlay">
    <div class="login-card">
      <div class="login-icon">🔐</div>
      <h2>Welcome Back</h2>
      <p>Sign in to continue to NFT.etheroi</p>
      <div class="login-error" id="loginError">Invalid email or password</div>
      <form id="loginForm">
        <div class="login-input-group login-input-email">
          <input type="email" name="email" placeholder="Email address" required>
        </div>
        <div class="login-input-group login-input-password">
          <input type="password" name="password" placeholder="Password" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">Sign In</button>
      </form>
    </div>
  </div>
  
  <header>
    <div class="header-content">
      <div class="logo">NFT<span>.etheroi</span></div>
      <nav>
        <a href="#" class="active" data-page="home">Home</a>
        <a href="#" data-page="marketplace">Marketplace</a>
        <a href="#" data-page="create" class="protected hidden">Create</a>
        <a href="#" data-page="gallery" class="protected hidden">Gallery</a>
        <button class="btn btn-primary" id="connectBtn">Connect Wallet</button>
        <button class="btn btn-danger hidden" id="logoutBtn">Logout</button>
      </nav>
    </div>
  </header>
  
  <main id="app"></main>
  
  <footer>
    <p>&copy; 2026 NFT.etheroi. All rights reserved. Built on blockchain technology.</p>
  </footer>
  
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <img src="" alt="" class="modal-image" id="modalImage">
      <div class="modal-content">
        <h2 id="modalTitle"></h2>
        <p class="modal-description" id="modalDescription"></p>
        <div class="modal-details">
          <div class="detail-item">
            <div class="detail-label">Creator</div>
            <div class="detail-value" id="modalCreator"></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Owner</div>
            <div class="detail-value" id="modalOwner"></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Price</div>
            <div class="detail-value" id="modalPrice"></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Status</div>
            <div class="detail-value" id="modalStatus"></div>
          </div>
        </div>
        <button class="btn btn-primary" style="width: 100%;" onclick="buyNFT()">Buy Now</button>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    // Credentials (hardcoded)
    const VALID_CREDENTIALS = {
      email: 'developerjeremylive@gmail.com',
      password: '123123'
    };
    
    let currentFilter = 'all';
    let currentPage = 'home';
    let nfts = [];
    let userNFTs = [];
    let isLoggedIn = false;
    let selectedNFT = null;
    
    // Check login status on load
    function checkLogin() {
      const loginStatus = localStorage.getItem('nft_etheroi_logged_in');
      if (loginStatus === 'true') {
        isLoggedIn = true;
        showLoggedInUI();
        loadUserNFTs();
      }
    }
    
    function showLoggedInUI() {
      document.getElementById('loginOverlay').classList.add('hidden');
      document.getElementById('connectBtn').classList.add('hidden');
      document.getElementById('logoutBtn').classList.remove('hidden');
      document.querySelectorAll('.protected').forEach(el => el.classList.remove('hidden'));
    }
    
    function showLoggedOutUI() {
      document.getElementById('loginOverlay').classList.remove('hidden');
      document.getElementById('connectBtn').classList.remove('hidden');
      document.getElementById('logoutBtn').classList.add('hidden');
      document.querySelectorAll('.protected').forEach(el => el.classList.add('hidden'));
    }
    
    // Login handler
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const email = formData.get('email');
      const password = formData.get('password');
      
      if (email === VALID_CREDENTIALS.email && password === VALID_CREDENTIALS.password) {
        isLoggedIn = true;
        localStorage.setItem('nft_etheroi_logged_in', 'true');
        showLoggedInUI();
        loadUserNFTs();
        showToast('Welcome back!', 'success');
      } else {
        document.getElementById('loginError').classList.add('show');
      }
    });
    
    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', () => {
      isLoggedIn = false;
      localStorage.removeItem('nft_etheroi_logged_in');
      showLoggedOutUI();
      navigate('home');
      showToast('Logged out successfully', 'success');
    });
    
    // Router
    function navigate(page) {
      if (!isLoggedIn && (page === 'create' || page === 'gallery')) {
        showToast('Please login to access this feature');
        return;
      }
      currentPage = page;
      document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
      const navLink = document.querySelector('[data-page="' + page + '"]');
      if (navLink) navLink.classList.add('active');
      render();
    }
    
    document.querySelectorAll('nav a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.dataset.page);
      });
    });
    
    // Connect Wallet (demo)
    document.getElementById('connectBtn').addEventListener('click', () => {
      if (!isLoggedIn) {
        showToast('Please login first');
      } else {
        showToast('Wallet connected!', 'success');
      }
    });
    
    // Render functions
    function render() {
      const app = document.getElementById('app');
      switch(currentPage) {
        case 'home':
          app.innerHTML = renderHome();
          fetchNFTs();
          break;
        case 'marketplace':
          app.innerHTML = renderMarketplace();
          fetchNFTs();
          break;
        case 'create':
          app.innerHTML = renderCreate();
          break;
        case 'gallery':
          app.innerHTML = renderGallery();
          renderUserNFTs();
          break;
      }
    }
    
    function renderHome() {
      return \`
        <section class="hero">
          <h1>Discover, Create & Collect<br><span>Unique Digital Art</span></h1>
          <p>NFT.etheroi is the marketplace for digital creators. Create, buy, and sell unique digital objects secured by blockchain technology.</p>
          <div class="hero-buttons">
            <button class="btn btn-primary" onclick="navigate('marketplace')">Explore Marketplace</button>
            <button class="btn btn-secondary" onclick="navigate('create')">Create NFT</button>
          </div>
        </section>
        
        <section>
          <h2 class="section-title">Featured NFTs</h2>
          <div class="nft-grid" id="featuredGrid"></div>
        </section>
        
        <section>
          <h2 class="section-title">Platform Features</h2>
          <div class="features">
            <div class="feature-card">
              <div class="feature-icon">🎨</div>
              <h3>Create NFTs</h3>
              <p>Upload your artwork and convert it into unique digital tokens</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🛒</div>
              <h3>Marketplace</h3>
              <p>Buy and sell NFTs in our secure marketplace</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🔨</div>
              <h3>Auctions</h3>
              <p>Participate in auctions for exclusive digital pieces</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🖼️</div>
              <h3>Galleries</h3>
              <p>Showcase your collection in virtual galleries</p>
            </div>
          </div>
        </section>\`;
    }
    
    function renderMarketplace() {
      return \`
        <h2 class="section-title">Marketplace</h2>
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="sale">For Sale</button>
          <button class="filter-btn" data-filter="auction">Auctions</button>
        </div>
        <div class="nft-grid" id="marketplaceGrid"></div>\`;
    }
    
    function renderCreate() {
      return \`
        <h2 class="section-title">Create NFT</h2>
        <div class="create-section">
          <form id="createForm">
            <div class="form-group">
              <label>NFT Name</label>
              <input type="text" name="name" required placeholder="Enter NFT name">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" rows="4" placeholder="Describe your digital artwork"></textarea>
            </div>
            <div class="form-group">
              <label>Image URL</label>
              <input type="url" name="image" required placeholder="https://example.com/image.jpg">
            </div>
            <div class="form-group">
              <label>Price (ETH)</label>
              <input type="number" name="price" step="0.01" required placeholder="0.00">
            </div>
            <div class="form-group">
              <label>Put on Sale</label>
              <select name="forSale">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Create NFT</button>
          </form>
        </div>\`;
    }
    
    function renderGallery() {
      return \`
        <h2 class="section-title">My Gallery</h2>
        <div class="nft-grid" id="galleryGrid"></div>\`;
    }
    
    // Fetch NFTs from API
    async function fetchNFTs() {
      try {
        const response = await fetch('/api/nfts');
        const serverNFTs = await response.json();
        
        // Merge with locally stored NFTs
        const localNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
        nfts = [...serverNFTs, ...localNFTs];
        
        renderNFTs();
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      }
    }
    
    function loadUserNFTs() {
      userNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
    }
    
    function renderNFTs() {
      const featuredGrid = document.getElementById('featuredGrid');
      const marketplaceGrid = document.getElementById('marketplaceGrid');
      
      // Filter NFTs based on current filter
      let filteredNFTs = nfts;
      if (currentFilter === 'sale') {
        filteredNFTs = nfts.filter(nft => nft.forSale && !nft.auction);
      } else if (currentFilter === 'auction') {
        filteredNFTs = nfts.filter(nft => nft.auction);
      }
      
      const nftCards = filteredNFTs.map(nft => createNFTCard(nft)).join('');
      
      if (featuredGrid) featuredGrid.innerHTML = nfts.slice(0, 4).map(nft => createNFTCard(nft)).join('');
      if (marketplaceGrid) {
        if (filteredNFTs.length === 0) {
          marketplaceGrid.innerHTML = '<p style="color: var(--gray); grid-column: 1/-1; text-align: center; padding: 2rem;">No NFTs found for this filter</p>';
        } else {
          marketplaceGrid.innerHTML = nftCards;
        }
      }
    }
    
    function renderUserNFTs() {
      const galleryGrid = document.getElementById('galleryGrid');
      if (!galleryGrid) return;
      
      if (userNFTs.length === 0) {
        galleryGrid.innerHTML = '<p style="color: var(--gray); grid-column: 1/-1; text-align: center; padding: 2rem;">No NFTs created yet. Go to Create to mint your first NFT!</p>';
        return;
      }
      
      galleryGrid.innerHTML = userNFTs.map(nft => createNFTCard(nft, true)).join('');
    }
    
    function createNFTCard(nft, isOwner = false) {
      const status = nft.auction ? 'Auction' : (nft.forSale ? 'For Sale' : 'Not for Sale');
      const statusClass = nft.auction ? 'auction' : '';
      const ownerLabel = isOwner ? '<span style="color: var(--secondary); font-size: 0.75rem;">(Your NFT)</span>' : '';
      
      return \`
        <div class="nft-card" onclick="openModal('\${nft.id}')">
          <img src="\${nft.image}" alt="\${nft.name}" class="nft-image">
          <div class="nft-info">
            <h3 class="nft-name">\${nft.name} \${ownerLabel}</h3>
            <p class="nft-creator">by \${nft.creator}</p>
            <div class="nft-footer">
              <span class="nft-price">\${nft.price} ETH</span>
              <span class="nft-status \${statusClass}">\${status}</span>
            </div>
          </div>
        </div>\`;
    }
    
    // Modal functions
    function openModal(nftId) {
      // Check if it's a user NFT
      let foundNFT = nfts.find(n => n.id === nftId);
      if (!foundNFT) {
        foundNFT = userNFTs.find(n => n.id === nftId);
      }
      if (!foundNFT) return;
      
      selectedNFT = foundNFT;
      
      document.getElementById('modalImage').src = foundNFT.image;
      document.getElementById('modalTitle').textContent = foundNFT.name;
      document.getElementById('modalDescription').textContent = foundNFT.description;
      document.getElementById('modalCreator').textContent = foundNFT.creator;
      document.getElementById('modalOwner').textContent = foundNFT.owner;
      document.getElementById('modalPrice').textContent = foundNFT.price + ' ETH';
      document.getElementById('modalStatus').textContent = foundNFT.auction ? 'On Auction' : (foundNFT.forSale ? 'For Sale' : 'Not Listed');
      
      document.getElementById('modal').classList.add('active');
    }
    
    function closeModal() {
      document.getElementById('modal').classList.remove('active');
      selectedNFT = null;
    }
    
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
    
    function buyNFT() {
      if (!selectedNFT) return;
      showToast(\`Purchasing \${selectedNFT.name}...\`, 'success');
      setTimeout(() => {
        showToast('Purchase simulation: NFT acquired!', 'success');
        closeModal();
      }, 2000);
    }
    
    // Form handling - Create NFT
    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'createForm') {
        e.preventDefault();
        
        if (!isLoggedIn) {
          showToast('Please login first');
          return;
        }
        
        const formData = new FormData(e.target);
        const newNFT = {
          id: 'user_' + Date.now(),
          name: formData.get('name'),
          description: formData.get('description'),
          image: formData.get('image'),
          price: parseFloat(formData.get('price')),
          forSale: formData.get('forSale') === 'yes',
          auction: false,
          creator: '0xUser...1234',
          owner: '0xUser...1234',
          createdAt: Date.now(),
          tags: []
        };
        
        // Save to localStorage
        const storedNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
        storedNFTs.push(newNFT);
        localStorage.setItem('nft_etheroi_nfts', JSON.stringify(storedNFTs));
        
        userNFTs = storedNFTs;
        
        showToast('NFT created successfully!', 'success');
        e.target.reset();
        
        // Navigate to gallery to see the new NFT
        setTimeout(() => navigate('gallery'), 1500);
      }
    });
    
    // Toast
    function showToast(message, type = '') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
    
    // Filter buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update filter and re-render NFTs
        currentFilter = e.target.dataset.filter;
        renderNFTs();
      }
    });
    
    // Initialize
    checkLogin();
    render();
  </script>
</body>
</html>`;
