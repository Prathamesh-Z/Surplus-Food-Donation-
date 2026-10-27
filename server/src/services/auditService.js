import { prisma } from '../lib/prisma.js';

// PRD FR-21 — the audit log is append-only: rows are created by admin
// actions and never updated or deleted anywhere in the codebase.
export async function writeAudit({ adminId, action, targetType, targetId, reason }, client = prisma) {
  return client.auditLog.create({
    data: { adminId, action, targetType, targetId, reason: reason ?? null },
  });
}
