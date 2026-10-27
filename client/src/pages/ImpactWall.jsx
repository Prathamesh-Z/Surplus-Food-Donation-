import React, { useEffect, useState } from 'react';

// Public live impact wall — big-number display for the demo venue screen.
// Data comes only from /api/dashboard/public (aggregates, no personal data).
export function ImpactWall() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/dashboard/public')
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <p style={{ textAlign: 'center' }}>Loading live impact…</p>;
  const p = data.platform;

  const big = (value, label) => (
    <div className="wall-stat">
      <div className="wall-value">{value}</div>
      <div className="wall-label">{label}</div>
    </div>
  );

  return (
    <section style={{ textAlign: 'center', paddingTop: 12 }}>
      <h1 style={{ fontSize: 40, marginBottom: 4 }}>🥗 Food Waste Saver — Live Impact</h1>
      <p className="muted" style={{ fontSize: 18 }}>
        Every number is computed live from the records in this system. Nothing here is an estimate.
      </p>
      <div className="wall-grid">
        {big(p.portionsCollected, 'portions collected & eaten, not wasted')}
        {big(p.portionsListed, 'portions listed by providers')}
        {big(`${p.completionRate}%`, 'of claimed food actually collected')}
        {big(p.listingsCreated, 'surplus listings created')}
        {big(data.portionsAvailableNow, 'portions available right now')}
        {big(p.ngoPortionsRedistributed, 'portions redistributed onward by NGOs')}
      </div>
      <p className="muted">Updated {new Date(data.generatedAt).toLocaleTimeString()} · refreshes every 10 seconds</p>
    </section>
  );
}
