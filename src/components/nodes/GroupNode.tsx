import React from 'react';
import type { NodeProps } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';
import './node.css';

export default function GroupNode({ data, selected }: NodeProps) {
  const title = (data as any)?.label || 'Group';
  const [hover, setHover] = React.useState(false);
  return (
    <div
      className={`group-region ${selected ? 'is-selected' : ''} ${hover ? 'hovered' : ''}`}
      style={{ width: '100%', height: '100%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="group-header">{title}</div>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        handleStyle={{ width: 8, height: 8 }}
      />
    </div>
  );
}


