import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Health check — build-order gate (PRD v3.1, Section 12, step 1)
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'food-waste-saver', time: new Date().toISOString() });
  });

  // Uploaded photos (local disk, PRD FR-04)
  const uploadsDir = path.join(__dirname, '../../uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

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
