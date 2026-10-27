// Test bootstrap: point Prisma at the TEST database before anything imports it.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-0123456789abcdef';
process.env.PICKUP_CODE_PEPPER = process.env.PICKUP_CODE_PEPPER || 'test-pepper-0123456789abcdef0123456789';
process.env.PICKUP_CODE_ENC_KEY =
  process.env.PICKUP_CODE_ENC_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
// Recognition tests run a stub inference service on this port (never a real model).
process.env.INFERENCE_URL = process.env.INFERENCE_URL || 'http://127.0.0.1:18099';
