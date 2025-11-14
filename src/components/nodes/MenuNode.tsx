import React from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Switch } from '../ui/Switch';
import './node.css';

export default function MenuNode({ data, selected }: NodeProps) {
  const title = data?.label || 'Menu';
  const text = data?.text || '';
  const options = data?.options || [];
  const mode = data?.mode || 'menu'; // 'menu' or 'input'
  const onRename = (data as any)?.onRename as undefined | ((label: string) => void);
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  const embedded = (data as any)?.embeddedInput as undefined | { id: string; prompt: string };
  const onUpdate = (data as any)?.onUpdate as undefined | ((p: Record<string, any>) => void);
  const onCommit = (data as any)?.onCommit as undefined | (() => void);
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
            onBlur={() => { setIsEditing(false); onRename(draft || 'Menu'); onCommit && onCommit(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setIsEditing(false); setDraft(title); } }}
          />
        ) : (
          <button className="node-title-btn" onClick={() => setIsEditing(true)}>{title}</button>
        )}
        <span className="node-badge">MENU</span>
        {onUpdate && (
          <div className="node-mode-toggle">
            <span className="mode-label">Input</span>
            <Switch
              checked={mode === 'input'}
              onCheckedChange={(checked) => {
                onUpdate({ mode: checked ? 'input' : 'menu' });
                onCommit && onCommit();
              }}
              title={mode === 'input' ? 'Input prompt mode' : 'Menu with options mode'}
            />
            <span className="mode-label">Menu</span>
          </div>
        )}
      </div>
      <div className="node-body">
        <div className="node-text">{text}</div>
        {mode === 'menu' ? (
          <div className="node-list">
          {options.map((o: any, idx: number) => (
            <div key={o.id || idx} className="node-list-row" style={{ position: 'relative' }}>
              <span className="node-key">{idx + 1}.</span>
              {onUpdate ? (
                <input
                  className="node-inline-input"
                  value={o.label || ''}
                  placeholder={`Item ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...options];
                    next[idx] = { ...o, label: e.target.value };
                    onUpdate({ options: next });
                  }}
                  onBlur={() => onCommit && onCommit()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (idx === options.length - 1) {
                        const next = [...options, { id: crypto.randomUUID(), label: '' }];
                        onUpdate({ options: next });
                        onCommit && onCommit();
                      }
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              ) : (
                <span className="node-link">{o.label || 'Item'}</span>
              )}
              <span className="node-arrow">›</span>
              <Handle type="source" position={Position.Right} id={`opt-${idx}`} className="row-handle opt-handle" />
            </div>
          ))}
            {onUpdate && (
              <button
                type="button"
                className="node-add"
                onClick={() => { onUpdate({ options: [...options, { id: crypto.randomUUID(), label: '' }] }); onCommit && onCommit(); }}
              >+ Add option</button>
            )}
            {embedded ? (
              <div className="node-embed">
                <div className="node-embed-title">Input</div>
                {onUpdate ? (
                  <input
                    className="node-inline-input"
                    value={embedded.prompt}
                    onChange={(e) => onUpdate({ embeddedInput: { ...embedded, prompt: e.target.value } })}
                    onBlur={() => onCommit && onCommit()}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                ) : (
                  <div className="node-embed-body">{embedded.prompt}</div>
                )}
                <Handle type="source" position={Position.Right} id={`embed-input`} className="row-handle" />
              </div>
            ) : (
              <div className="node-input-hint">Drag an Input into this Menu</div>
            )}
          </div>
        ) : (
          <div className="node-input-mode">
            <div className="node-input-prompt">
              <div className="node-input-title">Input Prompt</div>
              {onUpdate ? (
                <input
                  className="node-inline-input"
                  value={text}
                  placeholder="Enter your prompt here..."
                  onChange={(e) => onUpdate({ text: e.target.value })}
                  onBlur={() => onCommit && onCommit()}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <div className="node-input-display">{text || 'Enter your prompt here...'}</div>
              )}
            </div>
            <div className="node-input-hint">User will input text here</div>
            <Handle type="source" position={Position.Right} id={`input-output`} className="row-handle" />
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}


