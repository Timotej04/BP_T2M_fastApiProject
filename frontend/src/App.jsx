import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import CatalogPage from './CatalogPage';
import AuthModal from './AuthModal'; // Náš nový auth modal

const API = 'http://127.0.0.1:8000';
const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const LANE_HEIGHT = 240;
const LANE_HEADER_WIDTH = 130;
const LANE_PADDING_X = 20;

// ── SwimlaneNode komponent ─────────────────────────────────
const SwimlaneNode = ({ data }) => (
  <div style={{ width: '100%', height: '100%', border: '2px solid #999', borderRadius: 6, display: 'flex', backgroundColor: 'transparent', pointerEvents: 'none' }}>
    <div style={{ width: LANE_HEADER_WIDTH, minWidth: LANE_HEADER_WIDTH, borderRight: '2px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#dde4ef', color: '#000000', fontWeight: 'bold', fontSize: 13, padding: '0 10px', textAlign: 'center', borderRadius: '4px 0 0 4px' }}>
      {data.label}
    </div>
  </div>
);

const nodeTypes = { swimlane: SwimlaneNode };

// ── Swim Lane Layout ───────────────────────────────────────
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

const makeLabel = (baseLabel, actor, showActors) => actor && showActors ? `${baseLabel} (${actor})` : baseLabel;

const stripLaneProps = (nodes) => nodes.filter((n) => n.type !== 'swimlane').map((n) => ({ ...n, parentNode: undefined, extent: undefined, position: { x: 0, y: 0 } }));

