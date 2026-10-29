import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { transcribeAudio } from '../services/speechService.js';

/**
 * Voice search (PRD v3.8) — POST /api/speech/transcribe.
 * Any signed-in role may transcribe a short clip for the Browse search
 * box. Audio is held in memory only and forwarded to the local
 * inference service; nothing is stored.
 */
export const speechRouter = Router();

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const LANGS = new Set(['en', 'mr', 'hi']);

speechRouter.post('/transcribe', requireAuth, (req, res, next) => {
  uploadAudio.single('audio')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Audio clip is too large (max 10 MB). Keep it under a minute.' });
      }
      return next(err);
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'No audio was uploaded.' });
      const language = LANGS.has(req.body?.language) ? req.body.language : undefined;
      const result = await transcribeAudio(req.file.buffer, {
        filename: req.file.originalname || 'voice.webm',
        language,
      });
      return res.json(result);
    } catch (e) {
      return res.status(e.status ?? 500).json({ error: e.message });
    }
  });
});
