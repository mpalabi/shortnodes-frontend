import styles from "./PropertiesPanel.module.scss";
import { useEffect, useMemo, useState } from "react";
import type { Node, Edge } from "reactflow";

type Props = {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  onUpdateNode: (partial: Record<string, any>) => void;
  onUpdateEdge: (partial: Record<string, any>) => void;
  allNodes: Node[];
  onCreateEdge: (sourceId: string, targetId: string) => void;
  onAddChildNode: (type: string) => string; // returns new node id
  onCommit: () => void;
  onLinkOption?: (optionIndex: number, targetId?: string) => void;
  onDeleteEdge?: () => void;
  onUnlinkEmbed?: () => void;
};

function PropertiesPanel({ selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, allNodes, onCreateEdge: _onCreateEdge, onAddChildNode: _onAddChildNode, onCommit, onLinkOption, onDeleteEdge, onUnlinkEmbed }: Props) {
  const [tab, setTab] = useState("Node");
  const data = useMemo(() => (selectedNode?.data as any) || {}, [selectedNode]);
  useEffect(() => {
    if (!selectedNode) return;
    const t = (selectedNode.type || '').toLowerCase();
    if (t.includes('menu')) setTab('Menu');
    else if (t.includes('input')) setTab('Input');
    else if (t.includes('api')) setTab('API');
    else setTab('Node');
  }, [selectedNode?.id]);

  return (
    <div className={styles.properties}>
      <div className={styles.tabs}>
        {(["Node", "Menu", "Input", "API", "Flow", "Actions"] as const).map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.activeTab : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {!selectedNode && !selectedEdge && (
        <div className={styles.empty}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyTitle}>Select something to edit</div>
            <div className={styles.emptyHint}>Click a node or an edge on the canvas to see its properties here.</div>
          </div>
        </div>
      )}

      {tab === "Node" && (
        <div className={styles.field}>
          <label className={styles.label}>Label</label>
          <input className={styles.input}
            type="text"
            placeholder="Node label"
            value={data.label || ""}
            onChange={(e) => onUpdateNode({ label: e.target.value })}
          />
        </div>
      )}
      {!!selectedEdge && (
        <div>
          <div className={styles.groupTitle}>Edge</div>
          <div className={styles.field}>
            <label className={styles.label}>Prompt</label>
            <input className={styles.input}
              type="text"
              placeholder="Enter value"
              value={((selectedEdge.data as any)?.prompt) || ''}
              onChange={(e) => onUpdateEdge({ prompt: e.target.value })}
              onBlur={onCommit}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Logic</label>
            <textarea className={styles.textarea}
              rows={5}
              placeholder={"// if (!isNumeric(input)) { invalid }"}
              value={((selectedEdge.data as any)?.code) || ''}
              onChange={(e) => onUpdateEdge({ code: e.target.value })}
              onBlur={onCommit}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>On invalid →</label>
            <select className={styles.select}
              value={((selectedEdge.data as any)?.onInvalidTargetId) || ''}
              onChange={(e) => onUpdateEdge({ onInvalidTargetId: e.target.value || undefined })}
              onBlur={onCommit}
            >
              <option value="">— select node —</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>{(n.data as any)?.label || n.type || n.id}</option>
              ))}
            </select>
          </div>
          <div className={styles.btnBar}>
            <button className={styles.btn} onClick={() => { onDeleteEdge && onDeleteEdge(); onCommit(); }}>Remove Edge</button>
          </div>
        </div>
      )}
      {tab === "Menu" && (
        <div>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input}
            type="text"
            placeholder="Menu name"
            value={data.label || ''}
            onChange={(e) => onUpdateNode({ label: e.target.value })}
            onBlur={onCommit}
          />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Text</label>
            <textarea className={styles.textarea}
            placeholder="Welcome message..."
            value={data.text || ""}
            onChange={(e) => onUpdateNode({ text: e.target.value })}
            onBlur={onCommit}
          />
          </div>
          <div className={styles.groupTitle}>Options</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(data.options || []).map((opt: any, idx: number) => (
              <div key={opt.id || idx} className={styles.optionRow}>
                <input className={styles.input}
                  type="text"
                  placeholder={`Label ${idx + 1}`}
                  value={opt.label || ''}
                  onChange={(e) => {
                    const next = [...(data.options || [])];
                    next[idx] = { ...opt, label: e.target.value };
                    onUpdateNode({ options: next });
                  }}
                  onBlur={onCommit}
                />
                <select className={styles.select}
                  value={opt.targetId || ''}
                  onChange={(e) => {
                    const targetId = e.target.value || undefined;
                    const next = [...(data.options || [])];
                    next[idx] = { ...opt, targetId };
                    onUpdateNode({ options: next });
                    if (onLinkOption) onLinkOption(idx, targetId);
                  }}
                  onBlur={onCommit}
                >
                  <option value="">— link to node —</option>
                  {allNodes.filter((n) => n.type !== 'inputNode').map((n) => (
                    <option key={n.id} value={n.id}>{(n.data as any)?.label || n.type || n.id}</option>
                  ))}
                </select>
                <button className={styles.btn} onClick={() => {
                  const next = [...(data.options || [])];
                  next.splice(idx, 1);
                  onUpdateNode({ options: next });
                }}
                onBlur={onCommit}
                >Remove</button>
              </div>
            ))}
          </div>
          <div className={styles.btnBar}>
            <button className={styles.btn} onClick={() => {
              const next = [...(data.options || []), { id: crypto.randomUUID(), label: '', targetId: '' }];
              onUpdateNode({ options: next });
            }} onBlur={onCommit}>+ Add Option</button>
            {onUnlinkEmbed && (
              <button className={styles.btn} onClick={() => { onUnlinkEmbed(); onCommit(); }}>Unlink embedded input</button>
            )}
          </div>
        </div>
      )}
      {tab === "Input" && (
        <div>
          <div className={styles.field}>
            <label className={styles.label}>Prompt</label>
            <input className={styles.input}
            type="text"
            placeholder="Ask for value"
            value={data.prompt || ""}
            onChange={(e) => onUpdateNode({ prompt: e.target.value })}
            onBlur={onCommit}
          />
          </div>
          <label className={styles.label}>Pseudo Code</label>
          <textarea className={styles.textarea}
            placeholder="// write pseudo logic here"
            rows={6}
            value={data.code || ''}
            onChange={(e) => onUpdateNode({ code: e.target.value })}
            onBlur={onCommit}
          />
        </div>
      )}
      {tab === "API" && (
        <div>
          <label>API Config ID</label>
          <input
            type="text"
            placeholder="UUID of ApiConfig"
            value={data.apiConfigId || ""}
            onChange={(e) => onUpdateNode({ apiConfigId: e.target.value })}
          />
        </div>
      )}
      {tab === "Flow" && (
        <div>
          <label>Subflow ID</label>
          <input
            type="text"
            placeholder="UUID of Flow"
            value={data.subflowId || ""}
            onChange={(e) => onUpdateNode({ subflowId: e.target.value })}
          />
        </div>
      )}
      {tab === "Actions" && (
        <div>
          <button>Validate</button>
          <button style={{ marginLeft: 8 }}>Apply</button>
        </div>
      )}
    </div>
  );
}

export default PropertiesPanel;

