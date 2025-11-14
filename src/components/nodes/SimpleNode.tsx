import React from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import './node.css';

export default function SimpleNode({ data, type, selected }: NodeProps) {
  const title = data?.label || (type || 'Node');
  const onRename = (data as any)?.onRename as undefined | ((label: string) => void);
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  return (
    <div className={`node-card ${selected ? 'is-selected' : ''}`}>
      <div className="node-header">
        <span className="node-eye">◉</span>
        {isEditing && onRename ? (
          <input
            className="node-title-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setIsEditing(false); onRename(draft || String(type || 'Node')); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setIsEditing(false); setDraft(title); } }}
          />
        ) : (
          <button className="node-title-btn" onClick={() => setIsEditing(true)}>{title}</button>
        )}
        <span className="node-badge">{(type || '').toUpperCase()}</span>
      </div>
      <div className="node-body" style={{ padding: 12 }}>
        <div className="node-text">{data?.prompt || data?.text || ''}</div>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}


