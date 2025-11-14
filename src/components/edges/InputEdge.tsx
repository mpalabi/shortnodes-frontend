import React from 'react';
import type { EdgeProps } from 'reactflow';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from 'reactflow';
import './edge.css';

export default function InputEdge(props: EdgeProps & { sourceHandle?: string | null }) {
  const { id, source, sourceHandle, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data } = props as any;
  const [open, setOpen] = React.useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const prompt: string = (data as any)?.prompt || 'Enter value';
  const rf = useReactFlow();
  const TEMPLATES: { label: string; code: string }[] = [
    { label: 'Numeric (digits only)', code: 'if (!/^\\d+$/.test(input)) { invalid }' },
    { label: 'Length 1-160', code: 'if (input.length < 1 || input.length > 160) { invalid }' },
    { label: 'Yes / No', code: 'if (!/^(y(es)?|no?)$/i.test(input)) { invalid }' },
    { label: 'Option 1-9', code: 'if (!/^[1-9]$/.test(input)) { invalid }' },
    { label: 'Phone (10-15 digits)', code: 'if (!/^\\+?\\d{10,15}$/.test(input)) { invalid }' },
  ];

  const updatePrompt = (value: string) => {
    rf.setEdges((eds) => eds.map((e) => e.id === id ? ({ ...e, data: { ...(e.data as any), prompt: value } }) : e));
    if (source && sourceHandle === 'embed-input') {
      rf.setNodes((nds) => nds.map((n) => {
        if (n.id !== source) return n;
        const nd = (n.data as any) || {};
        if (nd.embeddedInput) {
          return { ...n, data: { ...nd, embeddedInput: { ...nd.embeddedInput, prompt: value } } };
        }
        return n;
      }));
    }
  };

  const updateCode = (value: string) => {
    rf.setEdges((eds) => eds.map((e) => e.id === id ? ({ ...e, data: { ...(e.data as any), code: value } }) : e));
  };

  const updateInvalidTarget = (targetId: string) => {
    rf.setEdges((eds) => eds.map((e) => e.id === id ? ({ ...e, data: { ...(e.data as any), onInvalidTargetId: targetId || undefined } }) : e));
  };

  const nodes = rf.getNodes();
  const code: string = (data as any)?.code || '';
  const onInvalidTargetId: string | undefined = (data as any)?.onInvalidTargetId;
  const invalid = !!onInvalidTargetId;
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ ...style, strokeWidth: 2.25, strokeDasharray: invalid ? '6 4' : undefined }} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          className="edge-bridge"
        >
          <button className="edge-pill" onClick={() => setOpen(o => !o)} aria-label="Toggle input">
            ⋯
          </button>
          {open && (
            <div className="edge-pop">
              <div className="edge-pop-title">Input</div>
              <input className="edge-input" value={prompt} onChange={(e) => updatePrompt(e.target.value)} placeholder="Enter value" />
              <div className="edge-pop-title" style={{ marginTop: 6 }}>Logic</div>
              <select className="edge-select" onChange={(e) => { const tmpl = TEMPLATES.find(t => t.code === e.target.value); if (tmpl) updateCode(tmpl.code); }} defaultValue="">
                <option value="">Template…</option>
                {TEMPLATES.map(t => <option key={t.label} value={t.code}>{t.label}</option>)}
              </select>
              <textarea className="edge-textarea" rows={4} placeholder={"// pseudo-code, e.g.\n// if (!isNumeric(input)) { invalid }"} value={code} onChange={(e) => updateCode(e.target.value)} />
              <div className="edge-pop-title" style={{ marginTop: 6 }}>On invalid →</div>
              <select className="edge-select" value={onInvalidTargetId || ''} onChange={(e) => updateInvalidTarget(e.target.value)}>
                <option value="">— select node —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{(n.data as any)?.label || n.type || n.id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}


