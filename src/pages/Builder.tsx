import Sidebar from "../components/Sidebar/Sidebar";
import FlowCanvas from "../components/FlowCanvas/FlowCanvas";
import PropertiesPanel from "../components/PropertiesPanel/PropertiesPanel";
import "./Builder.scss";
import { Link, useParams } from "react-router-dom";
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

// Debug: Check if dependencies are loaded
console.log('WebSocket dependencies loaded:', { SockJS: !!SockJS, Client: !!Client });
import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node, NodeChange, EdgeChange, Connection } from "reactflow";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "reactflow";
import { List, Type, Plug, GitBranch, Square, Hand, MousePointer, Undo2, Redo2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

type Flow = { id: string; name: string; jsonDefinition: string };

function Builder() {
  const { id } = useParams();
  const [flow, setFlow] = useState<Flow | null>(null);
  
  console.log('Builder component mounted with id:', id);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const lastSelectionRef = useRef<{ nodeId: string | null; edgeIds: string[] }>({ nodeId: null, edgeIds: [] });
  const lastSavedRef = useRef<string>("\n");
  const saveTimer = useRef<number | null>(null);
  const opTimer = useRef<number | null>(null);
  const interactionTimer = useRef<number | null>(null);
  const isInteractingRef = useRef<boolean>(false);
  const pendingChangesRef = useRef<boolean>(false);
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number;nodeId:string|null;selected:string[]}|null>(null);
  const [history, setHistory] = useState<{nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{nodes: Node[]; edges: Edge[] }[]>([]);
  const goToRef = useRef<((id: string) => void) | null>(null);
  const getCenterRef = useRef<(() => { x: number; y: number }) | null>(null);
  const [forcePan, setForcePan] = useState(false);
  const [edgeView, setEdgeView] = useState<'all' | 'normal' | 'invalid'>('all');
  const [gotoNodeId, setGotoNodeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const prevSnapshotRef = useRef<string | null>(null);
  const isUndoRedoRef = useRef(false);
  const handleWsMessageRef = useRef<() => void>(() => {});
  const stompRef = useRef<Client | null>(null);
  const selectionStateRef = useRef<{ nodeId: string | null; edgeIds: string[] }>({ nodeId: null, edgeIds: [] });
  const isRestoringSelectionRef = useRef(false);
  const flowCanvasRef = useRef<any>(null);

  function pushHistory() {
    setHistory((h) => h.concat([{ nodes, edges }]));
    setFuture([]);
  }
  function undo() {
    isUndoRedoRef.current = true;
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => f.concat([{ nodes, edges }]));
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return h.slice(0, -1);
    });
    setTimeout(() => { isUndoRedoRef.current = false; }, 0);
  }
  function redo() {
    isUndoRedoRef.current = true;
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setHistory((h) => h.concat([{ nodes, edges }]));
      setNodes(next.nodes);
      setEdges(next.edges);
      return f.slice(0, -1);
    });
    setTimeout(() => { isUndoRedoRef.current = false; }, 0);
  }
  function addAtCenter(type: string) {
    const center = getCenterRef.current?.() || { x: 200, y: 200 };
    const id = crypto.randomUUID();
    const label = type === 'menuNode' ? 'Menu' : type.replace('Node','');
    const data: any = { label };
    if (type === 'menuNode') {
      data.options = [{ id: crypto.randomUUID(), label: '' }];
      data.text = 'Describe this menu...';
      data.mode = 'menu'; // Default to menu mode
    }
    setNodes((nds) => nds.concat([{ id, type, position: { x: center.x, y: center.y }, data }] as any));
    setSelectedNodeId(id);
    // Immediately mark interaction to prevent inbound refresh from wiping the new node
    markPendingChanges();
    // For new nodes, we need to save immediately to create the initial options in the database
    if (type === 'menuNode') {
      scheduleSave();
    }
  }
  function doDelete(ids: string[]) {
    if (!ids.length) return;
    pushHistory();
    setNodes((nds) => nds
      .filter(n => !ids.includes(n.id))
      .map(n => ids.includes((n.data as any)?.parentId) ? { ...n, data: { ...(n.data as any), parentId: undefined } } : n)
    );
    setEdges((eds) => eds.filter(e => !ids.includes(e.source) && !ids.includes(e.target)));
    setSelectedNodeId(null);
    // Save will be triggered by selection change
  }
  function doUngroup(ids: string[]) {
    if (!ids.length) return;
    pushHistory();
    setNodes((nds) => {
      const groups = new Set(ids);
      const cleared = nds.map(n => groups.has(n.id) ? n : ({ ...n, data: { ...(n.data as any), parentId: groups.has((n.data as any)?.parentId) ? undefined : (n.data as any)?.parentId } }));
      return cleared.filter(n => !groups.has(n.id));
    });
  }

  // Smart save system that only saves when user stops interacting
  function startInteraction() {
    isInteractingRef.current = true;
    if (interactionTimer.current) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      isInteractingRef.current = false;
      if (pendingChangesRef.current) {
        pendingChangesRef.current = false;
        saveGraph();
      }
    }, 1500); // Save 1.5 seconds after user stops interacting
  }

  function markPendingChanges() {
    console.log('markPendingChanges called');
    pendingChangesRef.current = true;
    setHasPendingChanges(true);
    startInteraction();
  }

  function scheduleSave(delay = 800) {
    console.log('scheduleSave called with delay:', delay);
    // Only save immediately for structural changes (add/delete nodes, connect edges)
    if (opTimer.current) window.clearTimeout(opTimer.current);
    opTimer.current = window.setTimeout(() => { 
      console.log('Executing scheduled save...');
      saveGraph(); 
    }, delay);
  }

  // Selection state management with localStorage
  function saveSelectionToLocalStorage(nodeId: string | null, edgeIds: string[]) {
    if (!id) return;
    const selectionState = { nodeId, edgeIds, timestamp: Date.now() };
    localStorage.setItem(`shortnodes-selection-${id}`, JSON.stringify(selectionState));
    selectionStateRef.current = { nodeId, edgeIds };
  }

  function getSelectionFromLocalStorage(): { nodeId: string | null; edgeIds: string[] } | null {
    if (!id) return null;
    try {
      const stored = localStorage.getItem(`shortnodes-selection-${id}`);
      if (!stored) return null;
      const selectionState = JSON.parse(stored);
      // Only use selection if it's recent (within 5 minutes)
      if (Date.now() - selectionState.timestamp < 5 * 60 * 1000) {
        return { nodeId: selectionState.nodeId, edgeIds: selectionState.edgeIds };
      }
    } catch (e) {
      console.warn('Failed to parse selection state from localStorage:', e);
    }
    return null;
  }

  function clearSelectionFromLocalStorage() {
    if (!id) return;
    localStorage.removeItem(`shortnodes-selection-${id}`);
    selectionStateRef.current = { nodeId: null, edgeIds: [] };
  }

  // Sync selection state with WebSocket for real-time collaboration
  function syncSelectionWithWebSocket() {
    if (!id || !stompRef.current?.connected) return;
    
    const currentSelection = {
      nodeId: selectedNodeId,
      edgeIds: selectedEdgeIds,
      timestamp: Date.now()
    };
    
    // Broadcast selection state to other collaborators
    stompRef.current.publish({
      destination: `/app/apps/${id}/selection`,
      body: JSON.stringify(currentSelection)
    });
  }

  // Properly restore selection by updating nodes and edges with selection state
  function restoreSelectionState(nodeId: string | null, edgeIds: string[]) {
    console.log('Restoring selection:', { nodeId, edgeIds });
    
    // Set flag to prevent selection change handler from interfering
    isRestoringSelectionRef.current = true;
    
    // Update React state first
    setSelectedNodeId(nodeId);
    setSelectedEdgeIds(edgeIds);
    lastSelectionRef.current = { nodeId, edgeIds };
    
    // Update nodes and edges with selection state
    setTimeout(() => {
      setNodes((nds) => 
        nds.map((n) => ({
          ...n,
          selected: n.id === nodeId
        }))
      );
      setEdges((eds) => 
        eds.map((e) => ({
          ...e,
          selected: edgeIds.includes(e.id)
        }))
      );
      
      // Clear the flag after a short delay
      setTimeout(() => {
        isRestoringSelectionRef.current = false;
      }, 50);
    }, 10);
  }

  useEffect(() => {
    async function load() {
      if (!id) return;
      // Load legacy flow only for name/title
      try {
        const res = await fetch(`${API_BASE}/api/flows/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFlow(data);
          setNameDraft(data.name || "Untitled");
          try {
            const def = JSON.parse(data.jsonDefinition || '{"nodes":[],"edges":[]}');
            const posMap: Record<string, { x: number; y: number }> = {};
            (def.nodes || []).forEach((n: any) => { if (n?.id && n?.position) posMap[n.id] = n.position; });
            (window as any).__sn_posMap = posMap;
          } catch { (window as any).__sn_posMap = {}; }
        }
      } catch {}

      // Use WebSocket exclusively - request tree data
      const stomp = stompRef.current;
      if (stomp && stomp.connected) {
        console.log('Requesting tree data via WebSocket...');
        stomp.publish({ destination: `/app/apps/${id}/request-tree`, body: '' });
      } else {
        console.warn('WebSocket not connected, using REST fallback...');
        // Temporary REST fallback for debugging
        try {
          const treeres = await fetch(`${API_BASE}/api/apps/${id}/menus/tree`);
          if (treeres.ok) {
            const tree = await treeres.json();
            console.log('Loaded tree from REST fallback:', tree);
            console.log('Tree items with options:', tree.map((t: any) => ({ 
              menuId: t.menu.id, 
              menuName: t.menu.name, 
              optionsCount: (t.options || []).length,
              options: t.options 
            })));
            const savedPos: Record<string, { x: number; y: number }> = (window as any).__sn_posMap || {};
            const dbNodes: Node[] = tree.map((t: any, i: number) => ({
              id: t.menu.id,
              type: 'menuNode',
              position: (t.positionX !== null && t.positionY !== null) 
                ? { x: t.positionX, y: t.positionY }
                : savedPos[t.menu.id] || { x: 160 + (i%3)*280, y: 120 + Math.floor(i/3)*220 },
              data: { 
                label: t.menu.name, 
                text: t.menu.text, 
                mode: t.menu.mode || 'menu', // Default to menu mode
                options: (t.options || [])
                  .filter((o: any) => o.keyIndex > 0)
                  .map((o: any) => ({ 
                    id: o.id, 
                    label: o.label || 'Option', 
                    targetId: o.targetMenuId 
                  }))
              }
            }));
            const dbEdges: Edge[] = [] as any;
            for (const t of tree) {
              for (const o of (t.options || [])) {
                if (o.keyIndex === 0) {
                  const cond = (t.conditionsByOption || {})[o.id];
                  dbEdges.push({ id: crypto.randomUUID(), source: t.menu.id, sourceHandle: 'embed-input', target: o.targetMenuId, type: 'inputEdge', data: { prompt: 'Enter value', code: (cond?.code||''), onInvalidTargetId: (cond?.invalidTargetMenuId||'') } } as any);
                } else if (o.targetMenuId) {
                  dbEdges.push({ id: crypto.randomUUID(), source: t.menu.id, sourceHandle: `opt-${o.keyIndex-1}`, target: o.targetMenuId } as any);
                }
              }
            }
            setNodes(dbNodes);
            setEdges(dbEdges);
            
            // Restore selection state from localStorage after initial load
            const savedSelection = getSelectionFromLocalStorage();
            if (savedSelection) {
              restoreSelectionState(savedSelection.nodeId, savedSelection.edgeIds);
            }
          }
        } catch (e) {
          console.warn('REST fallback also failed:', e);
        }
      }
    }
    load();
  }, [id]);

  // Removed SSE; WebSocket handles realtime updates

  // Keep a handler ref with latest nodes/edges for WebSocket subscription
  useEffect(() => {
    handleWsMessageRef.current = () => {
      // Only request a fresh tree over WebSocket when we are fully settled and in sync
      const current = JSON.stringify({ nodes, edges });
      if (current !== lastSavedRef.current) return;
      if (isInteractingRef.current || pendingChangesRef.current) {
        console.log('Skipping WS tree request - user is interacting or changes pending');
        return;
      }
      const stomp = stompRef.current;
      if (id && stomp && stomp.connected) {
        console.log('Requesting fresh tree via WebSocket (settled state)');
        stomp.publish({ destination: `/app/apps/${id}/request-tree`, body: '' });
      }
    };
  }, [id, nodes, edges]);

  // WebSocket (STOMP over SockJS) subscription for realtime changes
  useEffect(() => {
    if (!id) {
      console.log('WebSocket: No id provided, skipping initialization');
      return;
    }
    
    const wsUrl = `${API_BASE}/ws`;
    console.log('WebSocket: Initializing with URL:', wsUrl, 'API_BASE:', API_BASE);
    
    const client = new Client({
      webSocketFactory: () => {
        console.log('WebSocket: Creating SockJS connection to:', wsUrl);
        const sock = new SockJS(wsUrl);
        sock.onopen = () => console.log('SockJS: Connection opened');
        sock.onclose = (event) => console.log('SockJS: Connection closed', event);
        sock.onerror = (error) => console.error('SockJS: Connection error', error);
        return sock;
      },
      reconnectDelay: 2000,
      debug: (str) => {
        console.log('WebSocket Debug:', str);
      },
    });
    client.onConnect = (frame) => {
      console.log('WebSocket connected successfully:', frame);
      client.subscribe(`/topic/apps/${id}/changes`, (frame) => {
        try {
          const msg = JSON.parse(frame.body || '{}');
          if (msg?.type === 'save-confirmation') {
            console.log('Save confirmation received:', msg.message);
            setToast(msg.message || 'Saved successfully');
            // After a save confirmation, request a fresh tree to sync when settled
            try { client.publish({ destination: `/app/apps/${id}/request-tree`, body: '' }); } catch {}
            return;
          }
          
          if (msg?.type === 'tree' && Array.isArray(msg.tree)) {
            // Only apply updates if user is not currently interacting
            if (isInteractingRef.current) {
              console.log('Skipping WebSocket update - user is interacting');
              return;
            }
            // Also skip if we have pending local changes not yet saved
            if (pendingChangesRef.current) {
              console.log('Skipping WebSocket update - pending local changes');
              return;
            }
            
            console.log('Received WebSocket tree update:', msg.tree);
            console.log('Tree items with options:', msg.tree.map((t: any) => ({ 
              menuId: t.menu.id, 
              menuName: t.menu.name, 
              optionsCount: (t.options || []).length,
              options: t.options 
            })));
            
            // Directly apply snapshot without refetching
            const posMap: Record<string, { x: number; y: number }> = Object.fromEntries(nodes.map(n => [n.id, n.position] as const));
            const dbNodes: any[] = msg.tree.map((t: any, i: number) => ({
              id: t.menu.id,
              type: 'menuNode',
              // Use saved positions if available, otherwise fallback to calculated
              position: (t.positionX !== null && t.positionY !== null) 
                ? { x: t.positionX, y: t.positionY }
                : posMap[t.menu.id] || { x: 160 + (i%3)*280, y: 120 + Math.floor(i/3)*220 },
              data: { 
                label: t.menu.name, 
                text: t.menu.text, 
                mode: t.menu.mode || 'menu', // Default to menu mode
                options: (t.options || [])
                  .filter((o: any) => o.keyIndex > 0)
                  .map((o: any) => ({ 
                    id: o.id, 
                    label: o.label || 'Option', 
                    targetId: o.targetMenuId 
                  }))
              }
            }));
            const dbEdges: any[] = [];
            for (const t of msg.tree) {
              for (const o of (t.options || [])) {
                if (o.keyIndex === 0) {
                  const cond = (t.conditionsByOption || {})[o.id];
                  dbEdges.push({ id: crypto.randomUUID(), source: t.menu.id, sourceHandle: 'embed-input', target: o.targetMenuId, type: 'inputEdge', data: { prompt: 'Enter value', code: (cond?.code||''), onInvalidTargetId: (cond?.invalidTargetMenuId||'') } });
                } else if (o.targetMenuId) {
                  dbEdges.push({ id: crypto.randomUUID(), source: t.menu.id, sourceHandle: `opt-${o.keyIndex-1}`, target: o.targetMenuId });
                }
              }
            }
            // Preserve client-only nodes (non-menu) and unsaved local menus
            setNodes((prev) => {
              const preserved = (prev || []).filter((n) => (n.type || '') !== 'menuNode');
              const merged = dbNodes.concat(preserved.filter((n) => !dbNodes.some((m) => m.id === n.id)));
              const localUnsavedMenus = (prev || []).filter((n) => (n.type || '') === 'menuNode' && !msg.tree.some((t: any) => t.menu.id === n.id));
              return merged.concat(localUnsavedMenus);
            });
            // Preserve edges that touch client-only nodes
            setEdges((prev) => {
              const nodeById: Record<string, Node> = Object.fromEntries(nodes.map((n) => [n.id, n]));
              const key = (e: any) => [e.source, e.sourceHandle || '', e.target, e.type || ''].join('|');
              const serverKeys = new Set(dbEdges.map(key));
              const preserved = (prev || []).filter((e) => {
                const s = nodeById[e.source];
                const t = nodeById[e.target];
                return (s && (s.type || '') !== 'menuNode') || (t && (t.type || '') !== 'menuNode');
              }).filter((e) => !serverKeys.has(key(e)));
              return dbEdges.concat(preserved);
            });
            
            // Restore selection state from localStorage after WebSocket update
            const savedSelection = getSelectionFromLocalStorage();
            if (savedSelection) {
              restoreSelectionState(savedSelection.nodeId, savedSelection.edgeIds);
            }
            return;
          }
        } catch {}
        handleWsMessageRef.current();
      });
      // Subscribe to selection updates from other collaborators
      client.subscribe(`/topic/apps/${id}/selection`, (frame) => {
        try {
          const selectionUpdate = JSON.parse(frame.body || '{}');
          // Only apply selection updates from other users (not our own)
          if (selectionUpdate.timestamp && Math.abs(Date.now() - selectionUpdate.timestamp) > 200) {
            console.log('Received selection update from collaborator:', selectionUpdate);
            // Don't update our own selection, just log for now
            // In a full implementation, you might want to show visual indicators
          }
        } catch (e) {
          console.warn('Failed to parse selection update:', e);
        }
      });
      
      // Request initial tree snapshot over WS
      try { 
        console.log('WebSocket connected, requesting initial tree data...');
        client.publish({ destination: `/app/apps/${id}/request-tree`, body: '' }); 
        
        // Also check if there was a pending request from before WebSocket connected
        const pendingRequest = (window as any).__sn_pendingTreeRequest;
        if (pendingRequest && pendingRequest === id) {
          console.log('Processing pending tree request...');
          (window as any).__sn_pendingTreeRequest = null;
        }
      } catch (e) {
        console.warn('Failed to request initial tree data:', e);
      }
    };
    
    client.onStompError = (frame) => {
      console.error('WebSocket STOMP error:', frame);
      setToast('WebSocket connection error. Please refresh the page.');
    };
    
    client.onWebSocketError = (error) => {
      console.error('WebSocket connection error:', error);
      setToast('WebSocket connection failed. Please refresh the page.');
    };
    
    console.log('WebSocket: Activating client...');
    client.activate();
    stompRef.current = client;
    console.log('WebSocket: Client activated and stored in ref');
    return () => { 
      try { client.deactivate(); } catch {} 
      // Clear selection state when component unmounts
      clearSelectionFromLocalStorage();
    };
  }, [id]);

  async function saveName() {
    if (!id || !flow) return;
    const payload = { id, name: nameDraft || "Untitled", jsonDefinition: JSON.stringify({ nodes, edges }) };
    const res = await fetch(`${API_BASE}/api/flows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const updated = await res.json();
      setFlow(updated);
    }
    setIsEditingName(false);
  }

  async function saveGraph() {
    console.log('saveGraph called with id:', id, 'flow:', flow);
    if (!id || !flow) {
      console.warn('saveGraph: Missing id or flow, skipping save');
      return;
    }
    
    // Clear pending changes indicator
    setHasPendingChanges(false);
    pendingChangesRef.current = false;
    // Soft-validate: warn if any options are unlinked, but still publish (target can be null)
    const unlinked = nodes
      .filter(n => (n.type || '') === 'menuNode')
      .flatMap(n => (Array.isArray((n.data as any)?.options) ? (n.data as any).options : []).map((o: any, i: number) => ({ menuId: n.id, index: i, o })))
      .filter(({ o }) => !o?.targetId);
    if (unlinked.length) {
      setToast('Some options are not linked yet. Changes were saved, but link to complete flow.');
    }
    const serialized = JSON.stringify({ nodes, edges });
    lastSavedRef.current = serialized;
    // Do not persist the JSON graph via REST; WebSocket publish below is the source of truth

    // Also publish to new App model
    try {
      const appId = id; // reuse project id as app id (UUID)
      // Ensure App exists/upserts via WS (no-op on server if already exists can be added later)

      // Build publish payload from current graph
      const menus = nodes
        .filter((n) => (n.type || '') === 'menuNode')
        .map((n) => {
          const incoming = edges.some(e => e.target === n.id);
          const data: any = n.data || {};
          const opts: any[] = Array.isArray(data.options) ? data.options : [];
          const options = opts.map((o, i) => ({
            id: o.id, // may be undefined; backend will generate
            keyIndex: i + 1,
            label: o.label || '',
            targetMenuId: o.targetId || null
          }));
          // Embed input edge condition (optional). We attach as a special first option (keyIndex: 0)
          const embed = edges.find(e => e.source === n.id && e.sourceHandle === 'embed-input');
          if (embed && (embed.data as any)) {
            const cond = {
              id: (embed.data as any).conditionId,
              code: (embed.data as any).code || '',
              invalidTargetMenuId: (embed.data as any).onInvalidTargetId
            };
            options.unshift({ id: (embed.data as any).optionId, keyIndex: 0, label: 'Input', targetMenuId: (embed.target as any), condition: cond });
          }
          return {
            id: n.id,
            name: data.label || data.name || 'Menu',
            text: data.text || '',
            mode: data.mode || 'menu', // Include mode field
            entry: !incoming,
            subflowId: (nodes.find(m => m.id === (data.parentId || (n as any).parentId)?.toString())?.id) || undefined,
            options,
            // Add position fields
            positionX: n.position.x,
            positionY: n.position.y
          };
        });

      // Use WebSocket exclusively for saving
      const body = { appId, menus };
      console.log('Attempting to save via WebSocket with body:', body);
      const stomp = stompRef.current;
      console.log('WebSocket client state:', { 
        exists: !!stomp, 
        connected: stomp?.connected,
        readyState: stomp?.ws?.readyState 
      });
      
      if (stomp && stomp.connected) {
        console.log('Saving graph via WebSocket to destination:', `/app/apps/${appId}/save-graph`);
        stomp.publish({ destination: `/app/apps/${appId}/save-graph`, body: JSON.stringify(body) });
        console.log('WebSocket publish completed');
      } else {
        console.warn('WebSocket not connected, cannot save. Stomp:', !!stomp, 'Connected:', stomp?.connected);
        setToast('Connection lost. Please refresh the page.');
      }
    } catch (_) {
      // Ignore publish errors; the legacy Flow save still succeeds
    }
  }

  // Remove continuous autosave; saves are scheduled explicitly via scheduleSave or commitNow

  // Automatic history capture on graph changes (throttled by structure changes)
  useEffect(() => {
    const current = JSON.stringify({ nodes, edges });
    if (prevSnapshotRef.current === null) {
      prevSnapshotRef.current = current;
      return;
    }
    if (isUndoRedoRef.current) {
      prevSnapshotRef.current = current;
      return;
    }
    if (prevSnapshotRef.current !== current) {
      try {
        const prev = JSON.parse(prevSnapshotRef.current);
        setHistory((h) => {
          const next = h.concat([{ nodes: prev.nodes || [], edges: prev.edges || [] }]);
          return next.length > 50 ? next.slice(next.length - 50) : next;
        });
        setFuture([]);
      } catch {}
      prevSnapshotRef.current = current;
    }
  }, [nodes, edges]);

  const commitNow = () => { if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; } saveGraph(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as any;
      const isEditable = target && target.tagName && ['input','textarea','select'].includes(String(target.tagName).toLowerCase()) || target?.isContentEditable || target?.getAttribute?.('role') === 'textbox';
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((mod && (key === 'y' || (key === 'z' && e.shiftKey)))) { e.preventDefault(); redo(); }
      if (key === 'delete') {
        if (selectedEdgeIds.length) {
          e.preventDefault();
          setEdges((eds) => eds.filter(e => !selectedEdgeIds.includes(e.id)));
          setSelectedEdgeIds([]);
          return;
        }
        if (selectedNodeId || nodes.some(n => n.selected)) {
          e.preventDefault();
          const ids = nodes.filter(n => n.selected).map(n => n.id);
          doDelete(ids.length ? ids : (selectedNodeId ? [selectedNodeId] : []));
        }
      }
      if (key === 'h') { if (!isEditable) { e.preventDefault(); setForcePan((v) => !v); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodes, edges, selectedNodeId, selectedEdgeIds]);

  return (
    <>
    <div>
      <div className="builder-header">
        <div className="builder-title">ShortNodes &nbsp;·&nbsp; <Link to="/">Projects</Link> &nbsp;/&nbsp; {isEditingName ? (
          <input
            className="titleInput"
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } if (e.key === 'Escape') { setIsEditingName(false); setNameDraft(flow?.name || "Untitled"); } }}
          />
        ) : (
          <button onClick={() => setIsEditingName(true)} style={{ background: "transparent", border: 0, padding: 0, cursor: "text", fontWeight: 600 }}>
            {flow?.name || "Untitled"}
          </button>
        )}</div>
        <div className="builder-actions">
          <button 
            className={`button ${hasPendingChanges ? 'button-pending' : ''}`} 
            onClick={saveGraph}
            title={hasPendingChanges ? 'Changes will auto-save in a moment' : 'Save changes'}
          >
            {hasPendingChanges ? 'Saving...' : 'Save'}
          </button>
          <a className="button" href={`/project/${id}/sandbox`}>Open Sandbox</a>
        </div>
      </div>
      <div className="builder-layout">
        <Sidebar
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => setSelectedNodeId(id)}
          onGoToNode={(id) => {
            setSelectedNodeId(id);
            goToRef.current?.(id);
            setGotoNodeId(id);
            window.setTimeout(() => setGotoNodeId(null), 200); // allow repeated triggers
          }}
          onUnlinkOption={(menuId, optionIndex) => {
            setNodes((nds) => nds.map((n) => {
              if (n.id !== menuId) return n;
              const data = (n.data as any) || {};
              const options = (data.options || []).slice();
              if (!options[optionIndex]) return n;
              options[optionIndex] = { ...options[optionIndex], targetId: undefined };
              return { ...n, data: { ...data, options } } as Node;
            }));
            setEdges((eds) => eds.filter(e => !(e.source === menuId && e.sourceHandle === `opt-${optionIndex}`)));
          }}
        />
        <FlowCanvas
          ref={flowCanvasRef}
          nodes={useMemo(() => nodes.map((n) => ({
            ...n,
            data: {
              ...(n.data as any),
              onRename: (label: string) => setNodes((nds) => nds.map((m) => m.id === n.id ? { ...m, data: { ...(m.data as any), label } } : m)),
              onUpdate: (partial: Record<string, any>) => setNodes((nds) => nds.map((m) => m.id === n.id ? { ...m, data: { ...(m.data as any), ...partial } } : m)),
              onCommit: () => commitNow(),
            }
          })), [nodes])}
          edges={edges}
          onNodesChange={(changes: NodeChange[]) => {
            const isPositionChange = changes.some((c) => c.type === 'position');
            const isDragging = changes.some((c: any) => !!(c as any).dragging);
            setNodes((nds) => applyNodeChanges(changes, nds));
            if (isPositionChange) {
              if (isDragging) {
                // User is actively dragging: suppress inbound refreshes and mark pending
                pendingChangesRef.current = true;
                setHasPendingChanges(true);
                startInteraction();
              } else {
                // Drag ended: persist shortly after to avoid jitter
                markPendingChanges();
                scheduleSave(600);
              }
            }
          }}
          onEdgesChange={(changes: EdgeChange[]) => { 
            setEdges((eds) => applyEdgeChanges(changes, eds)); 
            // Don't save on edge changes - only save on selection changes
          }}
          onSelectionChange={(nodeIds, edgeIds) => {
            // Skip if we're currently restoring selection to prevent loops
            if (isRestoringSelectionRef.current) return;
            
            const nextNodeId = nodeIds[0] || null;
            const prev = lastSelectionRef.current;
            const sameNode = prev.nodeId === nextNodeId;
            const sameEdges = prev.edgeIds.length === edgeIds.length && prev.edgeIds.every((id, i) => id === edgeIds[i]);
            if (sameNode && sameEdges) return;
            
            lastSelectionRef.current = { nodeId: nextNodeId, edgeIds: [...edgeIds] };
            setSelectedNodeId(nextNodeId);
            setSelectedEdgeIds(edgeIds);
            
            // Save selection state to localStorage for persistence across WebSocket updates
            saveSelectionToLocalStorage(nextNodeId, edgeIds);
            
            // Trigger save when selection changes
            markPendingChanges();
            
            // Sync selection with WebSocket for real-time collaboration (debounced)
            setTimeout(() => {
              if (selectedNodeId === nextNodeId && selectedEdgeIds.length === edgeIds.length) {
                syncSelectionWithWebSocket();
              }
            }, 100);
          }}
          onConnect={(connection: Connection) => {
            // If connecting from a menu option handle, persist link onto the option
            if (connection.source && connection.target && connection.sourceHandle) {
              if (connection.sourceHandle.startsWith('opt-')) {
                // Enforce menu → menu only
                const targetNode = nodes.find(n => n.id === connection.target);
                if (!targetNode || targetNode.type !== 'menuNode') {
                  // Block non-menu targets for menu option handles
                  return;
                }
                const index = Number(connection.sourceHandle.replace('opt-', ''));
                setNodes((nds) => nds.map((n) => {
                  if (n.id !== connection.source) return n;
                  const data = (n.data as any) || {};
                  const options = (data.options || []).slice();
                  if (options[index]) {
                    options[index] = { ...options[index], targetId: connection.target };
                    return { ...n, data: { ...data, options } } as Node;
                  }
                  return n;
                }));
                setEdges((eds) => {
                  const filtered = eds.filter(e => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle));
                  return addEdge({ ...connection } as any, filtered);
                });
                // Save will be triggered by selection change
                return;
              } else if (connection.sourceHandle === 'embed-input') {
                setNodes((nds) => nds.map((n) => {
                  if (n.id !== connection.source) return n;
                  const data = (n.data as any) || {};
                  const embedded = data.embeddedInput ? { ...data.embeddedInput, targetId: connection.target } : undefined;
                  return { ...n, data: { ...data, embeddedInput: embedded } } as Node;
                }));
                const prompt = ((nodes.find(n => n.id === connection.source)?.data as any)?.embeddedInput?.prompt) || 'Enter value';
                setEdges((eds) => addEdge({ ...connection, type: 'inputEdge', data: { prompt } } as any, eds));
                // Save will be triggered by selection change
                return;
              }
            }
            setEdges((eds) => addEdge(connection, eds));
            // Save will be triggered by selection change
          }}
          onEmbedInput={(inputId, menuId) => {
            setNodes((nds) => nds.map((n) => {
              if (n.id === menuId) {
                const inputNode = nds.find((m) => m.id === inputId);
                const prompt = (inputNode?.data as any)?.prompt || 'Enter value';
                return { ...n, data: { ...(n.data as any), embeddedInput: { id: inputId, prompt } } } as Node;
              }
              if (n.id === inputId) {
                // hide input by moving off-canvas and flagging
                return { ...n, position: { x: -10000, y: -10000 }, data: { ...(n.data as any), hidden: true } } as Node;
              }
              return n;
            }));
            // Save will be triggered by selection change
          }}
          onOpenContextMenu={(pos, nodeId, selected) => setCtxMenu({ x: pos.x, y: pos.y, nodeId, selected })}
          onReady={({ goToNode, getCenter }) => { goToRef.current = goToNode; getCenterRef.current = getCenter; }}
          showPanHint={true}
          forcePan={forcePan}
          edgeView={edgeView}
          onChangeEdgeView={setEdgeView}
          gotoNodeId={gotoNodeId}
          onGroupSelected={(ids) => {
            if (!ids.length) return;
            pushHistory();
            const bbox = nodes.filter(n => ids.includes(n.id)).reduce((acc, n) => {
              const x = n.position.x || 0, y = n.position.y || 0;
              return { minX: Math.min(acc.minX, x), minY: Math.min(acc.minY, y), maxX: Math.max(acc.maxX, x), maxY: Math.max(acc.maxY, y) };
            }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
            const groupId = crypto.randomUUID();
            const style = { width: (bbox.maxX - bbox.minX) + 80, height: (bbox.maxY - bbox.minY) + 80 } as any;
            const groupNode: Node = { id: groupId, type: 'group', position: { x: bbox.minX - 40, y: bbox.minY - 40 }, data: { label: 'Group' }, style } as Node;
            setNodes(nds => nds
              .map(n => ids.includes(n.id) ? { ...n, data: { ...(n.data as any), parentId: groupId }, extent: 'parent' as any } : n)
              .concat([groupNode])
            );
            // Save will be triggered by selection change
          }}
        />
        {ctxMenu && (
          <div className="ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseLeave={() => setCtxMenu(null)}>
            <div className="ctxitem" onClick={() => { undo(); setCtxMenu(null); }} style={{ opacity: history.length ? 1 : 0.5, pointerEvents: history.length ? 'auto' : 'none' }}>Undo</div>
            <div className="ctxitem" onClick={() => { redo(); setCtxMenu(null); }} style={{ opacity: future.length ? 1 : 0.5, pointerEvents: future.length ? 'auto' : 'none' }}>Redo</div>
            <div className="ctxitem" onClick={() => {
              const ids = ctxMenu.selected.length ? ctxMenu.selected : (ctxMenu.nodeId ? [ctxMenu.nodeId] : []);
              const copies = nodes.filter(n => ids.includes(n.id)).map(n => JSON.parse(JSON.stringify(n)));
              if (copies.length) localStorage.setItem('sn-clipboard', JSON.stringify(copies));
              setCtxMenu(null);
            }}>Copy</div>
            <div className="ctxitem" onClick={() => {
              const raw = localStorage.getItem('sn-clipboard');
              if (!raw) return;
              pushHistory();
              const copies: Node[] = JSON.parse(raw);
              const pasted = copies.map((n, i) => {
                const newId = crypto.randomUUID();
                const baseData: any = JSON.parse(JSON.stringify(n.data || {}));
                if ((n.type || '') === 'menuNode') {
                  const opts = Array.isArray(baseData.options) ? baseData.options : [];
                  baseData.options = opts.map((o: any) => ({ id: crypto.randomUUID(), label: o?.label || '', targetId: undefined }));
                  baseData.embeddedInput = undefined;
                  baseData.label = (baseData.label || 'Menu') + ' (copy)';
                } else {
                  baseData.label = (baseData.label || String(n.type || 'Node')) + ' (copy)';
                }
                return {
                  ...n,
                  id: newId,
                  data: baseData,
                  position: { x: ((n.position as any)?.x || 0) + 30 * (i + 1), y: ((n.position as any)?.y || 0) + 30 * (i + 1) }
                } as Node;
              });
              setNodes(nds => nds.concat(pasted));
              setCtxMenu(null);
              markPendingChanges();
              scheduleSave(800);
            }}>Paste</div>
            <div className="ctxitem" onClick={() => {
              const ids = ctxMenu.selected.length ? ctxMenu.selected : (ctxMenu.nodeId ? [ctxMenu.nodeId] : []);
              pushHistory();
              const clones = nodes.filter(n => ids.includes(n.id)).map((n) => {
                const newId = crypto.randomUUID();
                const baseData: any = JSON.parse(JSON.stringify(n.data || {}));
                if ((n.type || '') === 'menuNode') {
                  const opts = Array.isArray(baseData.options) ? baseData.options : [];
                  baseData.options = opts.map((o: any) => ({ id: crypto.randomUUID(), label: o?.label || '', targetId: undefined }));
                  baseData.embeddedInput = undefined;
                  baseData.label = (baseData.label || 'Menu') + ' (copy)';
                } else {
                  baseData.label = (baseData.label || String(n.type || 'Node')) + ' (copy)';
                }
                return {
                  ...n,
                  id: newId,
                  data: baseData,
                  position: { x: (n.position.x || 0) + 24, y: (n.position.y || 0) + 24 }
                } as Node;
              });
              setNodes(nds => nds.concat(clones));
              setCtxMenu(null);
              // Save will be triggered by selection change
              markPendingChanges();
              scheduleSave(800);
            }}>Duplicate</div>
            <div className="ctxitem" onClick={() => {
              // Minimal group: allow grouping one or many; create a group parent
              const ids = ctxMenu.selected.length ? ctxMenu.selected : (ctxMenu.nodeId ? [ctxMenu.nodeId] : []);
              if (!ids.length) return;
              pushHistory();
              const bbox = nodes.filter(n => ids.includes(n.id)).reduce((acc, n) => {
                const x = n.position.x || 0, y = n.position.y || 0;
                return { minX: Math.min(acc.minX, x), minY: Math.min(acc.minY, y), maxX: Math.max(acc.maxX, x), maxY: Math.max(acc.maxY, y) };
              }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
              const groupId = crypto.randomUUID();
              const style = { width: (bbox.maxX - bbox.minX) + 80, height: (bbox.maxY - bbox.minY) + 80 } as any;
              const groupNode: Node = { id: groupId, type: 'group', position: { x: bbox.minX - 40, y: bbox.minY - 40 }, data: { label: 'Group' }, style } as Node;
              setNodes(nds => nds
                .map(n => ids.includes(n.id) ? { ...n, data: { ...(n.data as any), parentId: groupId }, extent: 'parent' as any } : n)
                .concat([groupNode])
              );
              setCtxMenu(null);
              // Save will be triggered by selection change
            }}>Group</div>
            <div className="ctxitem" onClick={() => {
              const ids = ctxMenu.selected.length ? ctxMenu.selected : (ctxMenu.nodeId ? [ctxMenu.nodeId] : []);
              doUngroup(ids);
              setCtxMenu(null);
              // Save will be triggered by selection change
            }}>Ungroup</div>
            <div className="ctxitem" onClick={() => {
              const ids = ctxMenu.selected.length ? ctxMenu.selected : (ctxMenu.nodeId ? [ctxMenu.nodeId] : []);
              doDelete(ids);
              setCtxMenu(null);
              // Save will be triggered by selection change
            }}>Delete</div>
          </div>
        )}
        <PropertiesPanel
          selectedNode={nodes.find((n) => n.id === (selectedNodeId || "")) || null}
          selectedEdge={edges.find((e) => selectedEdgeIds.includes(e.id)) || null}
          onUpdateNode={(partial) => {
            setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), ...partial } } : n));
          }}
          onUpdateEdge={(partial) => {
            setEdges((eds) => eds.map((e) => selectedEdgeIds.includes(e.id) ? ({ ...e, data: { ...(e.data as any), ...partial } }) : e));
          }}
          allNodes={nodes}
          onCreateEdge={(sourceId, targetId) => setEdges((eds) => addEdge({ source: sourceId, target: targetId }, eds))}
          onLinkOption={(optionIndex, targetId) => {
            // remove any existing edge for this option then add single link
            const sourceId = selectedNodeId;
            if (!sourceId) return;
            setEdges((eds) => {
              const handleId = `opt-${optionIndex}`;
              const filtered = eds.filter(e => !(e.source === sourceId && e.sourceHandle === handleId));
              if (!targetId) return filtered; // unlink
              return addEdge({ source: sourceId, sourceHandle: handleId, target: targetId, type: 'inputEdge' } as any, filtered);
            });
            // Save will be triggered by selection change
          }}
          onDeleteEdge={() => {
            if (!selectedEdgeIds.length) return;
            setEdges((eds) => eds.filter(e => !selectedEdgeIds.includes(e.id)));
            setSelectedEdgeIds([]);
            // Save will be triggered by selection change
          }}
          onUnlinkEmbed={() => {
            if (!selectedNodeId) return;
            setEdges((eds) => eds.filter(e => !(e.source === selectedNodeId && e.sourceHandle === 'embed-input')));
            setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? ({ ...n, data: { ...(n.data as any), embeddedInput: undefined } }) : n));
            // Save will be triggered by selection change
          }}
          onAddChildNode={(type) => {
            const id = crypto.randomUUID();
            const base: any = { label: type.replace('Node',''), parentId: selectedNodeId || undefined };
            if (type === 'menuNode') { base.options = [{ id: crypto.randomUUID(), label: '' }]; base.text = 'Describe this menu...'; }
            setNodes((nds) => nds.concat([{ id, type, position: { x: 150, y: 150 }, data: base }]));
            // For new nodes, we need to save immediately to create the initial data in the database
            if (type === 'menuNode') {
              scheduleSave();
            }
            return id;
          }}
          onCommit={commitNow}
        />
      </div>
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
    <div className="builder-footer">
      <div className="toolbar">
        <button className="tool" title="Pointer (V)" aria-pressed={!forcePan} onClick={() => setForcePan(false)}><MousePointer size={16} /></button>
        <button className="tool" title="Hand (H)" aria-pressed={forcePan} onClick={() => setForcePan(v => !v)}><Hand size={16} /></button>
        <div style={{ width: 1, background: '#e5e7eb', margin: '0 6px' }} />
        <button className="tool" title="Add Menu" onClick={() => addAtCenter('menuNode')}><List size={16} /></button>
        <button className="tool" title="Add Input" onClick={() => addAtCenter('inputNode')}><Type size={16} /></button>
        <button className="tool" title="Add API" onClick={() => addAtCenter('apiNode')}><Plug size={16} /></button>
        <button className="tool" title="Add Subflow" onClick={() => addAtCenter('subflow')}><GitBranch size={16} /></button>
        <button className="tool" title="Add End" onClick={() => addAtCenter('endNode')}><Square size={16} /></button>
        <div style={{ width: 1, background: '#e5e7eb', margin: '0 6px' }} />
        <button className="tool" title="Undo" onClick={undo}><Undo2 size={16} /></button>
        <button className="tool" title="Redo" onClick={redo}><Redo2 size={16} /></button>
      </div>
    </div>
    </>
  );
}

export default Builder;