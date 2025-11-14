import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Play, RotateCcw } from "lucide-react";
import PhoneFrame from "../components/PhoneFrame";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

type AppItem = { id: string; name: string };
type Menu = { id: string; name: string; text: string };

function Sandbox() {
  const { id } = useParams();
  const autoSession = useMemo(() => crypto.randomUUID(), []);
  const [sessionId, setSessionId] = useState<string>(autoSession as unknown as string);
  const [input, setInput] = useState("");
  const [flowId, setFlowId] = useState("");
  const [screen, setScreen] = useState<string>("");
  const [apps, setApps] = useState<AppItem[]>([]);
  const [entryMenus, setEntryMenus] = useState<Menu[]>([]);
  const [backendMenuId, setBackendMenuId] = useState<string | undefined>(undefined);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState(false); // interaction-only view

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/api/apps`);
      if (res.ok) setApps(await res.json());
    })();
  }, []);

  // Load entry menus from backend for the selected project (appId)
  useEffect(() => {
    (async () => {
      if (!flowId) { setEntryMenus([]); setSelectedEntryId(""); return; }
      try {
        const res = await fetch(`${API_BASE}/api/apps/${flowId}/menus/entries`);
        if (res.ok) setEntryMenus(await res.json()); else setEntryMenus([]);
      } catch { setEntryMenus([]); }
    })();
  }, [flowId]);

  // If project id provided in route, preselect it
  useEffect(() => {
    if (id) setFlowId(id);
  }, [id]);

  // Local JSON simulation removed. Backend is the source of truth.

  async function send(value?: string) {
    if (!flowId) {
      setScreen('Select a subflow first.');
      return;
    }
    try {
      setLoading(true);
      const url = new URL(`${API_BASE}/api/app-ussd/${encodeURIComponent(sessionId)}`);
      url.searchParams.set('appId', flowId);
      // Always include current menuId when known so backend can route correctly
      const currentId = backendMenuId || selectedEntryId;
      if (currentId) url.searchParams.set('menuId', currentId);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: value ?? input,
      });
      const text = await res.text();
      const menuHeader = res.headers.get('X-Menu-Id') || undefined;
      if (menuHeader) setBackendMenuId(menuHeader);
      if (!res.ok) {
        // Avoid exposing raw server errors; show a friendly message
        setScreen('Service unavailable. Please try again.');
      } else {
        setScreen(text);
      }
    } catch (_) {
      setScreen('Network error. Check connection and retry.');
    } finally {
      setInput("");
      setLoading(false);
    }
  }

  function start() {
    if (!flowId || loading) return;
    setBackendMenuId(undefined);
    send("");
    setFocus(true);
  }

  function restart() {
    if (loading) return;
    setSessionId(crypto.randomUUID());
    setBackendMenuId(undefined);
    setScreen("");
  }

  return (
    <div style={{ padding: 24 }}>
      {!focus && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/">Overview</Link>
            {flowId && (
              <>
                <span>/</span>
                <Link to={`/project/${flowId}`}>{apps.find(a => a.id === flowId)?.name || flowId}</Link>
              </>
            )}
            <span>/</span>
            <span>Sandbox</span>
          </div>
        </div>
      )}

      <div style={{ display: focus ? 'block' : 'grid', gridTemplateColumns: focus ? undefined : '320px 1fr', gap: 24 }}>
      {!focus && (
        <div className="card" style={{ padding: 16, height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Sandbox</h3>
          <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Project</label>
            <select style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} value={flowId} onChange={(e) => { setFlowId(e.target.value); setSelectedEntryId(''); setScreen(''); }}>
              <option value="">— select a project —</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {entryMenus.length > 0 && (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Start from entry</label>
                <select
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  value={selectedEntryId}
                  onChange={(e) => setSelectedEntryId(e.target.value)}
                >
                  <option value="">— auto-detect —</option>
                  {entryMenus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Session ID</label>
            <input style={{ width: "100%", padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
          </div>
          {/* Input moved into phone UI */}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Phone toolbar */}
        {!focus && flowId && (
          <div style={{ position: 'absolute', top: -14, display: 'flex', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', padding: 6, zIndex: 5 }}>
            <button className="button" onClick={start} disabled={loading} title="Start" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Play size={16} /> Start
            </button>
            <button className="button" onClick={restart} disabled={loading} title="Restart" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={16} /> Restart
            </button>
          </div>
        )}
        {focus && (
          <div style={{ position: 'absolute', top: -14, right: 0 }}>
            <button className="button" onClick={() => setFocus(false)}>Show controls</button>
          </div>
        )}
        <PhoneFrame
          width={360}
          leftLabel="Back"
          centerLabel="Send"
          rightLabel="Exit"
          onLeft={() => !loading && flowId && send('0')}
          onCenter={() => !loading && flowId && send()}
          onRight={() => !loading && flowId && send('00')}
        >
          <div style={{ position: 'relative', minHeight: 360 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', transition: 'opacity 200ms', opacity: loading ? 0.4 : 1 }}>
            {screen || 'Select a subflow, enter input, then Send.'}
          </pre>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 50 50" aria-label="Loading">
                <circle cx="25" cy="25" r="20" stroke="#60a5fa" strokeWidth="4" fill="none" strokeDasharray="31.4 31.4">
                  <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
          )}
          {/* In-phone input row */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, padding: '6px 6px 0 6px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); !loading && flowId && send(); } }}
                disabled={!flowId || loading}
                placeholder="Type a number or text"
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #374151', background: '#0b0f19', color: '#e5e7eb' }}
              />
              <button
                onClick={() => !loading && flowId && send()}
                disabled={!flowId || loading}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#e5e7eb' }}
              >Send</button>
            </div>
          </div>
          </div>
        </PhoneFrame>
      </div>
    </div>
  </div>
  );
}

export default Sandbox;

