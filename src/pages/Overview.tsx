import { useEffect, useState } from 'react'
import { MoreHorizontal, Trash2, Share2, Copy, FolderPlus } from 'lucide-react';
import Skeleton from '../components/ui/Skeleton';
import AuthModal from '../components/AuthModal';
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

type Flow = { id: string; name: string; jsonDefinition: string };

function Overview() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [authOpen, setAuthOpen] = useState(false);
  const navigate = useNavigate();

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/flows`);
      const data = await res.json();
      setFlows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    const payload = {
      name: name || "New USSD App",
      jsonDefinition: '{"nodes":[],"edges":[]}'
    };
    const res = await fetch(`${API_BASE}/api/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const created = await res.json();
    navigate(`/project/${created.id}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          <button onClick={create}>Create</button>
          <button className="button" onClick={() => setAuthOpen(true)}>Sign in</button>
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: 16 }}>
              <Skeleton className="w-3/5 h-4 rounded-md" />
              <Skeleton className="w-2/5 h-3 rounded-md mt-2.5" />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Skeleton className="w-[72px] h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10vh 0' }}>
          <div className="card" style={{ padding: 24, textAlign: 'center', maxWidth: 520 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <FolderPlus size={22} color="#111827" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No projects yet</div>
            <div style={{ color: '#6b7280', marginBottom: 16 }}>Create your first USSD app to start designing menus and flows.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
              <button className="button" onClick={create}>Create project</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {flows.map(f => (
            <div key={f.id} className="card" style={{ padding: 16, position: 'relative' }}>
              {editingId === f.id ? (
                <input
                  className="titleInput"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={async () => {
                    setEditingId(null);
                    if (!draft || draft === f.name) return;
                    await fetch(`${API_BASE}/api/flows/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, name: draft }) });
                    load();
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditingId(null); setDraft(f.name); } }}
                />
              ) : (
                <button onClick={() => { setEditingId(f.id); setDraft(f.name); }} style={{ background: 'transparent', border: 0, padding: 0, textAlign: 'left', width: '100%', fontWeight: 600, cursor: 'text' }}>{f.name}</button>
              )}
              <div style={{ color: '#6b7280', marginTop: 6 }}>ID: {f.id}</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="button" onClick={() => navigate(`/project/${f.id}`)}>Open</button>
                <div style={{ marginLeft: 'auto', position: 'relative' }}>
                  <ProjectMenu id={f.id} onDeleted={load} />
                </div>
              </div>
              <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Added by</div>
                <div style={{ marginTop: 8 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      margin: '0 auto',
                      background: '#f3f4f6',
                      color: '#111827',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600
                    }}
                  >
                    {/* Initials placeholder */}
                    {(f.name || 'A').slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>Requester</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

export default Overview;

function ProjectMenu({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="button" onClick={() => setOpen(o => !o)} aria-label="More"><MoreHorizontal size={16} /></button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 36, padding: 8, zIndex: 10 }} onMouseLeave={() => setOpen(false)}>
          <button className="button" onClick={async () => { await navigator.clipboard.writeText(id); setOpen(false); }}><Copy size={14} />&nbsp;Copy ID</button>
          <button className="button" onClick={() => { const url = `${location.origin}/sandbox?flowId=${id}`; navigator.clipboard.writeText(url); setOpen(false); }} style={{ marginTop: 6 }}><Share2 size={14} />&nbsp;Share Link</button>
          <button className="button" onClick={async () => { await fetch(`${API_BASE}/api/flows/${id}`, { method: 'DELETE' }); setOpen(false); onDeleted(); }} style={{ marginTop: 6, color: '#b91c1c' }}><Trash2 size={14} />&nbsp;Delete</button>
        </div>
      )}
    </div>
  );
}

