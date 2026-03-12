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

export interface User {
  id: string;
  address: string;
  username: string;
  avatar: string;
  bio: string;
  nfts: string[];
  createdAt: number;
}

export interface Env {
  NFT_METADATA: KVNamespace;
}

// In-memory storage for demo (would use KV in production)
const nfts: Map<string, NFT> = new Map();
const users: Map<string, User> = new Map();

// Initialize with sample data
function initializeSampleData() {
  if (nfts.size > 0) return;

  const sampleNFTs: NFT[] = [
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

  sampleNFTs.forEach(nft => nfts.set(nft.id, nft));

  // Sample users
  const sampleUsers: User[] = [
    {
      id: "1",
      address: "0x1234...abcd",
      username: "CryptoArtist",
      avatar: "https://picsum.photos/seed/user1/100/100",
      bio: "Digital artist exploring new frontiers",
      nfts: ["1"],
      createdAt: Date.now() - 86400000 * 30
    },
    {
      id: "2",
      address: "0x5678...efgh",
      username: "NFtCollector",
      avatar: "https://picsum.photos/seed/user2/100/100",
      bio: "Collector of unique digital treasures",
      nfts: ["2"],
      createdAt: Date.now() - 86400000 * 20
    }
  ];

  sampleUsers.forEach(user => users.set(user.id, user));
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="NFT.etheroi - Create, buy, sell and collect unique digital objects">
  <meta name="theme-color" content="#6C63FF">
  <title>NFT.etheroi - Digital Art Marketplace</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/images/icon-192.png">
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
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--darker);
      color: var(--light);
      min-height: 100vh;
      line-height: 1.6;
    }
    
    /* Animated Background */
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
    
    /* Header */
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
    
    .logo span {
      font-weight: 300;
    }
    
    nav {
      display: flex;
      gap: 2rem;
      align-items: center;
    }
    
    nav a {
      color: var(--gray);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.3s;
    }
    
    nav a:hover, nav a.active {
      color: var(--primary);
    }
    
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
    
    /* Main Content */
    main {
      padding-top: 100px;
      max-width: 1400px;
      margin: 0 auto;
      padding-left: 2rem;
      padding-right: 2rem;
      padding-bottom: 4rem;
    }
    
    /* Hero Section */
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
    
    .hero-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    
    /* Filters */
    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    
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
    
    /* NFT Grid */
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
    
    .nft-image {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
    }
    
    .nft-info {
      padding: 1.2rem;
    }
    
    .nft-name {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    
    .nft-creator {
      font-size: 0.85rem;
      color: var(--gray);
      margin-bottom: 1rem;
    }
    
    .nft-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .nft-price {
      font-size: 1rem;
      font-weight: 700;
      color: var(--secondary);
    }
    
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
    
    /* Modal */
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
    
    .modal-overlay.active {
      display: flex;
    }
    
    .modal {
      background: var(--dark);
      border-radius: 24px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      animation: modalIn 0.3s ease;
    }
    
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    
    .modal-image {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
    }
    
    .modal-content {
      padding: 2rem;
    }
    
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
    
    .modal h2 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    
    .modal-description {
      color: var(--gray);
      margin-bottom: 1.5rem;
    }
    
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
    
    .detail-label {
      font-size: 0.8rem;
      color: var(--gray);
      margin-bottom: 0.3rem;
    }
    
    .detail-value {
      font-weight: 600;
    }
    
    /* Sections */
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
    
    /* Features */
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
    
    .feature-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    
    .feature-card h3 {
      margin-bottom: 0.5rem;
    }
    
    .feature-card p {
      color: var(--gray);
      font-size: 0.9rem;
    }
    
    /* Create Form */
    .create-section {
      max-width: 600px;
      margin: 0 auto;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    
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
    
    /* Footer */
    footer {
      background: var(--dark);
      padding: 3rem 2rem;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    footer p {
      color: var(--gray);
    }
    
    /* Toast */
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
    
    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }
    
    /* Loading */
    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4rem;
    }
    
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(108, 99, 255, 0.3);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Mobile */
    @media (max-width: 768px) {
      .hero h1 {
        font-size: 2rem;
      }
      
      nav {
        display: none;
      }
      
      .nft-grid {
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="bg-animation"></div>
  
  <header>
    <div class="header-content">
      <div class="logo">NFT<span>.etheroi</span></div>
      <nav>
        <a href="#" class="active" data-page="home">Home</a>
        <a href="#" data-page="marketplace">Marketplace</a>
        <a href="#" data-page="create">Create</a>
        <a href="#" data-page="gallery">Gallery</a>
        <button class="btn btn-primary">Connect Wallet</button>
      </nav>
    </div>
  </header>
  
  <main id="app">
    <!-- Content loaded dynamically -->
  </main>
  
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
    let currentPage = 'home';
    let nfts = [];
    let selectedNFT = null;
    
    // Router
    function navigate(page) {
      currentPage = page;
      document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
      document.querySelector(\`[data-page="\${page}"]\`).classList.add('active');
      render();
    }
    
    document.querySelectorAll('nav a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.dataset.page);
      });
    });
    
    // Render functions
    function render() {
      const app = document.getElementById('app');
      
      switch(currentPage) {
        case 'home':
          app.innerHTML = renderHome();
          break;
        case 'marketplace':
          app.innerHTML = renderMarketplace();
          break;
        case 'create':
          app.innerHTML = renderCreate();
          break;
        case 'gallery':
          app.innerHTML = renderGallery();
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
        </section>
      \`;
    }
    
    function renderMarketplace() {
      return \`
        <h2 class="section-title">Marketplace</h2>
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="sale">For Sale</button>
          <button class="filter-btn" data-filter="auction">Auctions</button>
          <button class="filter-btn" data-filter="art">Art</button>
        </div>
        <div class="nft-grid" id="marketplaceGrid"></div>
      \`;
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
        </div>
      \`;
    }
    
    function renderGallery() {
      return \`
        <h2 class="section-title">My Gallery</h2>
        <div class="nft-grid" id="galleryGrid"></div>
      \`;
    }
    
    // Fetch NFTs from worker
    async function fetchNFTs() {
      try {
        const response = await fetch('/api/nfts');
        nfts = await response.json();
        renderNFTs();
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      }
    }
    
    function renderNFTs() {
      const featuredGrid = document.getElementById('featuredGrid');
      const marketplaceGrid = document.getElementById('marketplaceGrid');
      const galleryGrid = document.getElementById('galleryGrid');
      
      const nftCards = nfts.map(nft => createNFTCard(nft)).join('');
      
      if (featuredGrid) featuredGrid.innerHTML = nftCards;
      if (marketplaceGrid) marketplaceGrid.innerHTML = nftCards;
      if (galleryGrid) galleryGrid.innerHTML = nftCards.length ? nftCards : '<p style="color: var(--gray); grid-column: 1/-1; text-align: center;">No NFTs in gallery yet</p>';
    }
    
    function createNFTCard(nft) {
      const status = nft.auction ? 'Auction' : (nft.forSale ? 'For Sale' : 'Not for Sale');
      const statusClass = nft.auction ? 'auction' : '';
      
      return \`
        <div class="nft-card" onclick="openModal('\${nft.id}')">
          <img src="\${nft.image}" alt="\${nft.name}" class="nft-image">
          <div class="nft-info">
            <h3 class="nft-name">\${nft.name}</h3>
            <p class="nft-creator">by \${nft.creator}</p>
            <div class="nft-footer">
              <span class="nft-price">\${nft.price} ETH</span>
              <span class="nft-status \${statusClass}">\${status}</span>
            </div>
          </div>
        </div>
      \`;
    }
    
    // Modal functions
    function openModal(nftId) {
      selectedNFT = nfts.find(n => n.id === nftId);
      if (!selectedNFT) return;
      
      document.getElementById('modalImage').src = selectedNFT.image;
      document.getElementById('modalTitle').textContent = selectedNFT.name;
      document.getElementById('modalDescription').textContent = selectedNFT.description;
      document.getElementById('modalCreator').textContent = selectedNFT.creator;
      document.getElementById('modalOwner').textContent = selectedNFT.owner;
      document.getElementById('modalPrice').textContent = selectedNFT.price + ' ETH';
      document.getElementById('modalStatus').textContent = selectedNFT.auction ? 'On Auction' : (selectedNFT.forSale ? 'For Sale' : 'Not Listed');
      
      document.getElementById('modal').classList.add('active');
    }
    
    function closeModal() {
      document.getElementById('modal').classList.remove('active');
      selectedNFT = null;
    }
    
    // Close modal on overlay click
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
    
    function buyNFT() {
      if (!selectedNFT) return;
      showToast(\`Purchasing \${selectedNFT.name}...\`);
      setTimeout(() => {
        showToast('Purchase simulation: NFT acquired!');
        closeModal();
      }, 2000);
    }
    
    // Form handling
    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'createForm') {
        e.preventDefault();
        const formData = new FormData(e.target);
        const nft = {
          name: formData.get('name'),
          description: formData.get('description'),
          image: formData.get('image'),
          price: parseFloat(formData.get('price')),
          forSale: formData.get('forSale') === 'yes',
          auction: false
        };
        
        try {
          const response = await fetch('/api/nfts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nft)
          });
          
          if (response.ok) {
            showToast('NFT created successfully!');
            e.target.reset();
            navigate('marketplace');
          }
        } catch (error) {
          showToast('Error creating NFT');
        }
      }
    });
    
    // Toast
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
    
    // Filter buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      }
    });
    
    // Initialize
    fetchNFTs();
  </script>
</body>
</html>`;

const API_HTML = `{
  "error": "API endpoint"
}`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Initialize sample data
    initializeSampleData();
    
    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
      return await handleAPI(request, url, nfts, users);
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
    
    // Service Worker
    if (url.pathname === '/sw.js') {
      return new Response(SW_CODE, {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    
    // 404 for other routes
    return new Response('Not Found', { status: 404 });
  }
};

async function handleAPI(request: Request, url: URL, nfts: Map<string, NFT>, users: Map<string, User>): Promise<Response> {
  const path = url.pathname;
  
  // GET /api/nfts - List all NFTs
  if (path === '/api/nfts' && request.method === 'GET') {
    const nftList = Array.from(nfts.values()).sort((a, b) => b.createdAt - a.createdAt);
    return new Response(JSON.stringify(nftList), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // POST /api/nfts - Create new NFT
  if (path === '/api/nfts' && request.method === 'POST') {
    try {
      const data = await request.json() as Partial<NFT>;
      const id = String(nfts.size + 1);
      const newNFT: NFT = {
        id,
        name: data.name || 'Untitled',
        description: data.description || '',
        image: data.image || '',
        creator: '0x0000...0000',
        owner: '0x0000...0000',
        price: data.price || 0,
        forSale: data.forSale || false,
        auction: data.auction || false,
        createdAt: Date.now(),
        tags: data.tags || []
      };
      nfts.set(id, newNFT);
      return new Response(JSON.stringify(newNFT), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
  }
  
  // GET /api/nfts/:id - Get single NFT
  const nftMatch = path.match(/^\/api\/nfts\/(.+)$/);
  if (nftMatch && request.method === 'GET') {
    const nft = nfts.get(nftMatch[1]);
    if (nft) {
      return new Response(JSON.stringify(nft), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('NFT not found', { status: 404 });
  }
  
  // GET /api/users - List users
  if (path === '/api/users' && request.method === 'GET') {
    const userList = Array.from(users.values());
    return new Response(JSON.stringify(userList), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('API endpoint not found', { status: 404 });
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

const SW_CODE = `// Service Worker for NFT.etheroi PWA
const CACHE_NAME = 'nft-etheroi-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});`;
