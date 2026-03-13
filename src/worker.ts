/**
 * NFT.etheroi - Cloudflare Worker
 * Platform for creating, buying, selling and collecting unique digital objects
 * With real blockchain integration
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
  DB: D1Database;
  ETHEREUM_RPC: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
      return await handleAPI(request, url, env);
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

// In-memory session store
const sessions: Map<string, { userId: string; walletAddress: string; expires: number }> = new Map();

// In-memory auction store (fallback when D1 unavailable)
interface Auction {
  id: string;
  title: string;
  description: string;
  image_url: string;
  starting_price: number;
  current_price: number;
  highest_bidder_id: string | null;
  highest_bidder_name: string | null;
  creator_id: string;
  creator_name: string;
  start_time: number;
  end_time: number;
  status: string;
  bid_count: number;
  created_at: number;
}

interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  timestamp: number;
}

const auctionsStore: Map<string, Auction> = new Map();
const bidsStore: Map<string, Bid[]> = new Map();

function createSession(userId: string, walletAddress: string = ''): string {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId, walletAddress, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return sessionId;
}

function validateSession(sessionId: string): { userId: string; walletAddress: string; expires: number } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function destroySession(sessionId: string) {
  sessions.delete(sessionId);
}

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

// Blockchain utilities
async function getEthBalance(address: string, rpcUrl: string): Promise<string> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1
      })
    });
    
    const jsonData = await response.json() as { result?: string };
    if (jsonData.result) {
      // Convert from hex to decimal ETH
      const balanceWei = parseInt(jsonData.result, 16);
      const balanceEth = balanceWei / 1e18;
      return balanceEth.toFixed(6);
    }
    return '0';
  } catch (error) {
    console.error('Error fetching balance:', error);
    return '0';
  }
}

async function handleAPI(request: Request, url: URL, env: Env): Promise<Response> {
  const path = url.pathname;
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  // Get session
  const cookieHeader = request.headers.get('Cookie') || '';
  const sessionId = cookieHeader.match(/session=([^;]+)/)?.[1] || '';
  let session = validateSession(sessionId);
  let sessionUserId = session?.userId || '';
  let sessionWalletAddress = session?.walletAddress || '';
  
  // POST /api/auth/register
  if (path === '/api/auth/register' && request.method === 'POST') {
    try {
      const body = await request.json() as { email: string; password: string; username?: string };
      
      if (!body.email || !body.password) {
        return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400, headers });
      }
      
      try {
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(body.email).first();
        
        if (existing) {
          return new Response(JSON.stringify({ error: 'Email already registered' }), { status: 400, headers });
        }
        
        const userId = crypto.randomUUID();
        const passwordHash = hashPassword(body.password);
        
        await env.DB.prepare(
          'INSERT INTO users (id, email, password, username, wallet_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(userId, body.email, passwordHash, body.username || body.email.split('@')[0], '', Date.now()).run();
        
        console.log('User registered in D1:', userId, body.email);
        
        const newSessionId = createSession(userId);
        
        return new Response(JSON.stringify({ 
          success: true, 
          user: { id: userId, email: body.email, username: body.username || body.email.split('@')[0], walletAddress: '' }
        }), { 
          status: 201, 
          headers: { ...headers, 'Set-Cookie': `session=${newSessionId}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}` }
        });
        
      } catch (d1Error: any) {
        console.error('D1 Error:', d1Error?.message || d1Error);
        const newSessionId = createSession('demo_' + Date.now());
        return new Response(JSON.stringify({ 
          success: true, 
          demo: true,
          user: { id: 'demo', email: body.email, username: body.username || body.email.split('@')[0], walletAddress: '' }
        }), { 
          status: 201, 
          headers: { ...headers, 'Set-Cookie': `session=${newSessionId}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}` }
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // POST /api/auth/login
  if (path === '/api/auth/login' && request.method === 'POST') {
    try {
      const body = await request.json() as { email: string; password: string };
      
      if (!body.email || !body.password) {
        return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400, headers });
      }
      
      try {
        const user = await env.DB.prepare(
          'SELECT id, email, username, wallet_address FROM users WHERE email = ? AND password = ?'
        ).bind(body.email, hashPassword(body.password)).first() as { id: string; email: string; username: string; wallet_address: string } | undefined;
        
        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers });
        }
        
        const newSessionId = createSession(user.id, user.wallet_address || '');
        
        return new Response(JSON.stringify({ 
          success: true, 
          user: { id: user.id, email: user.email, username: user.username, walletAddress: user.wallet_address || '' }
        }), { 
          headers: { ...headers, 'Set-Cookie': `session=${newSessionId}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}` }
        });
        
      } catch {
        if (body.email === 'developerjeremylive@gmail.com' && body.password === '123123') {
          const newSessionId = createSession('demo_user', '');
          return new Response(JSON.stringify({ 
            success: true, 
            demo: true,
            user: { id: 'demo_user', email: body.email, username: 'Developer', walletAddress: '' }
          }), { 
            headers: { ...headers, 'Set-Cookie': `session=${newSessionId}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}` }
          });
        }
        return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // POST /api/auth/logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    destroySession(sessionId);
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...headers, 'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0' }
    });
  }
  
  // GET /api/auth/me
  if (path === '/api/auth/me' && request.method === 'GET') {
    if (!session) {
      return new Response(JSON.stringify({ authenticated: false }), { headers });
    }
    
    try {
      const user = await env.DB.prepare(
        'SELECT id, email, username, wallet_address FROM users WHERE id = ?'
      ).bind(sessionUserId).first() as { id: string; email: string; username: string; wallet_address: string } | undefined;
      
      if (!user) {
        return new Response(JSON.stringify({ authenticated: false }), { headers });
      }
      
      return new Response(JSON.stringify({ 
        authenticated: true,
        user: { id: user.id, email: user.email, username: user.username, walletAddress: user.wallet_address || '' }
      }), { headers });
      
    } catch {
      return new Response(JSON.stringify({ 
        authenticated: true,
        demo: true,
        user: { id: sessionUserId, email: 'developerjeremylive@gmail.com', username: 'Developer', walletAddress: sessionWalletAddress || '' }
      }), { headers });
    }
  }
  
  // PUT /api/auth/profile
  if (path === '/api/auth/profile' && request.method === 'PUT') {
    if (!session) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers });
    }
    
    try {
      const body = await request.json() as { username?: string; email?: string; password?: string };
      
      try {
        if (body.username) {
          await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(body.username, sessionUserId).run();
        }
        if (body.email) {
          await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(body.email, sessionUserId).run();
        }
        if (body.password) {
          await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashPassword(body.password), sessionUserId).run();
        }
        
        const user = await env.DB.prepare(
          'SELECT id, email, username, wallet_address FROM users WHERE id = ?'
        ).bind(sessionUserId).first() as { id: string; email: string; username: string; wallet_address: string };
        
        return new Response(JSON.stringify({ success: true, user }), { headers });
        
      } catch {
        return new Response(JSON.stringify({ success: true, demo: true }), { headers });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // PUT /api/auth/wallet - Connect wallet (stores address in session/DB)
  if (path === '/api/auth/wallet' && request.method === 'PUT') {
    if (!session) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers });
    }
    
    try {
      const body = await request.json() as { walletAddress: string };
      
      // Update session
      sessionWalletAddress = body.walletAddress;
      sessions.set(sessionId, session);
      
      // Update D1 if available
      try {
        await env.DB.prepare('UPDATE users SET wallet_address = ? WHERE id = ?').bind(body.walletAddress, sessionUserId).run();
      } catch {}
      
      return new Response(JSON.stringify({ success: true, walletAddress: body.walletAddress }), { headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // GET /api/wallet/balance - Get real balance from blockchain
  if (path === '/api/wallet/balance' && request.method === 'GET') {
    const address = url.searchParams.get('address');
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return new Response(JSON.stringify({ error: 'Invalid address' }), { status: 400, headers });
    }
    
    const rpcUrl = env.ETHEREUM_RPC || 'https://eth.llamarpc.com';
    const balance = await getEthBalance(address, rpcUrl);
    
    return new Response(JSON.stringify({
      balance: balance,
      address: address,
      network: 'Ethereum Mainnet',
      lastUpdated: new Date().toISOString()
    }), { headers });
  }
  
  // GET /api/wallet/balance - Get real balance from blockchain (POST with body)
  if (path === '/api/wallet/balance' && request.method === 'POST') {
    try {
      const body = await request.json() as { address: string };
      
      if (!body.address || !body.address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return new Response(JSON.stringify({ error: 'Invalid address' }), { status: 400, headers });
      }
      
      const rpcUrl = env.ETHEREUM_RPC || 'https://eth.llamarpc.com';
      const balance = await getEthBalance(body.address, rpcUrl);
      
      return new Response(JSON.stringify({
        balance: balance,
        address: body.address,
        network: 'Ethereum Mainnet',
        lastUpdated: new Date().toISOString()
      }), { headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // GET /api/nfts
  if (path === '/api/nfts' && request.method === 'GET') {
    const sampleNFTs = getSampleNFTs();
    return new Response(JSON.stringify(sampleNFTs), { headers });
  }
  
  // POST /api/nfts
  if (path === '/api/nfts' && request.method === 'POST') {
    return new Response(JSON.stringify({ success: true, message: 'NFT stored locally' }), { headers });
  }
  
  // ==================== AUCTIONS API ====================
  
  // Helper: Update auction status based on end time
  function updateAuctionStatus(auction: any): any {
    const now = Date.now();
    if (auction.status === 'active' && now > auction.end_time) {
      return { ...auction, status: 'ended' };
    }
    return auction;
  }
  
  // GET /api/auctions - List all auctions
  if (path === '/api/auctions' && request.method === 'GET') {
    try {
      const statusFilter = url.searchParams.get('status');
      let query = 'SELECT * FROM auctions';
      const params: any[] = [];
      
      if (statusFilter) {
        query += ' WHERE status = ?';
        params.push(statusFilter);
      }
      
      query += ' ORDER BY end_time ASC';
      
      let auctions: any[] = [];
      
      try {
        const { results } = await env.DB.prepare(query).bind(...params).run();
        auctions = (results || []).map(updateAuctionStatus);
      } catch (d1Error) {
        console.log('D1 Error fetching auctions, using memory:', d1Error);
      }
      
      // Add in-memory auctions to the list
      const memoryAuctions = Array.from(auctionsStore.values()).map(updateAuctionStatus);
      if (memoryAuctions.length > 0) {
        // Merge, avoiding duplicates by ID
        const existingIds = new Set(auctions.map(a => a.id));
        for (const memAuction of memoryAuctions) {
          if (!existingIds.has(memAuction.id)) {
            // Apply filter if specified
            if (!statusFilter || memAuction.status === statusFilter) {
              auctions.push(memAuction);
            }
          }
        }
      }
      
      // If still no auctions, return demo data (filtered)
      if (auctions.length === 0) {
        let demoAuctions = getSampleAuctions().map(updateAuctionStatus);
        if (statusFilter && statusFilter !== 'all') {
          demoAuctions = demoAuctions.filter(a => a.status === statusFilter);
        }
        auctions = demoAuctions;
      }
      
      // Apply filter to merged results if not already done
      if (statusFilter && statusFilter !== 'all') {
        auctions = auctions.filter(a => a.status === statusFilter);
      }
      
      // Sort by end time
      auctions.sort((a, b) => a.end_time - b.end_time);
      
      return new Response(JSON.stringify(auctions), { headers });
    } catch (err) {
      console.error('Error fetching auctions:', err);
      return new Response(JSON.stringify(getSampleAuctions()), { headers });
    }
  }
  
  // POST /api/auctions - Create new auction
  if (path === '/api/auctions' && request.method === 'POST') {
    if (!sessionUserId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
    }
    
    try {
      const body = await request.json() as {
        title: string;
        description: string;
        imageUrl: string;
        startingPrice: number;
        durationHours: number;
      };
      
      if (!body.title || !body.startingPrice) {
        return new Response(JSON.stringify({ error: 'Title and starting price required' }), { status: 400, headers });
      }
      
      const now = Date.now();
      const auctionId = crypto.randomUUID();
      const endTime = now + (body.durationHours || 24) * 3600000;
      
      // Get user info
      let creatorName = 'Anonymous';
      try {
        const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(sessionUserId).first() as { username: string } | undefined;
        if (user) creatorName = user.username;
      } catch {}
      
      const auction: Auction = {
        id: auctionId,
        title: body.title,
        description: body.description || '',
        image_url: body.imageUrl || `https://picsum.photos/seed/${auctionId}/400/400`,
        starting_price: body.startingPrice,
        current_price: body.startingPrice,
        highest_bidder_id: null,
        highest_bidder_name: null,
        creator_id: sessionUserId,
        creator_name: creatorName,
        start_time: now,
        end_time: endTime,
        status: 'active',
        bid_count: 0,
        created_at: now
      };
      
      // Try to save to D1 first
      let d1Success = false;
      try {
        await env.DB.prepare(`
          INSERT INTO auctions (id, title, description, image_url, starting_price, current_price, highest_bidder_id, highest_bidder_name, creator_id, creator_name, start_time, end_time, status, bid_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          auction.id, auction.title, auction.description, auction.image_url,
          auction.starting_price, auction.current_price, auction.highest_bidder_id,
          auction.highest_bidder_name, auction.creator_id, auction.creator_name,
          auction.start_time, auction.end_time, auction.status, auction.bid_count,
          auction.created_at
        ).run();
        d1Success = true;
      } catch (d1Error) {
        console.log('D1 Error creating auction, using in-memory store:', d1Error);
      }
      
      // Always save to in-memory store as backup
      auctionsStore.set(auctionId, auction);
      bidsStore.set(auctionId, []);
      
      console.log('Auction created:', auctionId, 'D1:', d1Success, 'Memory:', auctionsStore.has(auctionId));
      
      return new Response(JSON.stringify({ 
        success: true,
        auction: auction,
        storage: d1Success ? 'd1' : 'memory'
      }), { status: 201, headers });
    } catch (err) {
      console.error('Error creating auction:', err);
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // GET /api/auctions/:id - Get single auction with bids
  const auctionMatch = path.match(/^\/api\/auctions\/([^\/]+)$/);
  if (auctionMatch && request.method === 'GET') {
    const auctionId = auctionMatch[1];
    
    let auction: any = null;
    
    // Try D1 first
    try {
      auction = await env.DB.prepare('SELECT * FROM auctions WHERE id = ?').bind(auctionId).first();
    } catch (d1Error) {
      console.log('D1 Error fetching auction:', d1Error);
    }
    
    // If not in D1, check memory store
    if (!auction) {
      auction = auctionsStore.get(auctionId);
    }
    
    // If still not found, check demo auctions
    if (!auction) {
      const demoAuctions = getSampleAuctions();
      const demo = demoAuctions.find(a => a.id === auctionId);
      if (demo) return new Response(JSON.stringify(demo), { headers });
      return new Response(JSON.stringify({ error: 'Auction not found' }), { status: 404, headers });
    }
    
    // Get bids for this auction
    let bids: any[] = [];
    
    // Try D1 first
    try {
      const { results } = await env.DB.prepare('SELECT * FROM bids WHERE auction_id = ? ORDER BY amount DESC').bind(auctionId).run();
      bids = results || [];
    } catch {}
    
    // Add memory bids
    const memoryBids = bidsStore.get(auctionId) || [];
    if (memoryBids.length > 0) {
      const existingIds = new Set(bids.map(b => b.id));
      for (const memBid of memoryBids) {
        if (!existingIds.has(memBid.id)) {
          bids.push(memBid);
        }
      }
      // Sort by amount descending
      bids.sort((a, b) => b.amount - a.amount);
    }
    
    return new Response(JSON.stringify({ ...auction, bids }), { headers });
  }
  
  // POST /api/auctions/:id/bid - Place a bid
  const bidMatch = path.match(/^\/api\/auctions\/([^\/]+)\/bid$/);
  if (bidMatch && request.method === 'POST') {
    if (!sessionUserId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
    }
    
    const auctionId = bidMatch[1];
    
    try {
      const body = await request.json() as { amount: number };
      const amount = body.amount;
      
      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Valid amount required' }), { status: 400, headers });
      }
      
      // Get current auction - try D1 first, then memory, then demo
      let auction: any = null;
      try {
        auction = await env.DB.prepare('SELECT * FROM auctions WHERE id = ?').bind(auctionId).first();
      } catch {}
      
      if (!auction) {
        auction = auctionsStore.get(auctionId);
      }
      
      if (!auction) {
        // Check demo auctions
        const demoAuctions = getSampleAuctions();
        auction = demoAuctions.find(a => a.id === auctionId);
        if (!auction) return new Response(JSON.stringify({ error: 'Auction not found' }), { status: 404, headers });
      }
      
      if (auction.status !== 'active') {
        return new Response(JSON.stringify({ error: 'Auction is not active' }), { status: 400, headers });
      }
      
      if (Date.now() > auction.end_time) {
        return new Response(JSON.stringify({ error: 'Auction has ended' }), { status: 400, headers });
      }
      
      if (amount <= auction.current_price) {
        return new Response(JSON.stringify({ error: 'Bid must be higher than current price' }), { status: 400, headers });
      }
      
      // Get bidder info
      let bidderName = 'Anonymous';
      try {
        const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(sessionUserId).first() as { username: string } | undefined;
        if (user) bidderName = user.username;
      } catch {}
      
      const bidId = crypto.randomUUID();
      const bid: Bid = {
        id: bidId,
        auction_id: auctionId,
        bidder_id: sessionUserId,
        bidder_name: bidderName,
        amount: amount,
        timestamp: Date.now()
      };
      
      // Save bid to D1 and memory
      try {
        await env.DB.prepare(`
          INSERT INTO bids (id, auction_id, bidder_id, bidder_name, amount, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(bid.id, bid.auction_id, bid.bidder_id, bid.bidder_name, bid.amount, bid.timestamp).run();
        
        // Update auction in D1
        await env.DB.prepare(`
          UPDATE auctions SET current_price = ?, highest_bidder_id = ?, highest_bidder_name = ?, bid_count = bid_count + 1 WHERE id = ?
        `).bind(amount, sessionUserId, bidderName, auctionId).run();
      } catch (d1Error) {
        console.log('D1 Error placing bid, using memory:', d1Error);
      }
      
      // Always update in-memory store
      const existingBids = bidsStore.get(auctionId) || [];
      existingBids.push(bid);
      bidsStore.set(auctionId, existingBids);
      
      // Update auction in memory
      if (auctionsStore.has(auctionId)) {
        const memAuction = auctionsStore.get(auctionId)!;
        memAuction.current_price = amount;
        memAuction.highest_bidder_id = sessionUserId;
        memAuction.highest_bidder_name = bidderName;
        memAuction.bid_count = (memAuction.bid_count || 0) + 1;
      }
      
      return new Response(JSON.stringify({ 
        bid, 
        auction: { ...auction, current_price: amount, highest_bidder_id: sessionUserId, highest_bidder_name: bidderName } 
      }), { headers });
    } catch (err) {
      console.error('Error placing bid:', err);
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
    }
  }
  
  // GET /api/auctions/user/bids - Get current user's bids
  if (path === '/api/auctions/user/bids' && request.method === 'GET') {
    if (!sessionUserId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
    }
    
    try {
      let bids: any[] = [];
      
      // Get D1 bids
      try {
        const { results } = await env.DB.prepare('SELECT * FROM bids WHERE bidder_id = ? ORDER BY timestamp DESC').bind(sessionUserId).run();
        bids = results || [];
      } catch {}
      
      // Get memory bids
      const memoryBids: any[] = [];
      for (const [auctionId, auctionBids] of bidsStore) {
        for (const bid of auctionBids) {
          if (bid.bidder_id === sessionUserId) {
            memoryBids.push(bid);
          }
        }
      }
      
      // Merge bids, avoiding duplicates
      const existingIds = new Set(bids.map(b => b.id));
      for (const memBid of memoryBids) {
        if (!existingIds.has(memBid.id)) {
          bids.push(memBid);
        }
      }
      
      // Sort by timestamp descending
      bids.sort((a, b) => b.timestamp - a.timestamp);
      
      // Enrich with auction data
      const enrichedBids = await Promise.all(bids.map(async (bid: any) => {
        // Try D1 first
        let auction: any = null;
        try {
          auction = await env.DB.prepare('SELECT * FROM auctions WHERE id = ?').bind(bid.auction_id).first();
        } catch {}
        
        // Try memory if not found
        if (!auction) {
          auction = auctionsStore.get(bid.auction_id);
        }
        
        // Try demo if still not found
        if (!auction) {
          const demoAuctions = getSampleAuctions();
          auction = demoAuctions.find(a => a.id === bid.auction_id);
        }
        
        return { ...bid, auction };
      }));
      
      return new Response(JSON.stringify(enrichedBids), { headers });
    } catch (err) {
      console.error('Error fetching user bids:', err);
      return new Response(JSON.stringify({ error: 'Failed to fetch bids' }), { status: 500, headers });
    }
  }
  
  // GET /api/auctions/user - Get current user info with balance
  if (path === '/api/auctions/user' && request.method === 'GET') {
    let user = { id: sessionUserId || 'guest', username: 'Guest', email: '', walletBalance: 10000, createdAt: Date.now() };
    
    if (sessionUserId) {
      try {
        const dbUser = await env.DB.prepare('SELECT id, username, email, wallet_address, created_at FROM users WHERE id = ?').bind(sessionUserId).first() as any;
        if (dbUser) {
          user = { ...dbUser, walletBalance: 10000, createdAt: dbUser.created_at };
        }
      } catch {}
    }
    
    return new Response(JSON.stringify(user), { headers });
  }
  
  return new Response('API endpoint not found', { status: 404 });
}

function getSampleNFTs(): NFT[] {
  return [
    { id: "1", name: "Cosmic Dreams #001", description: "A mesmerizing digital artwork exploring the depths of cosmic consciousness", image: "https://picsum.photos/seed/nft1/400/400", creator: "0x1234...abcd", owner: "0x1234...abcd", price: 0.5, forSale: true, auction: false, createdAt: Date.now() - 86400000 * 5, tags: ["art", "cosmic"] },
    { id: "2", name: "Digital Genesis", description: "The beginning of a new digital era", image: "https://picsum.photos/seed/nft2/400/400", creator: "0x5678...efgh", owner: "0x5678...efgh", price: 1.2, forSale: true, auction: true, auctionEnd: Date.now() + 86400000 * 2, createdAt: Date.now() - 86400000 * 3, tags: ["art", "genesis"] },
    { id: "3", name: "Neon Samurai", description: "Traditional Japanese art with cyberpunk aesthetics", image: "https://picsum.photos/seed/nft3/400/400", creator: "0x9abc...ijkl", owner: "0x9abc...ijkl", price: 2.5, forSale: true, auction: false, createdAt: Date.now() - 86400000 * 7, tags: ["art", "samurai"] },
    { id: "4", name: "Ethereal Portals", description: "Gates to other dimensions", image: "https://picsum.photos/seed/nft4/400/400", creator: "0xmnop...qrst", owner: "0xmnop...qrst", price: 0.8, forSale: true, auction: false, createdAt: Date.now() - 86400000 * 2, tags: ["art", "portal"] },
    { id: "5", name: "Blockchain Harmony", description: "Visual representation of decentralized harmony", image: "https://picsum.photos/seed/nft5/400/400", creator: "0xuvwx...yz12", owner: "0xuvwx...yz12", price: 3.0, forSale: true, auction: true, auctionEnd: Date.now() + 86400000 * 1, createdAt: Date.now() - 86400000 * 10, tags: ["art", "blockchain"] },
    { id: "6", name: "Virtual Reality Dreams", description: "Where virtual meets reality", image: "https://picsum.photos/seed/nft6/400/400", creator: "0x3456...7890", owner: "0x3456...7890", price: 1.5, forSale: true, auction: false, createdAt: Date.now() - 86400000 * 1, tags: ["art", "vr"] }
  ];
}

function getSampleAuctions(): any[] {
  const now = Date.now();
  return [
    {
      id: "auction-1",
      title: "Ethereal Genesis #001",
      description: "The first piece of the Ethereal Genesis collection. A unique digital masterpiece representing the dawn of a new era in digital art.",
      image_url: "https://picsum.photos/seed/ethereal1/800/600",
      starting_price: 1000,
      current_price: 2500,
      highest_bidder_id: "user-1",
      highest_bidder_name: "CryptoKing",
      creator_id: "user-3",
      creator_name: "DigitalArtist",
      start_time: now - 86400000 * 2,
      end_time: now + 86400000 * 3,
      status: "active",
      bid_count: 5,
      created_at: now - 86400000 * 2
    },
    {
      id: "auction-2",
      title: "Neon Dreams Collection",
      description: "A stunning cyberpunk-inspired digital artwork featuring vibrant neon colors and futuristic cityscapes.",
      image_url: "https://picsum.photos/seed/neon2/800/600",
      starting_price: 500,
      current_price: 1200,
      highest_bidder_id: "user-2",
      highest_bidder_name: "NFTHunter",
      creator_id: "user-3",
      creator_name: "DigitalArtist",
      start_time: now - 86400000,
      end_time: now + 86400000 * 5,
      status: "active",
      bid_count: 8,
      created_at: now - 86400000
    },
    {
      id: "auction-3",
      title: "Abstract Quantum #047",
      description: "A mesmerizing abstract piece created using quantum algorithms. Each viewing reveals new patterns and depth.",
      image_url: "https://picsum.photos/seed/quantum3/800/600",
      starting_price: 2000,
      current_price: 3200,
      highest_bidder_id: null,
      highest_bidder_name: null,
      creator_id: "user-3",
      creator_name: "DigitalArtist",
      start_time: now - 86400000 * 3,
      end_time: now + 86400000 * 1,
      status: "active",
      bid_count: 3,
      created_at: now - 86400000 * 3
    },
    {
      id: "auction-4",
      title: "Cosmic Voyage",
      description: "An immersive journey through space and time. Winner of the Digital Art Excellence Award 2025.",
      image_url: "https://picsum.photos/seed/cosmic4/800/600",
      starting_price: 5000,
      current_price: 7500,
      highest_bidder_id: "user-1",
      highest_bidder_name: "CryptoKing",
      creator_id: "user-3",
      creator_name: "DigitalArtist",
      start_time: now - 86400000 * 5,
      end_time: now - 86400000,
      status: "ended",
      bid_count: 12,
      created_at: now - 86400000 * 5
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
  "icons": [{ "src": "/images/icon-192.png", "sizes": "192x192", "type": "image/png" }, { "src": "/images/icon-512.png", "sizes": "512x512", "type": "image/png" }]
}, null, 2);

const SW_CODE = `const CACHE_NAME = 'nft-etheroi-v1';
const urlsToCache = ['/', '/index.html', '/manifest.json'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => {
    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
  }))));
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

// The HTML content is very long, let me create it properly
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="NFT.etheroi - Create, buy, sell and collect unique digital objects">
  <meta name="theme-color" content="#6C63FF">
  <title>NFT.etheroi - Digital Art Marketplace</title>
  <link rel="manifest" href="/manifest.json">
  <script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js"></script>
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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: var(--darker); color: var(--light); min-height: 100vh; line-height: 1.6; }
    
    .bg-animation { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; overflow: hidden; }
    .bg-animation::before { content: ''; position: absolute; width: 200%; height: 200%; background: radial-gradient(circle at 20% 80%, rgba(108, 99, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0, 212, 170, 0.1) 0%, transparent 50%), radial-gradient(circle at 40% 40%, rgba(108, 99, 255, 0.08) 0%, transparent 40%); animation: bgMove 20s ease-in-out infinite; }
    @keyframes bgMove { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(-5%, -5%) rotate(5deg); } }
    
    header { 
      background: linear-gradient(180deg, rgba(15, 15, 26, 0.95) 0%, rgba(26, 26, 46, 0.85) 100%); 
      backdrop-filter: blur(20px); 
      padding: 0.8rem 2rem; 
      position: fixed; 
      top: 0; 
      left: 0; 
      right: 0; 
      z-index: 100; 
      border-bottom: 1px solid rgba(108, 99, 255, 0.3);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
    }
    header::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--primary), var(--secondary), var(--primary), transparent);
    }
    .header-content { max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .logo { 
      font-size: 1.6rem; 
      font-weight: 700; 
      background: linear-gradient(135deg, #fff 0%, var(--primary) 50%, var(--secondary) 100%); 
      -webkit-background-clip: text; 
      -webkit-text-fill-color: transparent; 
      background-clip: text; 
      text-decoration: none; 
      cursor: pointer; 
      transition: all 0.3s;
      text-shadow: 0 0 30px rgba(108, 99, 255, 0.5);
    }
    .logo:hover { 
      transform: scale(1.08); 
      filter: drop-shadow(0 0 10px rgba(108, 99, 255, 0.8));
    }
    .logo span { font-weight: 300; }
    nav { display: flex; gap: 0.5rem; align-items: center; }
    nav a { 
      color: rgba(255, 255, 255, 0.7); 
      text-decoration: none; 
      font-weight: 500; 
      transition: all 0.3s; 
      padding: 0.5rem 1rem; 
      border-radius: 8px;
      position: relative;
      overflow: hidden;
    }
    nav a::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      transition: width 0.3s;
    }
    nav a:hover, nav a.active { 
      color: #fff; 
      background: rgba(108, 99, 255, 0.15);
    }
    nav a:hover::before, nav a.active::before {
      width: 80%;
    }
    nav .nav-dropdown { font-size: 0.7rem; margin-left: 4px; }
    #createBtn { 
      padding: 0.5rem 1.2rem; 
      font-size: 0.9rem;
      background: linear-gradient(135deg, var(--primary), #8b5cf6);
      box-shadow: 0 4px 15px rgba(108, 99, 255, 0.4);
    }
    #createBtn:hover {
      box-shadow: 0 6px 25px rgba(108, 99, 255, 0.6);
    }
    nav .hidden { display: none !important; }
    
    .btn { padding: 0.6rem 1.5rem; border-radius: 50px; border: none; font-weight: 600; cursor: pointer; transition: all 0.3s; font-size: 0.9rem; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-dark); transform: translateY(-2px); box-shadow: 0 5px 20px rgba(108, 99, 255, 0.4); }
    .btn-secondary { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
    .btn-secondary:hover { background: var(--primary); color: white; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-success { background: var(--success); color: var(--darker); }
    .btn-small { padding: 0.4rem 1rem; font-size: 0.8rem; }
    
    main { padding-top: 100px; max-width: 1400px; margin: 0 auto; padding-left: 2rem; padding-right: 2rem; padding-bottom: 4rem; }
    
    .hero { text-align: center; padding: 4rem 0; }
    .hero h1 { font-size: 3.5rem; margin-bottom: 1rem; line-height: 1.2; }
    .hero h1 span { background: linear-gradient(135deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero p { font-size: 1.2rem; color: var(--gray); max-width: 600px; margin: 0 auto 2rem; }
    .hero-buttons { display: flex; gap: 1rem; justify-content: center; }
    
    .filters { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .filter-btn { padding: 0.5rem 1.2rem; border-radius: 50px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: var(--gray); cursor: pointer; transition: all 0.3s; }
    .filter-btn:hover, .filter-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
    
    .nft-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
    .nft-card { background: rgba(255, 255, 255, 0.03); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05); transition: all 0.3s; cursor: pointer; }
    .nft-card:hover { transform: translateY(-10px); border-color: var(--primary); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3); }
    .nft-image { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .nft-info { padding: 1.2rem; }
    .nft-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; }
    .nft-creator { font-size: 0.85rem; color: var(--gray); margin-bottom: 1rem; }
    .nft-footer { display: flex; justify-content: space-between; align-items: center; }
    .nft-price { font-size: 1rem; font-weight: 700; color: var(--secondary); }
    .nft-status { font-size: 0.75rem; padding: 0.3rem 0.8rem; border-radius: 20px; background: rgba(0, 212, 170, 0.2); color: var(--secondary); }
    .nft-status.auction { background: rgba(255, 107, 107, 0.2); color: var(--danger); }
    
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: none; justify-content: center; align-items: center; z-index: 200; padding: 2rem; }
    .modal-overlay.active { display: flex; }
    .modal { background: var(--dark); border-radius: 24px; max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; position: relative; animation: modalIn 0.3s ease; }
    @keyframes modalIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    .modal-image { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .modal-content { padding: 2rem; }
    .modal-close { position: absolute; top: 1rem; right: 1rem; background: rgba(0, 0, 0, 0.5); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.5rem; }
    .modal h2 { font-size: 2rem; margin-bottom: 0.5rem; }
    .modal-description { color: var(--gray); margin-bottom: 1.5rem; }
    .modal-details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .detail-item { background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 12px; }
    .detail-label { font-size: 0.8rem; color: var(--gray); margin-bottom: 0.3rem; }
    .detail-value { font-weight: 600; }
    
    .section-title { font-size: 2rem; margin-bottom: 2rem; display: flex; align-items: center; gap: 1rem; }
    .section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--primary), transparent); }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .section-header .section-title { margin-bottom: 0; }
    .btn-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 1rem; font-weight: 500; transition: color 0.3s; }
    .btn-link:hover { color: var(--secondary); }
    
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; padding: 4rem 0; }
    .feature-card { background: rgba(255, 255, 255, 0.03); border-radius: 20px; padding: 2rem; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05); transition: all 0.3s; }
    .feature-card:hover { border-color: var(--primary); transform: translateY(-5px); }
    .feature-icon { font-size: 3rem; margin-bottom: 1rem; }
    .feature-card h3 { margin-bottom: 0.5rem; }
    .feature-card p { color: var(--gray); font-size: 0.9rem; }
    
    .create-section, .profile-section { max-width: 600px; margin: 0 auto; padding: 2rem; background: rgba(255, 255, 255, 0.03); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.05); }
    .form-group { margin-bottom: 1.5rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 1rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: var(--light); font-size: 1rem; }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline: none; border-color: var(--primary); }
    
    footer { 
      background: linear-gradient(180deg, rgba(15, 15, 26, 0.98) 0%, rgba(10, 10, 20, 1) 100%); 
      padding: 4rem 2rem 2rem; 
      text-align: center; 
      border-top: 1px solid rgba(108, 99, 255, 0.2);
      position: relative;
      overflow: hidden;
    }
    footer::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--primary), var(--secondary), var(--primary), transparent);
    }
    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      text-align: left;
    }
    .footer-section h4 {
      color: #fff;
      font-size: 1.1rem;
      margin-bottom: 1rem;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .footer-section p, .footer-section a {
      color: var(--gray);
      font-size: 0.9rem;
      line-height: 1.8;
    }
    .footer-section a {
      display: block;
      text-decoration: none;
      transition: color 0.3s;
    }
    .footer-section a:hover {
      color: var(--primary);
    }
    .footer-bottom {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-logo {
      font-size: 1.3rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .footer-links {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .footer-links a {
      color: var(--gray);
      text-decoration: none;
      font-size: 0.85rem;
      transition: color 0.3s;
    }
    .footer-links a:hover {
      color: var(--primary);
    }
    .footer-social {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    .footer-social a {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(108, 99, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      transition: all 0.3s;
    }
    .footer-social a:hover {
      background: var(--primary);
      transform: translateY(-3px);
      box-shadow: 0 5px 20px rgba(108, 99, 255, 0.4);
    }
    footer p { color: var(--gray); }
    
    .toast { position: fixed; bottom: 2rem; right: 2rem; background: var(--primary); color: white; padding: 1rem 2rem; border-radius: 12px; transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 300; }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.error { background: var(--danger); }
    .toast.success { background: var(--success); }
    
    /* Landing Page Modal */
    .landing-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 15, 26, 0.98);
      z-index: 600;
      overflow-y: auto;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .landing-overlay.hidden { display: none; }
    .landing-modal-content {
      max-width: 100%;
      width: 100%;
    }
    
    /* Auth Modal */
    .auth-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      z-index: 700;
      display: flex;
      justify-content: center;
      align-items: center;
      animation: fadeIn 0.3s ease;
    }
    .auth-overlay.hidden { display: none; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .auth-card { background: var(--dark); border-radius: 24px; padding: 3rem; width: 100%; max-width: 420px; text-align: center; animation: modalIn 0.3s ease; }
    .auth-tabs { display: flex; margin-bottom: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .auth-tab { flex: 1; padding: 1rem; background: none; border: none; color: var(--gray); font-size: 1rem; cursor: pointer; transition: all 0.3s; }
    .auth-tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); }
    .auth-icon { font-size: 3rem; margin-bottom: 1rem; }
    .auth-card h2 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .auth-card > p { color: var(--gray); margin-bottom: 1.5rem; }
    .auth-error { color: var(--danger); font-size: 0.9rem; margin-bottom: 1rem; display: none; }
    .auth-error.show { display: block; }
    .auth-input-group { position: relative; margin-bottom: 1rem; }
    .auth-input-group input { width: 100%; padding: 1rem 1rem 1rem 3rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: var(--light); font-size: 1rem; transition: all 0.3s; }
    .auth-input-group input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(108, 99, 255, 0.2); }
    .auth-input-group::before { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--gray); font-size: 1.2rem; }
    .auth-input-email::before { content: '✉️'; }
    .auth-input-password::before { content: '🔒'; }
    .auth-input-user::before { content: '👤'; }
    
    /* Profile Section */
    .profile-tabs { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .profile-tab { padding: 0.8rem 1.5rem; border-radius: 50px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: var(--gray); cursor: pointer; transition: all 0.3s; }
    .profile-tab:hover, .profile-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
    .profile-content { display: none; }
    .profile-content.active { display: block; }
    .profile-header { display: flex; align-items: center; gap: 2rem; margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .profile-avatar { width: 80px; height: 80px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; }
    .profile-info h3 { font-size: 1.5rem; margin-bottom: 0.3rem; }
    .profile-info p { color: var(--gray); }
    
    /* Wallet Section */
    .wallet-card { background: rgba(255, 255, 255, 0.03); border-radius: 20px; padding: 2rem; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.05); }
    .wallet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .wallet-header h3 { font-size: 1.2rem; }
    .wallet-status { display: flex; align-items: center; gap: 0.5rem; }
    .wallet-status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gray); }
    .wallet-status-dot.connected { background: var(--success); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .wallet-balance { font-size: 2.5rem; font-weight: 700; color: var(--secondary); margin-bottom: 0.5rem; }
    .wallet-balance-label { color: var(--gray); font-size: 0.9rem; }
    .wallet-details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .wallet-detail { background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 12px; }
    .wallet-detail-label { font-size: 0.8rem; color: var(--gray); margin-bottom: 0.3rem; }
    .wallet-detail-value { font-weight: 600; font-size: 0.9rem; word-break: break-all; }
    .wallet-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
    .wallet-address { display: flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.05); padding: 0.8rem 1rem; border-radius: 12px; font-family: monospace; font-size: 0.9rem; }
    .wallet-connect { text-align: center; padding: 2rem; }
    .wallet-connect-icon { font-size: 4rem; margin-bottom: 1rem; }
    .wallet-connect h3 { margin-bottom: 0.5rem; }
    .wallet-connect p { color: var(--gray); margin-bottom: 1.5rem; }
    .wallet-info-card { 
      background: rgba(108, 99, 255, 0.1); 
      border: 1px solid rgba(108, 99, 255, 0.3); 
      border-radius: 16px; 
      padding: 1.5rem; 
      margin-bottom: 1.5rem; 
      text-align: left;
    }
    .wallet-info-card h4 { 
      color: var(--primary); 
      font-size: 1rem; 
      margin-bottom: 0.5rem; 
      margin-top: 1rem;
    }
    .wallet-info-card h4:first-child { margin-top: 0; }
    .wallet-info-card p { 
      color: var(--light); 
      font-size: 0.9rem; 
      line-height: 1.5; 
      margin-bottom: 0.5rem;
    }
    .wallet-info-card ul {
      margin: 0.5rem 0;
      padding-left: 1.2rem;
      color: var(--light);
      font-size: 0.9rem;
    }
    .wallet-info-card li {
      margin-bottom: 0.3rem;
    }
    .wallet-info-card strong {
      color: var(--secondary);
    }
    .btn-large {
      padding: 1rem 2rem;
      font-size: 1rem;
    }
    .wallet-supported {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .wallet-error { background: rgba(255, 107, 107, 0.1); border: 1px solid var(--danger); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; color: var(--danger); text-align: left; }
    .wallet-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; color: var(--gray); }
    .spinner { width: 20px; height: 20px; border: 2px solid rgba(255, 255, 255, 0.2); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* Landing Page Styles */
    .landing-page { margin-top: 0; }
    .landing-hero {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      padding: 8rem 2rem 6rem;
      overflow: hidden;
    }
    .hero-particles {
      position: absolute;
      inset: 0;
      background-image: 
        radial-gradient(2px 2px at 20px 30px, rgba(108, 99, 255, 0.4), transparent),
        radial-gradient(2px 2px at 40px 70px, rgba(139, 92, 246, 0.3), transparent),
        radial-gradient(1px 1px at 90px 40px, rgba(255, 255, 255, 0.3), transparent),
        radial-gradient(2px 2px at 130px 80px, rgba(108, 99, 255, 0.4), transparent),
        radial-gradient(1px 1px at 160px 120px, rgba(255, 255, 255, 0.2), transparent);
      background-size: 200px 200px;
      animation: particleFloat 20s linear infinite;
      z-index: 0;
    }
    @keyframes particleFloat {
      0% { transform: translateY(0); }
      100% { transform: translateY(-200px); }
    }
    .hero-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(108, 99, 255, 0.3) 0%, rgba(139, 92, 246, 0.15) 30%, transparent 70%);
      animation: glowPulse 4s ease-in-out infinite;
      z-index: 0;
    }
    @keyframes glowPulse {
      0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
    }
    .hero-content {
      max-width: 800px;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.5rem;
      background: rgba(108, 99, 255, 0.1);
      border: 1px solid rgba(108, 99, 255, 0.3);
      border-radius: 50px;
      color: #a5b4fc;
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 2rem;
      letter-spacing: 0.5px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulseDot 2s infinite;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
      50% { opacity: 0.8; box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
    }
    .landing-hero h1 {
      font-size: 5rem;
      font-weight: 900;
      line-height: 1.05;
      margin-bottom: 1.5rem;
      color: white;
      letter-spacing: -2px;
      text-shadow: 0 0 60px rgba(108, 99, 255, 0.3);
    }
    .gradient-text {
      background: linear-gradient(135deg, #fff 0%, var(--primary) 50%, var(--secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradientShift 5s ease infinite;
      background-size: 200% 200%;
    }
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .hero-subtitle {
      font-size: 1.35rem;
      color: rgba(255, 255, 255, 0.7);
      max-width: 550px;
      margin: 0 auto 3rem;
      line-height: 1.7;
      font-weight: 400;
    }
    .hero-cta {
      display: flex;
      justify-content: center;
      margin-bottom: 4rem;
    }
    .btn-glow {
      position: relative;
      background: linear-gradient(135deg, var(--primary), #8b5cf6);
      border: none;
      box-shadow: 0 0 30px rgba(108, 99, 255, 0.5), 0 10px 20px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    .btn-glow::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      transition: left 0.5s;
    }
    .btn-glow:hover::before {
      left: 100%;
    }
    .btn-icon {
      margin-right: 0.5rem;
    }
    .btn-large {
      padding: 1.2rem 3rem;
      font-size: 1.15rem;
    }
    .hero-value {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2rem;
      flex-wrap: wrap;
      margin-top: 2rem;
    }
    .value-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.25rem;
      background: rgba(108, 99, 255, 0.1);
      border: 1px solid rgba(108, 99, 255, 0.2);
      border-radius: 50px;
      transition: all 0.3s;
    }
    .value-item:hover {
      background: rgba(108, 99, 255, 0.2);
      transform: translateY(-2px);
    }
    .value-icon {
      font-size: 1.2rem;
    }
    .value-text {
      color: rgba(255, 255, 255, 0.9);
      font-size: 0.9rem;
      font-weight: 500;
    }
    
    .landing-features {
      padding: 8rem 2rem;
      background: linear-gradient(180deg, transparent, rgba(108, 99, 255, 0.05));
      position: relative;
    }
    .landing-features::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.5), transparent);
    }
    .landing-features .section-title {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 4rem;
    }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .feature-card-large {
      background: linear-gradient(145deg, rgba(255,255,255, 0.03), rgba(255,255,255, 0.01));
      border: 1px solid rgba(255,255,255, 0.06);
      border-radius: 24px;
      padding: 2.5rem;
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      position: relative;
      overflow: hidden;
    }
    .feature-glow {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(108, 99, 255, 0.1) 0%, transparent 50%);
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
    }
    .feature-card-large:hover .feature-glow {
      opacity: 1;
    }
    .feature-card-large::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.3), transparent);
    }
    .feature-card-large:hover {
      transform: translateY(-10px);
      border-color: rgba(108, 99, 255, 0.4);
      box-shadow: 0 25px 50px rgba(108, 99, 255, 0.2), 0 0 0 1px rgba(108, 99, 255, 0.1);
    }
    .feature-icon-large {
      font-size: 3rem;
      margin-bottom: 1.5rem;
      display: inline-block;
      padding: 1rem;
      background: rgba(108, 99, 255, 0.1);
      border-radius: 16px;
      border: 1px solid rgba(108, 99, 255, 0.2);
    }
    .feature-card-large h3 {
      font-size: 1.35rem;
      margin-bottom: 0.75rem;
      color: white;
      font-weight: 600;
    }
    .feature-card-large p {
      color: rgba(255, 255, 255, 0.6);
      line-height: 1.7;
      font-size: 0.95rem;
    }
    
    .landing-how {
      padding: 8rem 2rem;
      position: relative;
    }
    .landing-how::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.3), transparent);
    }
    .landing-how .section-title {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 4rem;
    }
    .steps-container {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 1rem;
      max-width: 1100px;
      margin: 0 auto;
      flex-wrap: wrap;
    }
    .step-item {
      flex: 1;
      min-width: 200px;
      text-align: center;
      padding: 2rem;
      position: relative;
    }
    .step-item::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.2), transparent);
      z-index: 0;
    }
    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      font-size: 1.8rem;
      font-weight: 800;
      background: linear-gradient(135deg, rgba(108, 99, 255, 0.2), rgba(139, 92, 246, 0.2));
      border: 1px solid rgba(108, 99, 255, 0.3);
      border-radius: 50%;
      color: white;
      margin-bottom: 1.5rem;
      position: relative;
      z-index: 1;
    }
    .step-item h3 {
      color: white;
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    .step-item p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.9rem;
    }
    .step-connector {
      display: none;
    }
    
    .landing-cta {
      padding: 8rem 2rem;
      background: linear-gradient(180deg, transparent, rgba(108, 99, 255, 0.08));
      position: relative;
      text-align: center;
    }
    .landing-cta::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(108, 99, 255, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .cta-content {
      max-width: 600px;
      margin: 0 auto;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    .cta-content h2 {
      font-size: 3rem;
      color: white;
      margin-bottom: 1rem;
      font-weight: 700;
    }
    .cta-content p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 1.15rem;
      margin-bottom: 2.5rem;
    }
    
    .landing-footer {
      padding: 3rem 2rem;
      text-align: center;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .landing-footer p {
      color: var(--gray);
      margin: 0.5rem 0;
    }
    .landing-footer a {
      color: var(--primary);
      text-decoration: none;
    }
    .landing-footer a:hover {
      text-decoration: underline;
    }
    
    @media (max-width: 768px) {
      .landing-hero h1 { font-size: 2.5rem; }
      .hero-value { gap: 1rem; }
      .value-item { padding: 0.5rem 1rem; }
      .features-grid { grid-template-columns: 1fr; }
      .steps-container { flex-direction: column; }
      .step-connector { display: none; }
      .cta-content h2 { font-size: 1.8rem; }
      .hero h1 { font-size: 2rem; }
      nav { gap: 1rem; }
      .nft-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
      .profile-header { flex-direction: column; text-align: center; }
      .wallet-details { grid-template-columns: 1fr; }
    }
    
    /* Auction Styles */
    .auction-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 2rem; }
    .auction-card { position: relative; background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; }
    .auction-card:hover { transform: translateY(-12px); border-color: var(--primary); box-shadow: 0 25px 50px rgba(108, 99, 255, 0.2), 0 0 0 1px var(--primary); }
    .auction-card:hover .auction-image { transform: scale(1.1); }
    .auction-card:hover .auction-overlay { opacity: 0.3; }
    
    .auction-hot { position: absolute; top: 1rem; left: 1rem; z-index: 10; padding: 0.4rem 0.8rem; background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white; font-size: 0.75rem; font-weight: 700; border-radius: 20px; animation: pulse 2s infinite; }
    .auction-ended { position: absolute; top: 1rem; left: 1rem; z-index: 10; padding: 0.4rem 0.8rem; background: rgba(139, 139, 158, 0.8); color: white; font-size: 0.75rem; font-weight: 700; border-radius: 20px; }
    
    .auction-image-container { position: relative; height: 220px; overflow: hidden; }
    .auction-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s ease; }
    .auction-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15, 15, 26, 0.9), transparent); transition: opacity 0.4s; }
    
    .auction-content { padding: 1.5rem; }
    .auction-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: white; }
    .auction-description { font-size: 0.85rem; color: var(--gray); margin-bottom: 1rem; line-height: 1.5; }
    
    .auction-stats { display: flex; gap: 1rem; margin-bottom: 1rem; }
    .auction-stat { flex: 1; background: rgba(255,255,255,0.05); padding: 0.8rem; border-radius: 12px; text-align: center; }
    .stat-label { display: block; font-size: 0.75rem; color: var(--gray); margin-bottom: 0.3rem; }
    .stat-value { display: block; font-weight: 700; font-size: 1.1rem; color: white; }
    .stat-value.bid { color: var(--secondary); }
    
    .auction-time { display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(108, 99, 255, 0.1); border-radius: 12px; margin-bottom: 0.8rem; }
    .time-label { font-size: 0.8rem; color: var(--gray); }
    .time-value { font-weight: 700; color: var(--primary); font-size: 1rem; }
    .time-value.urgent { color: #ff6b6b; animation: pulse 1s infinite; }
    
    .auction-leader { font-size: 0.8rem; color: var(--gray); }
    .auction-leader span { color: var(--secondary); font-weight: 600; }
    
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  </style>
</head>
<body>
  <div class="bg-animation"></div>
  
  <!-- Landing Page Modal -->
  <div class="landing-overlay" id="landingOverlay">
    <div class="landing-modal-content" id="landingContent"></div>
  </div>
  
  <!-- Auth Modal -->
  <div class="auth-overlay" id="authOverlay">
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">Sign In</button>
        <button class="auth-tab" data-tab="register">Register</button>
      </div>
      <div class="auth-icon">🔐</div>
      <h2 id="authTitle">Welcome Back</h2>
      <p id="authSubtitle">Sign in to continue to NFT.etheroi</p>
      <div class="auth-error" id="authError">Invalid email or password</div>
      <form id="authForm">
        <div class="auth-input-group auth-input-user" id="usernameGroup" style="display: none;">
          <input type="text" name="username" placeholder="Username">
        </div>
        <div class="auth-input-group auth-input-email">
          <input type="email" name="email" placeholder="Email address" required>
        </div>
        <div class="auth-input-group auth-input-password">
          <input type="password" name="password" placeholder="Password" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;" id="authSubmitBtn">Sign In</button>
      </form>
    </div>
  </div>
  
  <header>
    <div class="header-content">
      <a href="#" class="logo" onclick="navigate('home'); return false;">NFT<span>.etheroi</span></a>
      <nav>
        <a href="#" data-page="marketplace">Marketplace</a>
        <a href="#" data-page="auctions">Auctions</a>
        <a href="#" data-page="gallery" class="protected hidden">
          <span>Gallery</span>
          <span class="nav-dropdown">▼</span>
        </a>
        <button class="btn btn-primary protected hidden" id="createBtn" onclick="navigate('create')">+ Create</button>
        <button class="btn btn-primary" id="authBtn">Sign In</button>
        <button class="btn btn-danger hidden" id="logoutBtn">Logout</button>
      </nav>
    </div>
  </header>
  
  <main id="app"></main>
  
  <footer>
    <div class="footer-content">
      <div class="footer-section">
        <h4>🚀 NFT.etheroi</h4>
        <p>The next-generation marketplace for digital creators. Buy, sell, and auction unique digital art secured by blockchain technology.</p>
        <div style="margin-top: 1rem;">
          <a href="https://etheroi.com" target="_blank" style="display: inline-block; padding: 0.6rem 1.2rem; background: linear-gradient(135deg, var(--primary), #8b5cf6); border-radius: 25px; color: white; text-decoration: none; font-size: 0.85rem; font-weight: 600; box-shadow: 0 4px 15px rgba(108, 99, 255, 0.4);">✨ Explore AI Products</a>
        </div>
      </div>
      <div class="footer-section">
        <h4>🛒 Explore</h4>
        <span style="color: var(--gray); font-size: 0.9rem;">Discover unique digital art from creators worldwide</span>
      </div>
      <div class="footer-section">
        <h4>🎨 Create</h4>
        <span style="color: var(--gray); font-size: 0.9rem;">Mint your own NFTs and start selling in minutes</span>
      </div>
      <div class="footer-section">
        <h4>🔨 Auctions</h4>
        <span style="color: var(--gray); font-size: 0.9rem;">Bid on exclusive pieces and collect rare digital art</span>
      </div>
      <div class="footer-section">
        <h4>👨‍💻 Creator</h4>
        <span style="color: var(--gray); font-size: 0.9rem;">Built by <a href="https://jeremylive.netlify.app" target="_blank" style="color: var(--primary);">Jeremy Live</a> — Full Stack Developer & AI Enthusiast</span>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="footer-logo">NFT<span>.etheroi</span> ⚡</div>
      <div class="footer-links">
        <span style="color: var(--gray); font-size: 0.85rem;">Powered by Cloudflare Workers + D1</span>
      </div>
      <div class="footer-social">
        <a href="https://www.linkedin.com/in/jeremy-live/" target="_blank" title="LinkedIn" style="font-size: 1.1rem;">💼</a>
      </div>
    </div>
    <p style="margin-top: 2rem; font-size: 0.8rem; color: var(--gray);">🌟 Built with ❤️ by <a href="https://jeremylive.netlify.app" target="_blank" style="color: var(--primary);">Jeremy Live</a> — 2026 — <a href="https://etheroi.com" target="_blank" style="color: var(--secondary);">etheroi.com</a></p>
  </footer>
  
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <img src="" alt="" class="modal-image" id="modalImage">
      <div class="modal-content">
        <h2 id="modalTitle"></h2>
        <p class="modal-description" id="modalDescription"></p>
        <div class="modal-details">
          <div class="detail-item"><div class="detail-label">Creator</div><div class="detail-value" id="modalCreator"></div></div>
          <div class="detail-item"><div class="detail-label">Owner</div><div class="detail-value" id="modalOwner"></div></div>
          <div class="detail-item"><div class="detail-label">Price</div><div class="detail-value" id="modalPrice"></div></div>
          <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value" id="modalStatus"></div></div>
        </div>
        <button class="btn btn-primary" style="width: 100%;" onclick="buyNFT()">Buy Now</button>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    // State
    let currentFilter = 'all';
    let currentPage = 'home';
    let currentAuthTab = 'login';
    let currentProfileTab = 'profile';
    let nfts = [];
    let userNFTs = [];
    let user = null;
    let walletConnected = false;
    let walletAddress = '';
    let walletBalance = '0.000000';
    let selectedNFT = null;
    let ethereum = null;
    
    // Check if MetaMask or compatible wallet is installed
    function checkWalletInstalled() {
      if (typeof window.ethereum !== 'undefined' || window.web3) {
        ethereum = window.ethereum;
        return true;
      }
      return false;
    }
    
    // Check auth on load
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await response.json();
        if (data.authenticated) {
          user = data.user;
          walletAddress = user.walletAddress || '';
          walletConnected = !!walletAddress;
          if (walletConnected) {
            await fetchWalletBalance();
          }
          showLoggedInUI();
          loadUserNFTs();
        }
      } catch (error) {
        console.log('Auth check failed');
      }
    }
    
    function showLoggedInUI() {
      document.getElementById('authOverlay').classList.add('hidden');
      document.getElementById('authBtn').classList.add('hidden');
      document.getElementById('logoutBtn').classList.remove('hidden');
      document.querySelectorAll('.protected').forEach(el => el.classList.remove('hidden'));
    }
    
    function showLoggedOutUI() {
      document.getElementById('authOverlay').classList.remove('hidden');
      document.getElementById('authBtn').classList.remove('hidden');
      document.getElementById('logoutBtn').classList.add('hidden');
      document.querySelectorAll('.protected').forEach(el => el.classList.add('hidden'));
    }
    
    function isLoggedIn() {
      return user !== null;
    }
    
    // Auth handlers
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentAuthTab = tab.dataset.tab;
        
        if (currentAuthTab === 'login') {
          document.getElementById('authTitle').textContent = 'Welcome Back';
          document.getElementById('authSubtitle').textContent = 'Sign in to continue to NFT.etheroi';
          document.getElementById('usernameGroup').style.display = 'none';
          document.getElementById('authSubmitBtn').textContent = 'Sign In';
        } else {
          document.getElementById('authTitle').textContent = 'Create Account';
          document.getElementById('authSubtitle').textContent = 'Join NFT.etheroi today';
          document.getElementById('usernameGroup').style.display = 'block';
          document.getElementById('authSubmitBtn').textContent = 'Create Account';
        }
        document.getElementById('authError').classList.remove('show');
      });
    });
    
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const endpoint = currentAuthTab === 'login' ? '/api/auth/login' : '/api/auth/register';
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: formData.get('email'),
            password: formData.get('password'),
            username: formData.get('username')
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          user = data.user;
          walletAddress = user.walletAddress || '';
          walletConnected = !!walletAddress;
          showLoggedInUI();
          loadUserNFTs();
          showToast(currentAuthTab === 'login' ? 'Welcome back!' : 'Account created successfully!', 'success');
        } else {
          document.getElementById('authError').textContent = data.error || 'Authentication failed';
          document.getElementById('authError').classList.add('show');
        }
      } catch (error) {
        document.getElementById('authError').textContent = 'Connection error';
        document.getElementById('authError').classList.add('show');
      }
    });
    
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (e) {}
      user = null;
      walletConnected = false;
      walletAddress = '';
      walletBalance = '0.000000';
      showLoggedOutUI();
      navigate('home');
      showToast('Logged out successfully', 'success');
    });
    
    // Router
    function navigate(page) {
      if (!user && (page === 'create' || page === 'gallery' || page === 'profile')) {
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
    
    // Render functions
    function render() {
      const app = document.getElementById('app');
      const landingOverlay = document.getElementById('landingOverlay');
      const authOverlay = document.getElementById('authOverlay');
      
      // Hide auth overlay by default
      if (authOverlay) authOverlay.classList.add('hidden');
      
      // Show landing page as modal for non-authenticated users on home only
      if (currentPage === 'home' && !user) {
        app.innerHTML = renderEmptyHome();
        if (landingOverlay) {
          document.getElementById('landingContent').innerHTML = renderLandingPage();
          landingOverlay.classList.remove('hidden');
        }
        return;
      }
      
      // Hide landing modal when authenticated or not on home
      if (landingOverlay) {
        landingOverlay.classList.add('hidden');
      }
      
      switch(currentPage) {
        case 'home':
          app.innerHTML = renderHome();
          fetchNFTs();
          fetchAuctions();
          renderHomeSections();
          break;
        case 'marketplace':
          app.innerHTML = renderMarketplace();
          fetchNFTs();
          break;
        case 'auctions':
          app.innerHTML = renderAuctions();
          fetchAuctions();
          break;
        case 'create':
          app.innerHTML = renderCreate();
          break;
        case 'gallery':
          app.innerHTML = renderGallery();
          renderUserNFTs();
          break;
        case 'profile':
          app.innerHTML = renderProfile();
          break;
      }
    }
    
    // Landing Page for non-authenticated users
    function renderLandingPage() {
      return \`
        <div class="landing-page">
          <!-- Hero Section -->
          <section class="landing-hero">
            <div class="hero-particles"></div>
            <div class="hero-glow"></div>
            <div class="hero-content">
              <div class="hero-badge">
                <span class="pulse-dot"></span>
                Powered by Cloudflare Workers + D1
              </div>
              <h1>The Future of <br><span class="gradient-text">Digital Art</span></h1>
              <p class="hero-subtitle">Create, collect, and trade unique digital artworks on the next-generation NFT marketplace. Secured by blockchain, powered by AI.</p>
              <div class="hero-cta">
                <button class="btn btn-primary btn-large btn-glow" onclick="openAuthModal()">
                  <span class="btn-icon">✨</span> Get Started — Free
                </button>
              </div>
              <div class="hero-value">
                <div class="value-item">
                  <span class="value-icon">🔒</span>
                  <span class="value-text">Secure Ownership</span>
                </div>
                <div class="value-item">
                  <span class="value-icon">⚡</span>
                  <span class="value-text">Instant Transactions</span>
                </div>
                <div class="value-item">
                  <span class="value-icon">🌐</span>
                  <span class="value-text">Global Marketplace</span>
                </div>
                <div class="value-item">
                  <span class="value-icon">🤖</span>
                  <span class="value-text">AI Integration</span>
                </div>
              </div>
            </div>
          </section>
          
          <!-- Features Section -->
          <section class="landing-features">
            <h2 class="section-title">Why Choose <span class="gradient-text">NFT.etheroi</span>?</h2>
            <div class="features-grid">
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">🔐</div>
                <h3>Secure Blockchain</h3>
                <p>Every NFT is secured by Ethereum blockchain technology. Your digital assets are safe, transparent, and truly yours.</p>
              </div>
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">⚡</div>
                <h3>Lightning Fast</h3>
                <p>Built on Cloudflare Workers for sub-second transactions. No more waiting — trade instantly with zero friction.</p>
              </div>
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">🤖</div>
                <h3>AI-Powered</h3>
                <p>Create unique digital art with AI tools. Integrate with etheroi.com for cutting-edge AI generation features.</p>
              </div>
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">🔨</div>
                <h3>Live Auctions</h3>
                <p>Participate in exciting auctions for exclusive digital pieces. Bid, win, and expand your collection.</p>
              </div>
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">🎨</div>
                <h3>Easy Creation</h3>
                <p>Mint your own NFTs in minutes. No coding required — just upload, describe, and start selling.</p>
              </div>
              <div class="feature-card-large">
                <div class="feature-glow"></div>
                <div class="feature-icon-large">🌐</div>
                <h3>Global Community</h3>
                <p>Join thousands of creators and collectors from around the world. Share, trade, and grow together.</p>
              </div>
            </div>
          </section>
          
          <!-- How It Works -->
          <section class="landing-how">
            <h2 class="section-title">How It <span class="gradient-text">Works</span></h2>
            <div class="steps-container">
              <div class="step-item">
                <div class="step-number">01</div>
                <h3>Connect Wallet</h3>
                <p>Sign up or connect your wallet to get started in seconds</p>
              </div>
              <div class="step-connector"></div>
              <div class="step-item">
                <div class="step-number">02</div>
                <h3>Discover Art</h3>
                <p>Browse thousands of unique digital artworks from global creators</p>
              </div>
              <div class="step-connector"></div>
              <div class="step-item">
                <div class="step-number">03</div>
                <h3>Buy or Bid</h3>
                <p>Purchase instantly or participate in exciting auctions</p>
              </div>
              <div class="step-connector"></div>
              <div class="step-item">
                <div class="step-number">04</div>
                <h3>Build Collection</h3>
                <p>Own and showcase your digital art collection forever</p>
              </div>
            </div>
          </section>
          
          <!-- CTA Section -->
          <section class="landing-cta">
            <div class="cta-content">
              <h2>Ready to Start Your Journey?</h2>
              <p>Join the revolution of digital art ownership. Create, collect, and trade with confidence.</p>
              <button class="btn btn-primary btn-large" onclick="openAuthModal()">🚀 Start Now — It's Free</button>
            </div>
          </section>
          
          <!-- Footer Note -->
          <section class="landing-footer">
            <p>🔗 Powered by <a href="https://etheroi.com" target="_blank">etheroi.com</a> — AI Products Platform</p>
            <p>👨‍💻 Built by <a href="https://jeremylive.netlify.app" target="_blank">Jeremy Live</a> — Full Stack Developer</p>
          </section>
        </div>
      \`;
    }
    
    // Empty home for non-authenticated users (behind landing modal)
    function renderEmptyHome() {
      return \`<div style="min-height: 100vh;"></div>\`;
    }
    
    // Open auth modal from landing page (keep landing visible behind)
    window.openAuthModal = function() {
      // Keep landing modal visible, just show auth on top
      const overlay = document.getElementById('authOverlay');
      if (overlay) {
        overlay.classList.remove('hidden');
      }
      // Allow scroll when modal is open
      document.body.style.overflow = 'auto';
    };
    
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
          <div class="section-header">
            <h2 class="section-title">Featured NFTs</h2>
            <button class="btn-link" onclick="navigate('marketplace')">View All →</button>
          </div>
          <div class="nft-grid" id="featuredGrid"></div>
        </section>
        <section>
          <div class="section-header">
            <h2 class="section-title">🔨 Live Auctions</h2>
            <button class="btn-link" onclick="navigate('auctions')">View All →</button>
          </div>
          <div class="auction-grid" id="homeAuctionsGrid"></div>
        </section>
        <section class="protected">
          <div class="section-header">
            <h2 class="section-title">🖼️ Your Gallery</h2>
            <button class="btn-link" onclick="navigate('gallery')">View All →</button>
          </div>
          <div class="nft-grid" id="homeGalleryGrid"></div>
        </section>
        <section>
          <h2 class="section-title">Platform Features</h2>
          <div class="features">
            <div class="feature-card" onclick="navigate('create')"><div class="feature-icon">🎨</div><h3>Create NFTs</h3><p>Upload your artwork and convert it into unique digital tokens</p></div>
            <div class="feature-card" onclick="navigate('marketplace')"><div class="feature-icon">🛒</div><h3>Marketplace</h3><p>Buy and sell NFTs in our secure marketplace</p></div>
            <div class="feature-card" onclick="navigate('auctions')"><div class="feature-icon">🔨</div><h3>Auctions</h3><p>Participate in auctions for exclusive digital pieces</p></div>
            <div class="feature-card" onclick="navigate('gallery')"><div class="feature-icon">🖼️</div><h3>Galleries</h3><p>Showcase your collection in virtual galleries</p></div>
          </div>
        </section>\`;
    }
    
    function renderMarketplace() {
      return \`
        <h2 class="section-title">Marketplace</h2>
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="sale">For Sale</button>
        </div>
        <div class="nft-grid" id="marketplaceGrid"></div>\`;
    }
    
    function renderAuctions() {
      return \`
        <h2 class="section-title">🔥 Live Auctions</h2>
        <div class="filters">
          <button class="filter-btn active" data-auction-filter="all">All</button>
          <button class="filter-btn" data-auction-filter="active">Active</button>
          <button class="filter-btn" data-auction-filter="ended">Ended</button>
        </div>
        <button class="btn btn-primary" onclick="openCreateAuctionModal()" style="margin-bottom: 2rem;">+ Create Auction</button>
        <div class="auction-grid" id="auctionGrid">
          <div style="text-align: center; padding: 4rem; color: var(--gray);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔨</div>
            <p>Loading auctions...</p>
          </div>
        </div>\`;
    }
    
    function renderCreate() {
      return \`
        <h2 class="section-title">Create NFT</h2>
        <div class="create-section">
          <form id="createForm">
            <div class="form-group"><label>NFT Name</label><input type="text" name="name" required placeholder="Enter NFT name"></div>
            <div class="form-group"><label>Description</label><textarea name="description" rows="4" placeholder="Describe your digital artwork"></textarea></div>
            <div class="form-group"><label>Image URL</label><input type="url" name="image" required placeholder="https://example.com/image.jpg"></div>
            <div class="form-group"><label>Price (ETH)</label><input type="number" name="price" step="0.01" required placeholder="0.00"></div>
            <div class="form-group"><label>Put on Sale</label><select name="forSale"><option value="yes">Yes</option><option value="no">No</option></select></div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Create NFT</button>
          </form>
        </div>\`;
    }
    
    function renderGallery() {
      return \`<h2 class="section-title">My Gallery</h2><div class="nft-grid" id="galleryGrid"></div>\`;
    }
    
    function renderProfile() {
      const username = user?.username || 'User';
      const email = user?.email || '';
      const initial = username.charAt(0).toUpperCase();
      
      return \`
        <h2 class="section-title">My Profile</h2>
        <div class="profile-section">
          <div class="profile-tabs">
            <button class="profile-tab \${currentProfileTab === 'profile' ? 'active' : ''}" data-profile-tab="profile" onclick="switchProfileTab('profile')">👤 Profile</button>
            <button class="profile-tab \${currentProfileTab === 'wallet' ? 'active' : ''}" data-profile-tab="wallet" onclick="switchProfileTab('wallet')">💳 Wallet</button>
          </div>
          
          <div class="profile-content \${currentProfileTab === 'profile' ? 'active' : ''}" id="profileContent">
            <div class="profile-header">
              <div class="profile-avatar">\${initial}</div>
              <div class="profile-info">
                <h3>\${username}</h3>
                <p>\${email}</p>
              </div>
            </div>
            <form id="profileForm">
              <div class="form-group">
                <label>Username</label>
                <input type="text" name="username" value="\${username}" required>
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" name="email" value="\${email}" required>
              </div>
              <div class="form-group">
                <label>New Password (leave blank to keep current)</label>
                <input type="password" name="password" placeholder="Enter new password">
              </div>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </form>
          </div>
          
          <div class="profile-content \${currentProfileTab === 'wallet' ? 'active' : ''}" id="walletContent">
            \${walletConnected ? renderWalletConnected() : renderWalletDisconnected()}
          </div>
        </div>\`;
    }
    
    function renderWalletDisconnected() {
      const hasWallet = checkWalletInstalled();
      return \`
        <div class="wallet-connect">
          <div class="wallet-connect-icon">🔗</div>
          <h3>Connect Your Wallet</h3>
          <p>Connect your cryptocurrency wallet to buy, sell, and manage NFTs on the marketplace.</p>
          
          <div class="wallet-info-card">
            <h4>💡 What is a Wallet?</h4>
            <p>A cryptocurrency wallet is like a digital bank account that allows you to store, send, and receive cryptocurrencies like Ethereum (ETH). It also serves as your identity on the blockchain.</p>
            
            <h4>🔒 Why do I need one?</h4>
            <ul>
              <li><strong>Buy NFTs:</strong> You'll need ETH to purchase digital art on the marketplace</li>
              <li><strong>Sell NFTs:</strong> Receive payments directly to your wallet when you sell</li>
              <li><strong>Verify Ownership:</strong> Your wallet address proves ownership of your NFTs</li>
              <li><strong>Security:</strong> Your private keys never leave your wallet</li>
            </ul>
            
            <h4>🌐 Supported Networks</h4>
            <p>Currently supporting <strong>Ethereum Mainnet</strong>. More networks coming soon!</p>
          </div>
          
          \${!hasWallet ? '<div class="wallet-error">⚠️ No wallet detected in your browser.</div>' : ''}
          <button class="btn btn-primary btn-large" onclick="\${hasWallet ? 'connectWallet()' : 'installMetaMask()'}">
            \${hasWallet ? '🔗 Connect with MetaMask' : '⬇️ Install MetaMask'}
          </button>
          \${!hasWallet ? '<p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--gray);">Clicking install will open MetaMask download page</p>' : ''}
          
          <div class="wallet-supported">
            <p style="margin-top: 1.5rem; font-size: 0.8rem; color: var(--gray);">
              <strong>Supported Wallets:</strong> MetaMask, Coinbase Wallet, Brave Wallet
            </p>
          </div>
        </div>\`;
    }
    
    // Install MetaMask - opens download page
    window.installMetaMask = function() {
      window.open('https://metamask.io/download/', '_blank');
      showToast('Opening MetaMask download page...', 'success');
    };
    
    function renderWalletConnected() {
      return \`
        <div class="wallet-card">
          <div class="wallet-header">
            <h3>💰 Wallet Balance</h3>
            <div class="wallet-status">
              <span class="wallet-status-dot connected"></span>
              <span>Connected</span>
            </div>
          </div>
          <div class="wallet-balance">\${walletBalance} ETH</div>
          <div class="wallet-balance-label">Ethereum Mainnet</div>
          <div class="wallet-details">
            <div class="wallet-detail">
              <div class="wallet-detail-label">Wallet Address</div>
              <div class="wallet-detail-value">\${formatAddress(walletAddress)}</div>
            </div>
            <div class="wallet-detail">
              <div class="wallet-detail-label">NFTs Owned</div>
              <div class="wallet-detail-value">\${userNFTs.length}</div>
            </div>
          </div>
          <div class="wallet-actions">
            <button class="btn btn-secondary" onclick="refreshWalletBalance()">🔄 Refresh Balance</button>
            <button class="btn btn-danger" onclick="disconnectWallet()">Disconnect</button>
          </div>
        </div>\`;
    }
    
    function formatAddress(address) {
      if (!address) return '';
      return address.substring(0, 6) + '...' + address.substring(address.length - 4);
    }
    
    window.switchProfileTab = function(tab) {
      currentProfileTab = tab;
      render();
    };
    
    // Real blockchain wallet connection
    window.connectWallet = async function() {
      showToast('Connecting to wallet...');
      
      try {
        // Check if ethereum is available
        if (!checkWalletInstalled()) {
          // Redirect to MetaMask download
          window.open('https://metamask.io/download/', '_blank');
          showToast('Please install MetaMask first', 'error');
          return;
        }
        
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        if (accounts.length > 0) {
          walletAddress = accounts[0];
          walletConnected = true;
          
          // Get real balance
          await fetchWalletBalance();
          
          // Save to backend
          try {
            await fetch('/api/auth/wallet', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ walletAddress })
            });
          } catch (e) {}
          
          showToast('Wallet connected successfully!', 'success');
          render();
          
          // Listen for account changes
          window.ethereum.on('accountsChanged', async (newAccounts) => {
            if (newAccounts.length === 0) {
              disconnectWallet();
            } else {
              walletAddress = newAccounts[0];
              await fetchWalletBalance();
              render();
            }
          });
        }
      } catch (error) {
        console.error('Wallet connection error:', error);
        if (error.code === 4001) {
          showToast('Connection request was rejected', 'error');
        } else {
          showToast('Failed to connect wallet', 'error');
        }
      }
    };
    
    window.disconnectWallet = async function() {
      walletConnected = false;
      walletAddress = '';
      walletBalance = '0.000000';
      
      try {
        await fetch('/api/auth/wallet', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ walletAddress: '' })
        });
      } catch (e) {}
      
      showToast('Wallet disconnected');
      render();
    };
    
    // Fetch real balance from blockchain via API
    window.fetchWalletBalance = async function() {
      if (!walletAddress) return;
      
      try {
        const response = await fetch('/api/wallet/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress })
        });
        
        const data = await response.json();
        if (data.balance) {
          walletBalance = parseFloat(data.balance).toFixed(6);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
        // Fallback to direct RPC call if API fails
        try {
          const balance = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [walletAddress, 'latest']
          });
          const balanceEth = parseInt(balance, 16) / 1e18;
          walletBalance = balanceEth.toFixed(6);
        } catch (e) {
          walletBalance = '0.000000';
        }
      }
    };
    
    window.refreshWalletBalance = async function() {
      if (!walletConnected || !walletAddress) {
        showToast('No wallet connected');
        return;
      }
      
      showToast('Refreshing balance...');
      await fetchWalletBalance();
      showToast('Balance: ' + walletBalance + ' ETH', 'success');
      render();
    };
    
    // Profile form handler
    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'profileForm') {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        try {
          const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              username: formData.get('username'),
              email: formData.get('email'),
              password: formData.get('password') || undefined
            })
          });
          
          const data = await response.json();
          if (data.success) {
            user = { ...user, ...data.user };
            showToast('Profile updated!', 'success');
          }
        } catch (error) {
          showToast('Error updating profile');
        }
      }
    });
    
    // NFT functions
    async function fetchNFTs() {
      try {
        const response = await fetch('/api/nfts');
        const serverNFTs = await response.json();
        const localNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
        nfts = [...serverNFTs, ...localNFTs];
        renderNFTs();
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      }
    }
    
    // Auction functions
    let auctions = [];
    let currentAuctionFilter = 'all';
    
    // Check for ended auctions and add NFT to winner's gallery
    async function checkEndedAuctions() {
      const now = Date.now();
      for (const auction of auctions) {
        if (auction.status === 'active' && now > auction.end_time && auction.highest_bidder_id) {
          console.log('Auction ended:', auction.id, 'Winner:', auction.highest_bidder_name);
          
          // Check if winner is current user
          const isWinner = sessionUserId && (auction.highest_bidder_id === sessionUserId || auction.highest_bidder_name === user?.username);
          
          if (isWinner) {
            // Add NFT to winner's gallery
            const wonNFT = {
              id: 'auction_' + auction.id,
              name: auction.title,
              description: auction.description,
              image: auction.image_url,
              price: auction.current_price,
              forSale: false,
              auction: false,
              creator: auction.creator_name,
              owner: user?.username || auction.highest_bidder_name,
              createdAt: Date.now(),
              tags: ['auction', 'won'],
              wonFromAuction: true,
              auctionId: auction.id
            };
            
            const storedNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
            
            // Check if already added
            const alreadyExists = storedNFTs.some(n => n.auctionId === auction.id);
            if (!alreadyExists) {
              storedNFTs.push(wonNFT);
              localStorage.setItem('nft_etheroi_nfts', JSON.stringify(storedNFTs));
              userNFTs = storedNFTs;
              showToast('🎉 You won an auction! Check your gallery!', 'success');
              renderUserNFTs();
            }
          }
          
          // Update auction status to ended
          auction.status = 'ended';
          
          // Update in memory store
          if (auctionsStore.has(auction.id)) {
            const memAuction = auctionsStore.get(auction.id);
            memAuction.status = 'ended';
          }
        }
      }
    }
    
    async function fetchAuctions() {
      try {
        const status = currentAuctionFilter !== 'all' ? '?status=' + currentAuctionFilter : '';
        const response = await fetch('/api/auctions' + status);
        auctions = await response.json();
        
        // Check for ended auctions and add NFT to winner
        await checkEndedAuctions();
        
        renderAuctionsList();
      } catch (error) {
        console.error('Error fetching auctions:', error);
      }
    }
    
    // Render auctions and gallery on home page
    function renderHomeSections() {
      // Render auctions on home
      const homeAuctionsGrid = document.getElementById('homeAuctionsGrid');
      if (homeAuctionsGrid && auctions.length > 0) {
        const activeAuctions = auctions.filter(a => a.status === 'active').slice(0, 3);
        homeAuctionsGrid.innerHTML = activeAuctions.map(a => createAuctionCard(a)).join('');
      } else if (homeAuctionsGrid) {
        homeAuctionsGrid.innerHTML = '<p style="color: var(--gray); grid-column: 1/-1; text-align: center;">No active auctions</p>';
      }
      
      // Render gallery on home (only if logged in)
      const homeGalleryGrid = document.getElementById('homeGalleryGrid');
      if (homeGalleryGrid) {
        if (userNFTs.length > 0) {
          homeGalleryGrid.innerHTML = userNFTs.slice(0, 4).map(nft => createNFTCard(nft, true)).join('');
        } else {
          homeGalleryGrid.innerHTML = '<p style="color: var(--gray); grid-column: 1/-1; text-align: center;">No NFTs in gallery yet</p>';
        }
      }
    }
    
    function renderAuctionsList() {
      const grid = document.getElementById('auctionGrid');
      if (!grid) return;
      
      if (auctions.length === 0) {
        grid.innerHTML = \`
          <div style="text-align: center; padding: 4rem; color: var(--gray); grid-column: 1/-1;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔨</div>
            <p>No auctions found</p>
            <button class="btn btn-primary" onclick="openCreateAuctionModal()" style="margin-top: 1rem;">Create First Auction</button>
          </div>\`;
        return;
      }
      
      grid.innerHTML = auctions.map(auction => createAuctionCard(auction)).join('');
      
      // Setup filter buttons
      document.querySelectorAll('[data-auction-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('[data-auction-filter]').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          currentAuctionFilter = e.target.dataset.auctionFilter;
          fetchAuctions();
        });
      });
    }
    
    function createAuctionCard(auction) {
      const isEnded = auction.status === 'ended';
      const isHot = auction.bid_count > 5;
      const timeLeft = isEnded ? 'Ended' : formatTimeLeft(auction.end_time);
      
      return \`
        <div class="auction-card" onclick="openAuctionModal('\${auction.id}')">
          \${isHot ? '<span class="auction-hot">🔥 HOT</span>' : ''}
          \${isEnded ? '<span class="auction-ended">Ended</span>' : ''}
          <div class="auction-image-container">
            <img src="\${auction.image_url}" alt="\${auction.title}" class="auction-image">
            <div class="auction-overlay"></div>
          </div>
          <div class="auction-content">
            <h3 class="auction-title">\${auction.title}</h3>
            <p class="auction-description">\${auction.description?.substring(0, 80)}...</p>
            <div class="auction-stats">
              <div class="auction-stat">
                <span class="stat-label">Current Bid</span>
                <span class="stat-value bid">\$ \${auction.current_price?.toLocaleString()}</span>
              </div>
              <div class="auction-stat">
                <span class="stat-label">Bids</span>
                <span class="stat-value">\${auction.bid_count || 0}</span>
              </div>
            </div>
            <div class="auction-time">
              <span class="time-label">\${isEnded ? 'Ended' : 'Ends in'}</span>
              <span class="time-value \${!isEnded && auction.end_time - Date.now() < 3600000 ? 'urgent' : ''}">\${timeLeft}</span>
            </div>
            \${auction.highest_bidder_name ? \`<p class="auction-leader">Leading: <span>\${auction.highest_bidder_name}</span></p>\` : ''}
          </div>
        </div>\`;
    }
    
    function formatTimeLeft(endTime) {
      const diff = endTime - Date.now();
      if (diff <= 0) return 'Ended';
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) return \`\${days}d \${hours}h\`;
      if (hours > 0) return \`\${hours}h \${minutes}m\`;
      return \`\${minutes}m\`;
    }
    
    window.openAuctionModal = async function(auctionId) {
      try {
        const response = await fetch('/api/auctions/' + auctionId);
        const auction = await response.json();
        
        const modal = document.getElementById('modal');
        const isEnded = auction.status === 'ended';
        
        document.getElementById('modalImage').src = auction.image_url;
        document.getElementById('modalTitle').textContent = auction.title;
        document.getElementById('modalDescription').textContent = auction.description;
        document.getElementById('modalCreator').textContent = auction.creator_name;
        document.getElementById('modalOwner').textContent = auction.creator_name;
        document.getElementById('modalPrice').textContent = '$ ' + auction.current_price?.toLocaleString();
        document.getElementById('modalStatus').textContent = auction.status;
        
        const btn = document.querySelector('#modal .btn-primary');
        if (isEnded) {
          btn.textContent = 'Auction Ended';
          btn.disabled = true;
          btn.style.opacity = '0.5';
        } else {
          btn.textContent = 'Place Bid';
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.onclick = () => openBidModal(auction);
        }
        
        modal.classList.add('active');
      } catch (error) {
        console.error('Error loading auction:', error);
        showToast('Error loading auction');
      }
    };
    
    function openBidModal(auction) {
      const bidAmount = prompt('Enter your bid (minimum $' + (auction.current_price + 100) + '):', auction.current_price + 100);
      if (!bidAmount) return;
      
      const amount = parseInt(bidAmount);
      if (amount <= auction.current_price) {
        showToast('Bid must be higher than current price');
        return;
      }
      
      fetch('/api/auctions/' + auction.id + '/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast('Bid placed successfully!');
          closeModal();
          fetchAuctions();
        }
      })
      .catch(err => {
        showToast('Error placing bid');
      });
    }
    
    window.openCreateAuctionModal = function() {
      if (!isLoggedIn()) {
        showToast('Please login first');
        return;
      }
      
      const modal = document.getElementById('modal');
      document.getElementById('modalImage').src = 'https://picsum.photos/seed/new/800/800';
      document.getElementById('modalTitle').textContent = 'Create New Auction';
      document.getElementById('modalDescription').innerHTML = \`
        <form id="createAuctionForm">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" name="title" required placeholder="Enter auction title">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="3" placeholder="Describe your digital piece"></textarea>
          </div>
          <div class="form-group">
            <label>Image URL</label>
            <input type="url" name="imageUrl" placeholder="https://example.com/image.jpg">
          </div>
          <div class="form-group">
            <label>Starting Price ($) *</label>
            <input type="number" name="startingPrice" required min="1" placeholder="100" id="auctionStartingPrice">
          </div>
          <div class="form-group">
            <label>Duration</label>
            <select name="durationHours">
              <option value="12">12 hours</option>
              <option value="24" selected>24 hours</option>
              <option value="48">48 hours</option>
              <option value="72">72 hours</option>
              <option value="168">1 week</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Create Auction</button>
        </form>\`;
      
      // Show current user as creator and owner
      const creatorName = user?.username || 'You';
      document.getElementById('modalCreator').textContent = creatorName;
      document.getElementById('modalOwner').textContent = creatorName;
      document.getElementById('modalPrice').textContent = '$0 (enter price above)';
      document.getElementById('modalStatus').textContent = 'Creating';
      
      // Hide the default modal button (we use form submit instead)
      const modalBtn = document.querySelector('#modal .btn-primary');
      if (modalBtn) {
        modalBtn.style.display = 'none';
      }
      
      // Update price when user enters it
      setTimeout(() => {
        const priceInput = document.getElementById('auctionStartingPrice');
        if (priceInput) {
          priceInput.addEventListener('input', (e) => {
            const price = e.target.value;
            document.getElementById('modalPrice').textContent = price ? '$ ' + parseInt(price).toLocaleString() : '$0';
          });
        }
        
        document.getElementById('createAuctionForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = e.target;
          const data = {
            title: form.title.value,
            description: form.description.value,
            imageUrl: form.imageUrl.value,
            startingPrice: parseInt(form.startingPrice.value),
            durationHours: parseInt(form.durationHours.value)
          };
          
          try {
            const res = await fetch('/api/auctions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await res.json();
            
            if (result.error) {
              showToast(result.error);
            } else {
              showToast('Auction created successfully!');
              closeModal();
              fetchAuctions();
            }
          } catch (err) {
            showToast('Error creating auction');
          }
        });
      }, 100);
      
      modal.classList.add('active');
    };
    
    function loadUserNFTs() {
      userNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
    }
    
    function renderNFTs() {
      const featuredGrid = document.getElementById('featuredGrid');
      const marketplaceGrid = document.getElementById('marketplaceGrid');
      
      // Get purchased NFT IDs
      const purchasedIds = new Set(userNFTs.map(n => n.id));
      
      // Available NFTs: not purchased AND not auction
      const availableNFTs = nfts.filter(nft => !purchasedIds.has(nft.id) && !nft.auction);
      
      let filteredNFTs = [];
      
      if (currentFilter === 'all' || currentFilter === 'sale') {
        // Show only For Sale NFTs (no purchased in marketplace)
        filteredNFTs = availableNFTs.filter(nft => nft.forSale);
      }
      
      const nftCards = filteredNFTs.map(nft => createNFTCard(nft)).join('');
      
      // Featured shows only available NFTs for sale
      if (featuredGrid) featuredGrid.innerHTML = availableNFTs.filter(n => n.forSale).slice(0, 4).map(nft => createNFTCard(nft)).join('');
      if (marketplaceGrid) {
        marketplaceGrid.innerHTML = filteredNFTs.length ? nftCards : '<p style="color: var(--gray); grid-column: 1/-1; text-align: center;">No NFTs for sale</p>';
      }
    }
    
    function renderUserNFTs() {
      const galleryGrid = document.getElementById('galleryGrid');
      if (!galleryGrid) return;
      galleryGrid.innerHTML = userNFTs.length ? userNFTs.map(nft => createNFTCard(nft, true)).join('') : '<p style="color: var(--gray); grid-column: 1/-1; text-align: center;">No NFTs created yet</p>';
    }
    
    function createNFTCard(nft, isOwner = false) {
      const status = nft.auction ? 'Auction' : (nft.forSale ? 'For Sale' : 'Not for Sale');
      const statusClass = nft.auction ? 'auction' : '';
      const ownerLabel = isOwner ? '<span style="color: var(--secondary); font-size: 0.75rem;">(Your NFT)</span>' : '';
      
      return \`<div class="nft-card" onclick="openModal('\${nft.id}')"><img src="\${nft.image}" alt="\${nft.name}" class="nft-image"><div class="nft-info"><h3 class="nft-name">\${nft.name} \${ownerLabel}</h3><p class="nft-creator">by \${nft.creator}</p><div class="nft-footer"><span class="nft-price">\${nft.price} ETH</span><span class="nft-status \${statusClass}">\${status}</span></div></div></div>\`;
    }
    
    function openModal(nftId) {
      let foundNFT = nfts.find(n => n.id === nftId);
      let isFromGallery = false;
      if (!foundNFT) {
        foundNFT = userNFTs.find(n => n.id === nftId);
        isFromGallery = true;
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
      
      // Update modal button based on NFT source
      const btn = document.querySelector('#modal .btn-primary');
      if (isFromGallery) {
        // Gallery NFT - show "Create Auction" button
        btn.textContent = 'Create Auction';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = () => openAuctionFromNFT(foundNFT);
      } else {
        // Marketplace NFT - show "Buy Now" button
        btn.textContent = 'Buy Now';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = () => buyNFT();
      }
      
      document.getElementById('modal').classList.add('active');
    }
    
    // Open auction creation modal pre-filled with NFT data
    function openAuctionFromNFT(nft) {
      closeModal();
      
      const modal = document.getElementById('modal');
      document.getElementById('modalImage').src = nft.image;
      document.getElementById('modalTitle').textContent = 'Create Auction for ' + nft.name;
      document.getElementById('modalDescription').innerHTML = \`
        <form id="createAuctionForm">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" name="title" required value="\${nft.name}" placeholder="Enter auction title">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="3" placeholder="Describe your digital piece">\${nft.description}</textarea>
          </div>
          <div class="form-group">
            <label>Image URL</label>
            <input type="url" name="imageUrl" value="\${nft.image}" placeholder="https://example.com/image.jpg">
          </div>
          <div class="form-group">
            <label>Starting Price ($) *</label>
            <input type="number" name="startingPrice" required min="1" placeholder="100" id="auctionStartingPrice" value="\${Math.round(nft.price * 100)}">
          </div>
          <div class="form-group">
            <label>Duration</label>
            <select name="durationHours">
              <option value="12">12 hours</option>
              <option value="24" selected>24 hours</option>
              <option value="48">48 hours</option>
              <option value="72">72 hours</option>
              <option value="168">1 week</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Create Auction</button>
        </form>\`;
      
      const creatorName = user?.username || 'You';
      document.getElementById('modalCreator').textContent = nft.creator;
      document.getElementById('modalOwner').textContent = creatorName;
      document.getElementById('modalPrice').textContent = '$' + Math.round(nft.price * 100);
      document.getElementById('modalStatus').textContent = 'Creating from Gallery';
      
      const modalBtn = document.querySelector('#modal .btn-primary');
      if (modalBtn) modalBtn.style.display = 'none';
      
      setTimeout(() => {
        document.getElementById('createAuctionForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = e.target;
          const data = {
            title: form.title.value,
            description: form.description.value,
            imageUrl: form.imageUrl.value,
            startingPrice: parseInt(form.startingPrice.value),
            durationHours: parseInt(form.durationHours.value)
          };
          
          try {
            const res = await fetch('/api/auctions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await res.json();
            
            if (result.error) {
              showToast(result.error);
            } else {
              showToast('Auction created successfully!');
              closeModal();
              navigate('auctions');
              fetchAuctions();
            }
          } catch (err) {
            showToast('Error creating auction');
          }
        });
      }, 100);
      
      modal.classList.add('active');
    }
    
    function closeModal() {
      document.getElementById('modal').classList.remove('active');
      selectedNFT = null;
    }
    
    document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    
    function buyNFT() {
      if (!selectedNFT) return;
      if (!isLoggedIn()) { showToast('Please login first'); return; }
      
      const nftToBuy = { ...selectedNFT };
      
      // Add to user's gallery
      nftToBuy.owner = user?.username || walletAddress || 'You';
      nftToBuy.forSale = false;
      nftToBuy.auction = false;
      
      // Save to user NFTs
      const storedNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
      storedNFTs.push(nftToBuy);
      localStorage.setItem('nft_etheroi_nfts', JSON.stringify(storedNFTs));
      userNFTs = storedNFTs;
      
      // Remove from marketplace (mark as not for sale)
      nfts = nfts.map(nft => {
        if (nft.id === nftToBuy.id) {
          return { ...nft, forSale: false };
        }
        return nft;
      });
      
      showToast('🎉 NFT acquired! Check your gallery.', 'success');
      closeModal();
      renderUserNFTs();
      renderNFTs();
    }
    
    // Create NFT form
    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'createForm') {
        e.preventDefault();
        if (!user) { showToast('Please login first'); return; }
        
        const formData = new FormData(e.target);
        const newNFT = {
          id: 'user_' + Date.now(),
          name: formData.get('name'),
          description: formData.get('description'),
          image: formData.get('image'),
          price: parseFloat(formData.get('price')),
          forSale: formData.get('forSale') === 'yes',
          auction: false,
          creator: walletAddress || '0xUser...1234',
          owner: walletAddress || '0xUser...1234',
          createdAt: Date.now(),
          tags: []
        };
        
        const storedNFTs = JSON.parse(localStorage.getItem('nft_etheroi_nfts') || '[]');
        storedNFTs.push(newNFT);
        localStorage.setItem('nft_etheroi_nfts', JSON.stringify(storedNFTs));
        userNFTs = storedNFTs;
        
        showToast('NFT created successfully!', 'success');
        e.target.reset();
        setTimeout(() => navigate('gallery'), 1500);
      }
    });
    
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
        currentFilter = e.target.dataset.filter;
        renderNFTs();
      }
    });
    
    // Initialize
    checkAuth();
    render();
  </script>
</body>
</html>`;