async function generateDiagramFromText(description, minNodes, maxNodes) {
  const response = await fetch(`${API}/generate-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, min_nodes: parseInt(minNodes, 10), max_nodes: parseInt(maxNodes, 10) }),
  });
  if (!response.ok) throw new Error('AI API zlyhalo');
  return response.json();
}

// ── Hlavný App komponent ───────────────────────────────────
function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [showActors, setShowActors] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [minNodes, setMinNodes] = useState(2);
  const [maxNodes, setMaxNodes] = useState(6);

  const [view, setView] = useState('editor'); // 'editor' | 'catalog'

  // Auth stavy
  const [username, setUsername] = useState(localStorage.getItem('auth_username') || null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // Čo urobiť po úspešnom prihlásení?

  const taskNodes = nodes.filter((n) => n.type !== 'swimlane');

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)), [setEdges]);

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    const nonLane = sel?.find((n) => n.type !== 'swimlane');
    setSelectedNodeId(nonLane ? nonLane.id : null);
    if (nonLane) setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = (_event, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  // ── Generovanie z AI (Verejné) ───────────────────────────
    // ── Generovanie z AI (Verejné) ───────────────────────────
  const loadModel = async () => {
    setIsLoading(true);
    try {
      const data = await generateDiagramFromText(promptText || 'Vygeneruj jednoduchý business proces', minNodes, maxNodes);

      // PRIDANÁ KONTROLA: Ak backend vrátil dummy_model kvôli chybe
      if (data.nodes.some(n => n.id === "start" && n.label === "Chyba AI")) {
        const errMsg = data.nodes.find(n => n.id === "end")?.label || "Neznáma chyba";
        alert(`Umelá inteligencia vrátila chybu:\n\n${errMsg}\n\nPozri terminál backendu pre viac detailov.`);
        setIsLoading(false);
        return; // Zastavíme vykresľovanie prázdneho grafu
      }

      const rawNodes = (data.nodes || []).map((node) => ({
        id: node.id, type: 'default',
        data: { label: makeLabel(node.label, node.actor || '', showActors), baseLabel: node.label, actor: node.actor || '', nodeType: node.type || 'task' },
        position: { x: 0, y: 0 },
      }));
      const rawEdges = (data.edges || []).map((edge) => ({
        id: edge.id, source: edge.source, target: edge.target, label: edge.label || null, type: 'smoothstep',
      }));

      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(rawNodes, rawEdges);
      setNodes(laid); setEdges(laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null); setNextId(1);
    } catch (err) {
      alert(`Generovanie zlyhalo: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Auth Logika ──────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    setUsername(null);
    setView('editor');
  };

  const requireAuth = (actionCallback) => {
    if (localStorage.getItem('auth_token')) {
      actionCallback(); // Ak je prihlásený, urob to hneď
    } else {
      setPendingAction(() => actionCallback); // Ulož, čo chcel urobiť
      setShowAuthModal(true); // Zobraz login
    }
  };

  const onLoginSuccess = (user) => {
    setUsername(user);
    setShowAuthModal(false);
    if (pendingAction) {
      pendingAction(); // Spusti to, čo bolo odložené pred prihlásením
      setPendingAction(null);
    }
  };

  // ── Uloženie do SQLite (Zabezpečené) ─────────────────────
  const executeSaveToCatalog = async () => {
    if (taskNodes.length === 0) {
      alert('Nie je čo uložiť. Najprv vygeneruj alebo vytvor diagram.');
      return;
    }

    const title = window.prompt('Názov diagramu (napr. "Výpožičanie knihy"):');
    if (!title || !title.trim()) return;
    const isPublic = window.confirm('Chceš, aby bol tento diagram verejný a videli ho aj ostatní? (OK=Áno, Zrušiť=Súkromný)');

    const processModel = {
      nodes: taskNodes.map((n) => ({
        id: n.id, type: n.data.nodeType || 'task', label: n.data.baseLabel || n.data.label, actor: n.data.actor || null,
      })),
      edges: edges.map((e) => ({
        id: e.id, source: e.source, target: e.target, label: e.label || null,
      })),
    };

    try {
      const resp = await fetch(`${API}/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          title: title.trim(), prompt: promptText,
          min_nodes: Number(minNodes), max_nodes: Number(maxNodes),
          final_node_count: taskNodes.length, model_json: processModel, is_public: isPublic
        }),
      });

      if (resp.status === 401) {
        handleLogout();
        alert('Prihlásenie vypršalo. Prihlás sa znova.');
        return;
      }
      if (!resp.ok) throw new Error('Ukladanie zlyhalo');

      const data = await resp.json();
      alert(`✅ Uložené ako „${title.trim()}" (ID #${data.id})`);
    } catch (err) {
      alert('Ukladanie zlyhalo.');
    }
  };

  // Tlačidlá volajú requireAuth s príslušnou akciou
  const saveToCatalog = () => requireAuth(executeSaveToCatalog);
  const openCatalog = () => requireAuth(() => setView('catalog'));

  // ── Operácie s uzlami (Rovnaké) ──────────────────────────
  const addNode = () => {
    const id = `new-${nextId}`; setNextId((n) => n + 1);
    const newNode = { id, type: 'default', data: { label: makeLabel(`Nový krok ${nextId}`, '', showActors), baseLabel: `Nový krok ${nextId}`, actor: '', nodeType: 'task' }, position: { x: 0, y: 0 } };
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout([...stripLaneProps(nodes), newNode], edges);
    setNodes(laid); setEdges(laidEdges);
  };
  const renameSelected = () => {
    if (!selectedNodeId) return;
    const newLabel = window.prompt('Nový názov kroku:');
    if (!newLabel) return;
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, baseLabel: newLabel, label: makeLabel(newLabel, n.data.actor || '', showActors) } } : n));
  };
  const changeActorSelected = () => {
    if (!selectedNodeId) return;
    const newActor = window.prompt('Nový actor (kto vykonáva činnosť):');
    if (newActor === null) return;
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, actor: newActor, label: makeLabel(n.data.baseLabel || n.data.label, newActor, showActors) } } : n);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(updatedTasks), edges);
    setNodes(laid); setEdges(laidEdges); setSelectedNodeId(null);
  };
  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const remainingEdges = edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(nodes).filter((n) => n.id !== selectedNodeId), remainingEdges);
    setNodes(laid); setEdges(laidEdges); setSelectedNodeId(null);
  };
  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return; setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId)); setSelectedEdgeId(null);
  };
  const toggleActors = () => {
    setShowActors((prev) => {
      const next = !prev;
      setNodes((nds) => nds.map((n) => n.type === 'swimlane' ? n : { ...n, data: { ...n.data, label: makeLabel(n.data.baseLabel || n.data.label, n.data.actor || '', next) } }));
      return next;
    });
  };
  const onLayout = useCallback(() => {
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(nodes), edges);
    setNodes(laid); setEdges(laidEdges);
  }, [nodes, edges]);


  // ── Render: Katalóg ──────────────────────────────────────
  if (view === 'catalog') {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#f8f9fa' }}>
        <div style={{ height: '48px', background: '#1a1a2e', color: 'white', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <button onClick={() => setView('editor')} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>← Späť do editora</button>
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Proces AI Editor</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#aaa' }}>👤 {username}</span>
            <button onClick={handleLogout} style={{ background: '#cc3300', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Odhlásiť</button>
          </div>
        </div>
        <div style={{ height: 'calc(100vh - 48px)', overflow: 'auto' }}>
          <CatalogPage
            username={username}
            onLogout={handleLogout}
            onLoadModel={(newNodes, newEdges, newPrompt) => {
              setNodes(newNodes); setEdges(newEdges); setPromptText(newPrompt); setView('editor');
            }}
            onClose={() => setView('editor')}
          />
        </div>
      </div>
    );
  }

  // ── Render: Editor ───────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {showAuthModal && (
        <AuthModal
          onClose={() => { setShowAuthModal(false); setPendingAction(null); }}
          onLoginSuccess={onLoginSuccess}
        />
      )}

      {/* TOP TOOLBAR */}
      <div style={{ position: 'absolute', zIndex: 10, left: 10, top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(240,240,240,0.95)', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>

        {/* Pridaná lišta pre Auth vpravo hore */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center', marginBottom: '-5px' }}>
          {username ? (
            <>
              <span style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Prihlásený ako: {username}</span>
              <button onClick={handleLogout} style={{ background: '#cc3300', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>Odhlásiť</button>
            </>
          ) : (
            <button onClick={() => setShowAuthModal(true)} style={{ background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Prihlásiť sa</button>
          )}
        </div>

        {/* Riadok 1: Prompt */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="text" placeholder="Popíš proces..." value={promptText} onChange={(e) => setPromptText(e.target.value)} style={{ minWidth: '350px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #999'
          }}>
            <label style={{fontSize: '13px', fontWeight: 'bold', color: '#000'}}>Min:</label>
            <input type="number" value={minNodes} onChange={(e) => setMinNodes(e.target.value)}
                   style={{width: '40px', padding: '2px', textAlign: 'center', color: '#999'}} min="1"/>
            <label style={{fontSize: '13px', fontWeight: 'bold', marginLeft: '6px', color: '#000'}}>Max:</label>
            <input type="number" value={maxNodes} onChange={(e) => setMaxNodes(e.target.value)}
                   style={{width: '40px', padding: '2px', textAlign: 'center', color: '#999'}} min="2"/>
          </div>
          <button onClick={loadModel} disabled={isLoading} style={{
            padding: '8px 16px',
            background: isLoading ? '#999' : '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}>
            {isLoading ? '⏳ Generujem...' : '🧠 Generuj'}
          </button>
        </div>

        {/* Riadok 2: Akcie */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={addNode}>➕ Pridať uzol</button>
          <button onClick={renameSelected} disabled={!selectedNodeId}>✏️ Premenovať</button>
          <button onClick={changeActorSelected} disabled={!selectedNodeId}>👤 Zmeniť rolu</button>
          <button onClick={deleteSelectedNode} disabled={!selectedNodeId}>🗑️ Zmazať uzol</button>
          <button onClick={deleteSelectedEdge} disabled={!selectedEdgeId}>🗑️ Zmazať hranu</button>
          <button onClick={toggleActors}>{showActors ? '👥 Skryť roly' : '👥 Zobraziť roly'}</button>
          <button onClick={onLayout} style={{ background: '#555', color: '#fff' }}>📐 Zarovnať</button>
          <div style={{ width: '2px', background: '#ccc', margin: '0 5px' }}></div>
          <button onClick={saveToCatalog} style={{ background: '#2a7a2a', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}>📚 Uložiť do katalógu</button>
          <button onClick={openCatalog} style={{ background: '#7a2a7a', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}>📋 Otvoriť katalóg</button>
        </div>
      </div>

      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelectionChange} onEdgeClick={onEdgeClick} connectionLineType={ConnectionLineType.SmoothStep} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

export default App;