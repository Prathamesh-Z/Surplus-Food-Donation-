import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Python food-recognition inference service (PRD v3.3). */
  inferenceUrl: process.env.INFERENCE_URL ?? 'http://127.0.0.1:8001',
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-0123456789'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-0123456789'),
  pickupPepper: required('PICKUP_CODE_PEPPER', 'dev-pepper-change-me-01234567890123456789'),
  pickupEncKeyHex: required(
    'PICKUP_CODE_ENC_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
  /** Base URL used in password-reset links (v3.6). */
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:4000',
  /**
   * DEVELOPMENT ONLY: when true AND email is not configured, the
   * forgot-password response includes the reset link so a local tester
   * can complete the flow. Never enable in production.
   */
  devResetLink: process.env.DEV_RESET_LINK === 'true',
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM ?? 'Food Waste Saver <no-reply@example.local>',
      }
    : null,
};
