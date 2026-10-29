import React from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { expiryPriority, PRIORITY_COLORS, PRIORITY_LABEL_KEYS } from '../lib/priority.js';

/** Text + color expiry-priority badge (never color alone). */
export function PriorityBadge({ deadline }) {
  const { t } = useLang();
  const { level } = expiryPriority(deadline);
  const color = PRIORITY_COLORS[level];
  return (
    <span
      className="badge"
      style={{ border: `1.5px solid ${color}`, color, background: '#fff' }}
      title={t(PRIORITY_LABEL_KEYS[level])}
    >
      {level === 'high' ? '🔴 ' : level === 'medium' ? '🟡 ' : level === 'low' ? '🟢 ' : ''}
      {t(PRIORITY_LABEL_KEYS[level])}
    </span>
  );
}

/** Left-border accent style for a card, by the same priority. */
export function priorityCardStyle(deadline) {
  const { level } = expiryPriority(deadline);
  return { borderLeft: `5px solid ${PRIORITY_COLORS[level]}` };
}
