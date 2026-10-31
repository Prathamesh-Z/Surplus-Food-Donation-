import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * THE uploads directory (server/uploads) — the single source of truth.
 * Multer writes here (routes/listings.js) and Express serves /uploads from
 * here (app.js). Before v3.5 both computed the path independently with
 * different relative bases, so uploaded photos were written to
 * server/uploads but served from <project-root>/uploads — every photo URL
 * 404'd and listing cards never showed images.
 */
export const UPLOADS_DIR = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/**
 * PRIVATE storage for NGO verification documents (server/private/). This
 * directory is deliberately NOT under UPLOADS_DIR and is never mounted
 * by express.static — document bytes are served only by the auth-gated
 * NGO/admin endpoints, never by a public URL.
 */
export const NGO_DOCS_DIR = path.join(__dirname, '../../private/ngo-documents');
fs.mkdirSync(NGO_DOCS_DIR, { recursive: true });
