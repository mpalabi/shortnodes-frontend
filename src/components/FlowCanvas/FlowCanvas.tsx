import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  ReactFlowProvider,
  MiniMap,
} from "reactflow";
import type { Edge, Node, NodeChange, EdgeChange, Connection, NodeDragHandler, Node as RFNode, XYPosition } from "reactflow";
import React, { useMemo, useEffect, useRef } from 'react';
import { useReactFlow } from 'reactflow';
import MenuNode from '../nodes/MenuNode';
import SimpleNode from '../nodes/SimpleNode';
import GroupNode from '../nodes/GroupNode';
import InputEdge from '../edges/InputEdge';
import "reactflow/dist/style.css";

type Props = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  onConnect: (connection: Connection) => void;
  onEmbedInput: (inputId: string, menuId: string) => void;
  onOpenContextMenu?: (pos: { x: number; y: number }, nodeId: string | null, selectedIds: string[]) => void;
  onReady?: (api: { goToNode: (id: string) => void; fit: () => void; getCenter: () => XYPosition }) => void;
  onGroupSelected?: (ids: string[]) => void;
  showPanHint?: boolean;
  forcePan?: boolean;
  edgeView?: 'all' | 'normal' | 'invalid';
  onChangeEdgeView?: (v: 'all' | 'normal' | 'invalid') => void;
  gotoNodeId?: string | null;
};

