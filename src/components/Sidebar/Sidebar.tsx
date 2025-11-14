import styles from "./Sidebar.module.scss";
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { Node } from "reactflow";
import { List, Type, Plug, GitBranch, Square, Crosshair, Link2Off } from 'lucide-react';

type Props = {
  nodes: Node[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onGoToNode?: (id: string) => void;
  onUnlinkOption?: (menuId: string, optionIndex: number) => void;
};

function Sidebar({ nodes, selectedNodeId, onSelectNode, onGoToNode, onUnlinkOption }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  type TreeNode = { id: string; label: string; meta?: string; icon?: ReactElement; children?: TreeNode[]; onClick?: () => void };

  // Basic parent-child nesting using data.parentId if present
  const tree = useMemo<TreeNode[]>(() => {
    const idToNode: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      const label = (n.data as any)?.label || n.type || n.id;
      const type = (n.type || '').toLowerCase();
      const icon = type.includes('menu') ? <List size={14} />
        : type.includes('input') ? <Type size={14} />
        : type.includes('api') ? <Plug size={14} />
        : type.includes('subflow') ? <GitBranch size={14} />
        : <Square size={14} />;
      const metaParts: string[] = [];
      if (type.includes('menu')) {
        const opts = ((n.data as any)?.options || []).length;
        if (opts) metaParts.push(`${opts}`);
        if ((n.data as any)?.embeddedInput) metaParts.push('input');
      }
      idToNode[n.id] = { id: n.id, label, icon, meta: metaParts.join(' • ') };
    }
    for (const n of nodes) {
      const parentId = (n as any).parentId as string | undefined;
      const current = idToNode[n.id];
      current.onClick = () => onSelectNode(n.id);
      if (parentId && idToNode[parentId]) {
        const parent = idToNode[parentId];
        (parent.children ||= []).push(current);
      } else {
        roots.push(current);
      }
    }
    return roots;
  }, [nodes, onSelectNode]);

  const Row = ({ node, depth = 0 }: { node: TreeNode; depth?: number }) => {
    const hasChildren = (node.children?.length || 0) > 0;
    const rowNode = nodes.find(n => n.id === node.id);
    const options = (((rowNode?.data as any) || {}).options || []) as any[];
    const hasList = options.length > 0;
    const hasExpander = hasChildren || hasList;
    const isOpen = open[node.id] ?? false;
    return (
      <div>
        <div className={`${styles.treeItem} ${node.id === selectedNodeId ? styles.active : ''}`} style={{ paddingLeft: 6 + depth * 12 }}>
          {hasExpander ? (
            <button className={styles.caretBtn} onClick={() => setOpen(o => ({ ...o, [node.id]: !isOpen }))}>{isOpen ? '▾' : '▸'}</button>
          ) : (
            <span className={styles.indent}></span>
          )}
          <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}>{node.icon}</span>
          <span className={styles.label}>
            <button
              className={styles.labelBtn}
              onClick={node.onClick}
              style={undefined}
            >
              {node.label}
            </button>
          </span>
          {node.meta && (
            <button className={styles.metaBtn} onClick={() => setOpen(o => ({ ...o, [node.id]: !(open[node.id] ?? true) }))}>{node.meta}</button>
          )}
          {onGoToNode && (
            <button className={styles.iconBtn} title="Go to" onClick={() => onGoToNode(node.id)}>
              <Crosshair size={14} />
            </button>
          )}
        </div>
        {/* Inline preview of menu items if present */}
        {hasList && isOpen && (
          <div style={{ marginLeft: 28 }}>
            {options.map((o: any, i: number) => {
              const target = o.targetId ? nodes.find(n => n.id === o.targetId) : null;
              const targetLabel = target ? ((target.data as any)?.label || target.type || target.id) : '';
              return (
                <div key={o.id || i} className={styles.treeItem} style={{ paddingLeft: 6 + (depth + 1) * 12 }}>
                  <span className={styles.indent}></span>
                  <span className={styles.icon}></span>
                  <button className={styles.labelBtn} onClick={() => onSelectNode(node.id)}>
                    {i + 1}. {(o.label || '') || '(no label)'}
                    {target && onGoToNode ? (
                      <button className={styles.metaBtn} onClick={(e) => { e.stopPropagation(); onGoToNode(target.id); }}>
                        → {targetLabel}
                      </button>
                    ) : targetLabel ? (
                      <span className={styles.meta}>&nbsp;→ {targetLabel}</span>
                    ) : (
                      <span className={styles.meta} style={{ color: '#b91c1c' }}>&nbsp;— unlinked</span>
                    )}
                  </button>
                  {target && onUnlinkOption && (
                    <button className={styles.iconBtn} title="Unlink" onClick={(e) => { e.stopPropagation(); onUnlinkOption(node.id, i); }}>
                      <Link2Off size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasChildren && isOpen && node.children!.map(child => (
          <Row key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  };

  return (
    <div className={styles.sidebar}>
      {tree.length === 0 ? (
        <div style={{ padding: 12 }}>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No nodes yet</div>
            <div style={{ color: '#6b7280' }}>Use the toolbar to add a Menu, then drag an Input into it.</div>
          </div>
        </div>
      ) : (
        <div className={styles.tree}>
          {tree.map(n => <Row key={n.id} node={n} />)}
        </div>
      )}
    </div>
  );
}

export default Sidebar;

