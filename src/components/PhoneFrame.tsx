import React from 'react';

type Props = {
  width?: number;
  children?: React.ReactNode;
  leftLabel?: string;
  centerLabel?: string;
  rightLabel?: string;
  onLeft?: () => void;
  onCenter?: () => void;
  onRight?: () => void;
};

export default function PhoneFrame({ width = 360, children, leftLabel, centerLabel, rightLabel, onLeft, onCenter, onRight }: Props) {
  // iPhone-ish aspect ratio (390 x 844 points)
  const style: React.CSSProperties = {
    position: 'relative',
    width,
    aspectRatio: '390 / 844',
  };
  return (
    <div style={style}>
      <svg viewBox="0 0 390 844" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
        {/* Body */}
        <rect x="6" y="6" width="378" height="832" rx="52" fill="none" stroke="#111827" strokeWidth="12" />
        {/* Bezel fill */}
        <rect x="12" y="12" width="366" height="820" rx="46" fill="#0b0f19" />
        {/* Dynamic Island / notch */}
        <rect x="115" y="26" width="160" height="28" rx="14" fill="#0b0f19" stroke="#111827" strokeWidth="4" />
      </svg>
      {/* Screen content */}
      <div
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          top: 20,
          bottom: 20,
          borderRadius: 40,
          background: '#000',
          color: '#e5e7eb',
          overflow: 'auto',
          padding: 12,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)'
        }}
      >
        {/* Status bar */}
        <div style={{ position: 'sticky', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px', background: 'rgba(0,0,0,0.6)', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 8, border: '1px solid #e5e7eb', borderRadius: 2, position: 'relative' }}>
              <span style={{ position: 'absolute', right: 1, top: 1, bottom: 1, left: 3, background: '#e5e7eb', borderRadius: 1 }}></span>
            </span>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#10b981' }}></span>
          </span>
        </div>
        <div style={{ paddingBottom: 36 }}>{children}</div>
        {/* Softkeys */}
        {(leftLabel || centerLabel || rightLabel) && (
          <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingTop: 8, background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.5))' }}>
            <button onClick={onLeft} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 8, padding: '6px 8px' }}>{leftLabel}</button>
            <button onClick={onCenter} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 8, padding: '6px 8px' }}>{centerLabel}</button>
            <button onClick={onRight} style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 8, padding: '6px 8px' }}>{rightLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}


