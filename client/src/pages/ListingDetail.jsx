import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { timeRemaining } from './MyListings.jsx';

export function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [portions, setPortions] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');

  async function load() {
    try {
      const data = await api(`/api/listings/${id}`);
      setListing(data.listing);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function claim(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await api('/api/claims', {
        method: 'POST',
        body: { listingId: id, portions: Number(portions) },
      });
      setMessage(
        `Claimed ✓ Your pickup code is ${data.pickupCode} — show it at pickup. Find it again any time under "My claims".`
      );
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  if (error && !listing) return <div className="error">{error}</div>;
  if (!listing) return <p>Loading…</p>;
  const canClaim = user && (user.role === 'CLAIMER' || user.role === 'NGO');

  return (
    <section>
      <h1>{listing.foodName}</h1>
      {listing.photoPath && (
        <img src={listing.photoPath} alt="" style={{ maxWidth: '100%', borderRadius: 12 }} />
      )}
      <p>{listing.foodDetails}</p>
      <div className="card">
        <p>
          <strong>{listing.portionsRemaining}</strong> of {listing.totalPortions} portions remaining
          {' · '}⏰ {timeRemaining(listing.collectionDeadline)}
          {' · '}Deadline: {new Date(listing.collectionDeadline).toLocaleString()}
        </p>
        <p>📍 Pickup: {listing.pickupLocationText}</p>
        <p className="muted">
          {listing.category} · {listing.dietaryType} · {listing.portionType} · By {listing.providerName}
          {listing.ngoSuitable ? ' · NGO-suitable' : ''}
        </p>
        <p className="muted">Provider confirmed the 8-item food-safety checklist for this listing.</p>
      </div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      {canClaim && listing.portionsRemaining > 0 && (
        <form onSubmit={claim} className="row">
          <label>
            Portions to claim
            <input
              type="number"
              min="1"
              max={listing.portionsRemaining}
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
          <button type="submit">Claim portions</button>
        </form>
      )}
      {!canClaim && <p className="muted">Log in as a claimer or NGO to claim portions.</p>}
    </section>
  );
}
