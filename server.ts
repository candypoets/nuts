// TODO: Switch back to '@candypoets/nipworker/proxy/server' once v0.90.1+ is released
// The library fixed the tree-shaking issue but v0.90.0 still has the bug.
// See: https://github.com/candypoets/nipworker/issues/XXX
import { attachRelayProxyToServer } from '@candypoets/nipworker/proxy/server';
import { createServer } from 'http';
import { handler } from './build/handler.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = createServer(handler);

// Attach nipworker WebSocket proxy to the same server (production mode)
// This replaces the vite plugin used in development
attachRelayProxyToServer({
	server,
	path: '/ws-proxy'
});

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running on http://${HOST}:${PORT}`);
	console.log(`📡 WebSocket proxy at ws://${HOST}:${PORT}/ws-proxy`);
});
