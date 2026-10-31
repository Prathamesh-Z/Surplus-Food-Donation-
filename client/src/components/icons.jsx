import React from 'react';

// Interface icons (PRD v3.32): one consistent stroke-based set —
// Lucide path data (ISC licensed, https://lucide.dev), drawn at a
// 24 grid with stroke=currentColor so icons inherit the text colour
// of their context. All are decorative: aria-hidden, with the
// accessible name carried by the surrounding control or text, as the
// emoji glyphs they replace were.
function Icon({ size = 18, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-0.16em', flex: 'none' }}
    >
      {children}
    </svg>
  );
}

export function MapPinIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  );
}

export function ClockIcon({ size }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

export function MicIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </Icon>
  );
}

export function CameraIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <circle cx="12" cy="13" r="3" />
    </Icon>
  );
}

export function PencilIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

export function WalkingIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
      <path d="M16 17h4" />
      <path d="M4 13h4" />
    </Icon>
  );
}

export function BikeIcon({ size }) {
  return (
    <Icon size={size}>
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </Icon>
  );
}

export function NavigationIcon({ size }) {
  return (
    <Icon size={size}>
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </Icon>
  );
}

// The brand mark: a bowl with two leaves, in the palette greens.
// Kept deliberately simple so it stays recognizable at favicon size;
// the same artwork ships as client/public/favicon.svg.
export function BrandMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-0.14em', flex: 'none' }}>
      <path d="M24 21c0-7-5-12-14-13 1 9 6 14 14 13z" fill="#1c7a37" />
      <path d="M24 21c0-7 5-12 14-13-1 9-6 14-14 13z" fill="#22a04a" />
      <rect x="23" y="20" width="2" height="7" fill="#17632e" />
      <path d="M5 27h38c0 9-7.5 15-19 15S5 36 5 27z" fill="#14532d" />
    </svg>
  );
}