function CanvasInner({ nodes, edges, onNodesChange, onEdgesChange, onSelectionChange, onConnect, onEmbedInput, onOpenContextMenu, onReady, onGroupSelected, showPanHint, forcePan, edgeView = 'all', onChangeEdgeView, gotoNodeId }: Props) {
  const nodeTypes = useMemo(() => ({
    menuNode: MenuNode,
    inputNode: SimpleNode,
    apiNode: SimpleNode,
    subflow: GroupNode,
    endNode: SimpleNode,
    // built-in 'group' type requires no renderer
  }), []);
  const edgeTypes = useMemo(() => ({ inputEdge: InputEdge }), []);
  const rf = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const readySentRef = useRef(false);
  useEffect(() => {
    if (readySentRef.current || !onReady) return;
      const goToNode = (id: string) => {
        const node = rf.getNode(id);
        if (!node) return;
        const abs = (node as any).positionAbsolute || node.position;
        const width = node.width || 0;
        const height = node.height || 0;
        const cx = abs.x + width / 2;
        const cy = abs.y + height / 2;
        rf.setCenter(cx, cy, { zoom: 1.1, duration: 500 });
      };
      const fit = () => rf.fitView({ padding: 0.2, duration: 500 });
      const getCenter = (): XYPosition => {
        const el = wrapperRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const flow = rf.project({ x: rect.width / 2, y: rect.height / 2 });
        return flow;
      };
      onReady({ goToNode, fit, getCenter });
      readySentRef.current = true;
  }, [rf, onReady]);

  // Fallback go-to via prop (ensures reliability)
  const lastGotoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gotoNodeId || lastGotoRef.current === gotoNodeId) return;
    const node = rf.getNode(gotoNodeId);
    if (node) {
      const abs = (node as any).positionAbsolute || node.position;
      const width = node.width || 0;
      const height = node.height || 0;
      const cx = abs.x + width / 2;
      const cy = abs.y + height / 2;
      rf.setCenter(cx, cy, { zoom: 1.1, duration: 500 });
      lastGotoRef.current = gotoNodeId;
    }
  }, [gotoNodeId, rf]);
  useEffect(() => {
    if (!fitted.current && (nodes?.length || 0) > 0) {
      rf.fitView({ padding: 0.2 });
      fitted.current = true;
    }
  }, [nodes, rf]);

  const [spacePressed, setSpacePressed] = React.useState(false);
  useEffect(() => {
    const isEditable = (el: any): boolean => {
      if (!el || !el.tagName) return false;
      const tag = String(el.tagName).toLowerCase();
      return tag === 'input' || tag === 'textarea' || !!el.isContentEditable || el.getAttribute?.('role') === 'textbox';
    };
    const down = (e: KeyboardEvent) => {
      const target = e.target as any;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); if (onGroupSelected) { const ids = (rf.getNodes() || []).filter(n => n.selected).map(n => n.id); onGroupSelected(ids); } return; }
      if (e.code === 'Space') {
        if (isEditable(target)) { return; } // don't hijack space while typing
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpacePressed(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [onGroupSelected, rf]);
  const onDragStop: NodeDragHandler = (_e, node: RFNode) => {
    const intersections = rf.getIntersectingNodes(node) || [];
    // Snap input into menus
    if (node.type === 'inputNode') {
      const hit = intersections.find((n) => n.id !== node.id && n.type === 'menuNode');
      if (hit) onEmbedInput(node.id, hit.id);
    }
    // Snap any node into group region if dropped inside
    const group = intersections.find((n) => n.id !== node.id && n.type === 'group');
    if (group) {
      rf.setNodes((nds) => nds.map((n) => n.id === node.id ? ({ ...n, parentId: group.id, extent: 'parent' as any }) : n));
    } else {
      // if dragged out of a group, clear parent
      rf.setNodes((nds) => nds.map((n) => n.id === node.id ? ({ ...n, parentId: undefined }) : n));
    }
  };
  const onContextMenu = (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (!onOpenContextMenu) return;
    const selected = (rf.getNodes() || []).filter(n => n.selected).map(n => n.id);
    onOpenContextMenu({ x: evt.clientX, y: evt.clientY }, null, selected);
  };
  const onNodeCtx = (evt: React.MouseEvent, node: RFNode) => {
    evt.preventDefault();
    if (!onOpenContextMenu) return;
    const selected = (rf.getNodes() || []).filter(n => n.selected).map(n => n.id);
    onOpenContextMenu({ x: evt.clientX, y: evt.clientY }, node?.id || null, selected);
  };
  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative', cursor: (forcePan ? 'grab' : undefined) }}>
    <ReactFlow
      nodes={nodes}
      edges={edges.filter(e => {
        if (edgeView === 'all') return true;
        const invalid = !!((e.data as any)?.onInvalidTargetId);
        return edgeView === 'invalid' ? invalid : !invalid;
      })}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={onDragStop}
      onPaneContextMenu={onContextMenu}
      onNodeContextMenu={onNodeCtx}
      onSelectionChange={(sel) => {
        const nodeIds = sel?.nodes?.map((n) => n.id) || [];
        const edgeIds = sel?.edges?.map((e) => e.id) || [];
        onSelectionChange(nodeIds, edgeIds);
      }}
      connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
      defaultEdgeOptions={{ animated: false, style: { stroke: '#111827' }, markerEnd: { type: MarkerType.ArrowClosed } }}
      deleteKeyCode={['Delete']}
      panOnScroll={false}
      selectionOnDrag={!(spacePressed || !!forcePan)}
      panOnDrag={spacePressed || !!forcePan}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      zoomOnScroll
      fitView
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
    <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 6 }}>
      <button className="button" onClick={() => onChangeEdgeView?.('all')} style={{ opacity: edgeView==='all'?1:0.7 }}>All</button>
      <button className="button" onClick={() => onChangeEdgeView?.('normal')} style={{ opacity: edgeView==='normal'?1:0.7 }}>Normal</button>
      <button className="button" onClick={() => onChangeEdgeView?.('invalid')} style={{ opacity: edgeView==='invalid'?1:0.7 }}>Invalid</button>
      <div className="card" style={{ padding: '4px 8px', marginLeft: 6 }}>
        <span style={{ borderBottom: '3px solid #111827' }}>___</span>&nbsp;normal
        &nbsp;&nbsp;
        <span style={{ borderBottom: '3px dashed #111827' }}>___</span>&nbsp;invalid
      </div>
    </div>
    {(!nodes || nodes.length === 0) && (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Start your flow</div>
          <div style={{ color: '#6b7280' }}>Use the toolbar below to add a Menu, then drag an Input into it.</div>
          <div style={{ color: '#6b7280' }}>Tip: Right‑click for actions. Press H to toggle the hand tool.</div>
        </div>
      </div>
    )}
    {showPanHint && spacePressed && (
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '4px 8px', borderRadius: 8, fontSize: 12, opacity: 0.9 }}>Pan</div>
    )}
    </div>
  );
}

function FlowCanvas(props: Props) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default FlowCanvas;

