import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/index.js';
import { UPLOADS_DIR } from './lib/uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Small helmet-style headers (QA report §7 hardening). CORS stays open:
  // the client is served same-origin, and auth is a Bearer header, so there
  // is no ambient credential for a third-party site to abuse; restricting
  // origins is a deployment decision, not a code fix.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Health check — build-order gate (PRD v3.1, Section 12, step 1)
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'food-waste-saver', time: new Date().toISOString() });
  });

  // Uploaded photos (local disk, PRD FR-04) — served from the same
  // directory multer writes to (lib/uploads.js is the single source).
  app.use('/uploads', express.static(UPLOADS_DIR));

  // All module routes (auth, listings, claims, notifications, …)
  app.use('/api', apiRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React client (single-server demo posture, PRD Section 8)
  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Central error handler: Zod -> 422, multer size -> 413, else 500
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.name === 'ZodError') {
      return res.status(422).json({ error: 'Validation failed', details: err.flatten() });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
