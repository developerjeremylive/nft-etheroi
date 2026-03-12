# NFT.etheroi 🌐

> Platform for creating, buying, selling and collecting unique digital objects using blockchain technology.

## Features

- 🎨 **Create NFTs** - Upload artwork and convert it into unique digital tokens
- 🛒 **Marketplace** - Buy and sell NFTs in a secure marketplace
- 🔨 **Auctions** - Participate in auctions for exclusive digital pieces
- 🖼️ **Galleries** - Showcase your collection in virtual galleries

## Tech Stack

- **TypeScript**
- **Cloudflare Workers** (Edge computing)
- **PWA** (Progressive Web App)
- **KV Storage** (for NFT metadata)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone https://github.com/developerjeremylive/nft-etheroi.git
cd nft-etheroi

# Install dependencies
npm install
```

### Development

```bash
# Start local development server
npm run dev
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## Configuration

1. Update `wrangler.toml` with your Cloudflare account details
2. Create a KV namespace for NFT metadata:
   ```bash
   wrangler kv:namespace create NFT_METADATA
   ```
3. Update the `kv_namespaces` section in `wrangler.toml` with your namespace ID

## Project Structure

```
nft-etheroi/
├── src/
│   └── worker.ts       # Main Cloudflare Worker
├── public/
│   ├── manifest.json  # PWA manifest
│   └── images/         # App icons
├── wrangler.toml      # Cloudflare config
├── tsconfig.json      # TypeScript config
└── package.json       # Dependencies
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nfts` | List all NFTs |
| POST | `/api/nfts` | Create new NFT |
| GET | `/api/nfts/:id` | Get NFT by ID |
| GET | `/api/users` | List all users |

## PWA Features

- 📱 Installable on mobile devices
- 🔌 Works offline (with Service Worker)
- 🚀 Fast loading from edge

## License

MIT
