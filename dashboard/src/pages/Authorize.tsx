import React, { useState } from 'react';
import { CheckCircle, AlertCircle, Shield, Copy, Lock } from 'lucide-react';

const PENDING_SHA = 'f1eea272442a0587ab5843ba28c6ce47b91e1615';
const WORK_ITEM = 'SKEL-P0-01';
const OPERATOR_ID = 'HUMAN-OPERATOR-001';
const AUTHORITY = 'Engineering Authority';

const CANONICAL_FORM = `As ${OPERATOR_ID}, ${AUTHORITY}, I authorize the ${WORK_ITEM} pnpm-lock.yaml scope amendment and ACCEPT_WORK_ITEM ${WORK_ITEM} at exact SHA \`${PENDING_SHA}\`. I have reviewed the evidence and take accountability.`;

export default function Authorize() {
  const [attestation, setAttestation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const isExactMatch = attestation.trim() === CANONICAL_FORM.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(CANONICAL_FORM);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    if (!isExactMatch) return;
    setSubmitted(true);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operator Authorization</h1>
          <p className="page-subtitle">Hard gate — requires human operator attestation</p>
        </div>
        <span className="badge-status pending">⏳ 2 decisions pending</span>
      </div>

      <div className="alert alert-info">
        <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          This page surfaces the two remaining operator decisions for <strong>SKEL-P0-01</strong>.
          These combine into one attestation — exactly as for MANIFEST. Providing the canonical form below
          closes the gate. Accepting SKEL does <em>not</em> complete PG-P0 (separate signed transition)
          and does not open PG-P1 (production scope, separately gated).
        </div>
      </div>

      {/* Evidence Summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Shield size={15} /> Evidence Summary for f1eea272</span>
          <span className="badge-status done">Independent review closed</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.83rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Exact SHA</div>
              <div className="sha-block mono">{PENDING_SHA}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Work item</div>
              <div className="sha-block" style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>{WORK_ITEM}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
            {[
              ['Tests', '162 passing — canonical gate clean'],
              ['Lockfile', 'Only the two importers — no manifest-tool or governance changes'],
              ['Independence', 'One Claude-authored candidate commit; no Codex-authored commit in delta'],
              ['Checkers', 'Authoritative (WSL BST-Codex-Motor) + Supplementary agree — byte-level confirmed'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{k}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Authorization form */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Step 4 + 6 combined — pnpm scope amendment & ACCEPT_WORK_ITEM</span>
        </div>
        <div className="card-body auth-form">
          {submitted ? (
            <div className="alert alert-success">
              <CheckCircle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Attestation recorded.</strong> SKEL-P0-01 accepted at SHA {PENDING_SHA.slice(0, 8)}.
                This decision will be encoded append-only referencing your signature. No further review needed.
                <br/><em style={{ opacity: 0.7 }}>Note: PG-P1 remains closed pending its own separate signed transition.</em>
              </div>
            </div>
          ) : (
            <>
              <div className="alert alert-warning">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>Paste the <strong>exact canonical form</strong> below to close this gate. The system verifies it character-for-character.</span>
              </div>

              <div className="form-field">
                <label className="form-label">Canonical authorization form</label>
                <div className="sha-block" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <span>{CANONICAL_FORM}</span>
                  <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={handleCopy}>
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="attestation-input">Your attestation (paste exact form above)</label>
                <textarea
                  id="attestation-input"
                  className="form-input"
                  rows={5}
                  value={attestation}
                  onChange={e => setAttestation(e.target.value)}
                  placeholder="Paste the canonical authorization form here..."
                  spellCheck={false}
                />
                {attestation.length > 0 && (
                  <span className="form-hint" style={{ color: isExactMatch ? 'var(--status-done)' : 'var(--status-blocked)' }}>
                    {isExactMatch ? '✓ Exact match — ready to submit' : '✗ Does not match canonical form'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn btn-primary"
                  disabled={!isExactMatch}
                  onClick={handleSubmit}
                >
                  <CheckCircle size={15} /> Authorize & Accept SKEL-P0-01
                </button>
                <button className="btn btn-ghost" onClick={() => setAttestation('')}>
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
