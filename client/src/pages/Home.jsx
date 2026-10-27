import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function Home() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    fetch('/api/dashboard/public')
      .then((r) => r.json())
      .then(setLive)
      .catch(() => {});
  }, []);

  return (
    <section>
      <div className="hero">
        <h1>Surplus food, saved in time.</h1>
        <p>
          Food Waste Saver connects messes, canteens, restaurants and event halls that have
          surplus edible food with people and NGOs who can claim portions and collect them
          before the deadline — verified at pickup with a one-time code.
        </p>
        <div className="row">
          <Link className="btn" to="/browse">Browse available food</Link>
          <Link className="btn secondary" to="/impact">See the live impact wall</Link>
        </div>
        {live && (
          <div className="hero-stats">
            <div><div className="n">{live.portionsAvailableNow}</div><div className="l">portions available now</div></div>
            <div><div className="n">{live.platform.portionsCollected}</div><div className="l">portions collected so far</div></div>
            <div><div className="n">{live.platform.completionRate}%</div><div className="l">of claims completed</div></div>
          </div>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>For providers</h2>
          <p>Post surplus in under a minute. The 8-item food-safety checklist is confirmed on every listing, and you verify each pickup with the claimer's code — or scan their QR.</p>
          <Link className="btn secondary" to="/register">Register as a provider</Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>For claimers &amp; NGOs</h2>
          <p>Listings are ordered by soonest deadline first, so the food most at risk is rescued first. Claim exact portions; NGOs can log where the food went onward.</p>
          <Link className="btn secondary" to="/browse">Find food near you</Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Honest impact</h2>
          <p>The dashboard counts only what this system has recorded — listings, claims and collections. No estimates, no invented numbers.</p>
          <Link className="btn secondary" to="/impact">Open the impact wall</Link>
        </div>
      </div>
      <p className="muted">
        Demo build for Hackathon 2K26 (Team HA040). Demo data in this system is synthetic and labelled as such.
      </p>
    </section>
  );
}
