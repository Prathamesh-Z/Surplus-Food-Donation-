import React from 'react';

// Circular user avatar: the profile photo (cropped to a circle) when
// one is set, otherwise a grey silhouette drawn as inline SVG — the
// app ships no avatar image asset. Decorative: the surrounding
// control carries the accessible label.
export function Avatar({ user, size = 36 }) {
  if (user?.profilePhoto) {
    return (
      <img
        src={user.profilePhoto}
        alt=""
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', display: 'block', flex: 'none',
        }}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ display: 'block', flex: 'none' }}
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="20" fill="#e6eae2" />
      <circle cx="20" cy="15.5" r="6" fill="#9aa79b" />
      <path
        d="M8.5 33.5c2.8-5.6 6.9-8 11.5-8s8.7 2.4 11.5 8c-3 2.3-6.9 3.5-11.5 3.5s-8.5-1.2-11.5-3.5z"
        fill="#9aa79b"
      />
    </svg>
  );
}
