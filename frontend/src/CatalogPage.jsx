import { useState, useEffect, useCallback } from 'react';
import dagre from 'dagre';
import { Position } from 'reactflow';

const API = 'http://127.0.0.1:8000';
const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const LANE_HEIGHT = 240;
const LANE_HEADER_WIDTH = 130;
const LANE_PADDING_X = 20;

const makeLabel = (baseLabel, actor, showActors) =>
  actor && showActors ? `${baseLabel} (${actor})` : baseLabel;

const buildSwimLaneLayout = (taskNodes, edges) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120 });
  taskNodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const xMap = {};
  taskNodes.forEach((n) => { xMap[n.id] = g.node(n.id).x - NODE_WIDTH / 2; });
  const maxContentX = taskNodes.length > 0 ? Math.max(...taskNodes.map((n) => xMap[n.id])) + NODE_WIDTH + LANE_PADDING_X : 400;
  const laneWidth = LANE_HEADER_WIDTH + maxContentX + LANE_PADDING_X;

  const actorOrder = [];
  const seen = new Set();
  taskNodes.forEach((n) => {
    const actor = n.data?.actor || '';
    if (!seen.has(actor)) { seen.add(actor); actorOrder.push(actor); }
  });

  const laneNodes = [];
  const positionedTaskNodes = [];

  actorOrder.forEach((actor, idx) => {
    const laneY = idx * (LANE_HEIGHT + 8);
    const laneId = `__lane__${actor || '__none__'}`;
    laneNodes.push({
      id: laneId, type: 'swimlane', data: { label: actor || 'Bez roly' },
      position: { x: 0, y: laneY }, style: { width: laneWidth, height: LANE_HEIGHT },
      selectable: false, draggable: false, zIndex: -1,
    });
    taskNodes.filter((n) => (n.data?.actor || '') === actor).forEach((n) => {
      const dagreY = g.node(n.id).y;
      const relativeY = Math.max(0, dagreY - 25);
      positionedTaskNodes.push({
        ...n, parentNode: laneId, extent: 'parent',
        position: { x: LANE_HEADER_WIDTH + LANE_PADDING_X + xMap[n.id], y: relativeY },
        sourcePosition: Position.Right, targetPosition: Position.Left, zIndex: 10,
      });
    });
  });
  return { nodes: [...laneNodes, ...positionedTaskNodes], edges };
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

function CatalogPage({ username, onLoadModel, onClose, onLogout }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('my'); // 'my' alebo 'public'

  const fetchCatalog = useCallback(async (searchQuery, currentTab) => {
    setLoading(true);
    try {
      const q = encodeURIComponent(searchQuery || '');

      let resp;
      if (currentTab === 'my') {
        if (!username) return; // Poistka
        resp = await fetch(`${API}/catalog?q=${q}`, { headers: getAuthHeaders() });
      } else {
        // Verejný katalóg nepotrebuje hlavičky s tokenom
        resp = await fetch(`${API}/public-catalog?q=${q}`);
      }

      if (resp.status === 401) {
        alert("Relácia vypršala. Prihlás sa znova.");
        onLogout();
        return;
      }
      if (!resp.ok) throw new Error('Chyba načítania katalógu');

      const data = await resp.json();
      setItems(data);
    } catch (err) {
      console.error(err);
      alert('Katalóg sa nepodarilo načítať.');
    } finally {
      setLoading(false);
    }
  }, [username, onLogout]);

  useEffect(() => {
    fetchCatalog(search, tab);
  }, [tab, fetchCatalog]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCatalog(search, tab), 300);
    return () => clearTimeout(timer);
  }, [search, tab, fetchCatalog]);

    const loadProcess = async (id) => {
    try {
      const resp = await fetch(`${API}/catalog/${id}`, { headers: getAuthHeaders() });
      if (!resp.ok) {
        if(resp.status === 403) throw new Error('Nemáš prístup k tomuto diagramu (musíš byť autor)');
        throw new Error('Načítanie zlyhalo');
      }
      const data = await resp.json();

      const rawNodes = data.model_json.nodes.map((n) => ({
        id: n.id, type: 'default',
        data: { label: makeLabel(n.label, n.actor || '', true), baseLabel: n.label, actor: n.actor || '', nodeType: n.type || 'task' },
        position: { x: 0, y: 0 },
      }));
      const rawEdges = data.model_json.edges.map((e) => ({
        id: e.id, source: e.source, target: e.target, label: e.label || null, type: 'smoothstep',
      }));

      // ZMENA: Už nevoláme buildSwimLaneLayout tu.
      // Posielame do hlavnej appky len surové uzly (rawNodes a rawEdges)
      onLoadModel(rawNodes, rawEdges, data.prompt);
      onClose();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteProcess = async (id, title) => {
    if (!window.confirm(`Naozaj chceš zmazať „${title}"?`)) return;
    try {
      const resp = await fetch(`${API}/catalog/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!resp.ok) {
        if(resp.status === 403) throw new Error('Môžeš mazať len svoje vlastné diagramy!');
        throw new Error('Zmazanie zlyhalo');
      }
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', boxSizing: 'border-box', background: '#f8f9fa' }}>
      {/* Header a Záložky */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Záložky */}
        <div style={{ display: 'flex', gap: '5px', background: '#e0e0e0', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setTab('my')}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
              background: tab === 'my' ? '#fff' : 'transparent',
              color: tab === 'my' ? '#000' : '#666',
              boxShadow: tab === 'my' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🔒 Môj Katalóg
          </button>
          <button
            onClick={() => setTab('public')}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
              background: tab === 'public' ? '#fff' : 'transparent',
              color: tab === 'public' ? '#000' : '#666',
              boxShadow: tab === 'public' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🌍 Verejný Katalóg
          </button>
        </div>

        <input
          placeholder="🔍 Hľadaj v názve alebo popise..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '6px' }}
        />
        <button onClick={onClose} style={{ padding: '10px 20px', background: '#555', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ✕ Zavrieť
        </button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888' }}>⏳ Načítavam...</p>}

      {/* Grid kariet */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {items.map((proc) => (
            <div key={proc.id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '20px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: '8px' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, color: '#0066cc', fontSize: '16px', flex: 1 }}>{proc.title}</h3>
                {proc.is_public ? <span title="Verejný" style={{fontSize: '12px'}}>🌍</span> : <span title="Súkromný" style={{fontSize: '12px'}}>🔒</span>}
              </div>

              <p style={{ margin: 0, color: '#444', fontSize: '13px', lineHeight: 1.5 }}>
                <strong>Popis:</strong> {proc.prompt.length > 100 ? proc.prompt.slice(0, 100) + '...' : proc.prompt}
              </p>

              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#666' }}>
                <span>👤 <strong>{proc.username}</strong></span>
                <span>🔢 <strong>{proc.final_node_count}</strong> uzlov</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => loadProcess(proc.id)} style={{ flex: 1, background: '#0066cc', color: 'white', border: 'none', padding: '9px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>📂 Načítať</button>
                {tab === 'my' && (
                  <button onClick={() => deleteProcess(proc.id, proc.title)} style={{ background: '#cc3300', color: 'white', border: 'none', padding: '9px 13px', borderRadius: '5px', cursor: 'pointer' }}>🗑️</button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#888' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '16px', fontStyle: 'italic' }}>
            {tab === 'my' ? 'Tvoj katalóg je zatiaľ prázdny.' : 'Nenašli sa žiadne verejné diagramy.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default CatalogPage;