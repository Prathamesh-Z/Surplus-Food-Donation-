import React, { useState } from 'react';
import { DOC_ACCEPT, DOC_MAX_FILES, docFileError } from '../lib/documents.js';

// Shared staged file picker for NGO verification documents — used by
// the NGO Panel and the NGO registration form so both stage, validate
// and display files identically. Selected files are validated on
// selection (docFileError, mirroring the server); invalid files are
// refused with a message naming the file and the reason — never
// silently dropped. The parent owns the staged list and performs the
// upload via uploadDocuments (lib/documents.js).
export function DocumentStaging({ staged, onChange, disabled = false }) {
  const [rejectedMsg, setRejectedMsg] = useState('');

  function stage(fileList) {
    const rejected = [];
    const accepted = [];
    for (const f of fileList ?? []) {
      const err = docFileError(f);
      if (err) rejected.push(`${f.name} — ${err}`);
      else accepted.push(f);
    }
    if (accepted.length) onChange([...staged, ...accepted].slice(0, DOC_MAX_FILES));
    setRejectedMsg(rejected.join('; '));
  }

  return (
    <div>
      <input
        type="file"
        multiple
        accept={DOC_ACCEPT}
        disabled={disabled}
        onChange={(e) => {
          stage(e.target.files);
          e.target.value = '';
        }}
      />
      {staged.map((f, i) => (
        <div className="row" key={`${f.name}-${i}`} style={{ marginTop: 6 }}>
          <span>📄 {f.name}</span>
          <span className="muted">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={() => onChange(staged.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      {rejectedMsg && <div className="error">{rejectedMsg}</div>}
    </div>
  );
}
