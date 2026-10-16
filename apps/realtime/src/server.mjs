// Placeholder for the Socket.IO server (PLAN.md §1.1, Phase 4). Runs in Docker Compose now so
// the reverse proxy route and health check exist before chat lands.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4000);

createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'realtime', phase: 0 }));
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => console.log(`[realtime] listening on :${port}`));
