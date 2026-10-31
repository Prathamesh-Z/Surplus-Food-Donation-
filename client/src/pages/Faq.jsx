import React, { useId, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchFaq } from '../lib/faq.js';

// /faq — Help & FAQs. A quiet, public page: category sections with an
// accordion per question (collapsed by default, each toggled by its own
// semantic button with aria-expanded/aria-controls, fully keyboard
// operable as a native button). The search box filters questions by
// question and answer text via searchFaq (lib/faq.js) and shows a clear
// empty state. No popups, no auto-opening, no animation. Content is
// English, following the Admin/NGO Panel pattern in this app.
function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  const btnId = useId();
  const panelId = useId();
  return (
    <div className="faqItem">
      <h3 className="faqQ">
        <button
          type="button"
          id={btnId}
          className="faqBtn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{item.q}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={btnId} className="faqA">
          <p>{item.a}</p>
        </div>
      )}
    </div>
  );
}

export function Faq() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const categories = useMemo(() => searchFaq(query), [query]);
  const total = categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <section>
      <button
        type="button"
        className="secondary"
        onClick={() => (location.key && location.key !== 'default' ? navigate(-1) : navigate('/'))}
      >
        ← Back
      </button>
      <h1>Help & FAQs</h1>
      <label>
        Search questions
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. verification, portions, password"
        />
      </label>
      {total === 0 ? (
        <p className="muted">
          No questions match “{query}”. Try a different word, or clear the search to browse all
          questions.
        </p>
      ) : (
        categories.map((category) => (
          <div key={category.id}>
            <h2>{category.title}</h2>
            {category.items.map((item) => (
              <FaqItem key={item.q} item={item} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}
