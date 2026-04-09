import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Position,
  MarkerType,
  Handle,
  getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import CatalogPage from './CatalogPage';
import AuthModal from './AuthModal';
import { toPng, toJpeg } from 'html-to-image';

const API = 'http://127.0.0.1:8000';
const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;
const DECISION_HEIGHT = 80;
const LANE_HEIGHT = 200;
const LANE_HEADER_WIDTH = 140;
const LANE_PADDING_X = 30;

const COLORS = {
  sidebarBg: '#1e1b4b',
  sidebarCard: '#312e81',
  accent: '#6366f1',
  accentHover: '#4f46e5',
  text: '#ffffff',
  textMuted: '#9ca3af',
  danger: '#ef4444',
  success: '#10b981',
  canvasBg: '#f0f4f8',
  laneBorder: '#cbd5e1'
};

// ── VŠETKY KATEGÓRIE (musí byť rovnaký zoznam ako v backende) ──
const CATEGORIES = [
  'HR',
  'IT',
  'Financie',
  'Operácie',
  'Marketing',
  'Zákaznícky servis',
  'Územné celky',
  'Šport',
  'Školstvo',
  'Právo',
  'Hospodárstvo',
  'Iné',
];

const Icons = {
  Generate: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
  Add: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Edit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
  User: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Align: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>,
  Save: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>,
  Folder: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  Text: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
};

// ── VLASTNÝ KOMPONENT PRE UZOL ─────────────────────────────
const TaskNode = ({ data, selected }) => {
  const isDecision = data.isDecision === true;
  return (
    <div style={{ width: NODE_WIDTH, height: isDecision ? DECISION_HEIGHT : NODE_HEIGHT, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDecision ? '10px 30px' : '10px' }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 10, height: 10, left: isDecision ? 10 : -5 }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: -1, filter: selected ? 'drop-shadow(0 0 4px #6366f1)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))' }}>
        {isDecision ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${NODE_WIDTH} ${DECISION_HEIGHT}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            <polygon points={`${NODE_WIDTH/2},2 ${NODE_WIDTH-2},${DECISION_HEIGHT/2} ${NODE_WIDTH/2},${DECISION_HEIGHT-2} 2,${DECISION_HEIGHT/2}`} fill="#fdfeef" stroke={selected ? COLORS.accent : '#818cf8'} strokeWidth="2" />
          </svg>
        ) : (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <rect x="1" y="1" width={NODE_WIDTH-2} height={NODE_HEIGHT-2} rx="8" fill="#ffffff" stroke={selected ? COLORS.accent : '#cbd5e1'} strokeWidth="2" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: isDecision ? '600' : '500', textAlign: 'center', zIndex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 10, height: 10, right: isDecision ? 10 : -5 }} />
    </div>
  );
};

// ── SWIMLANE KOMPONENT ─────────────────────────────────────
const SwimlaneNode = ({ data }) => {
  const isEven = data.index % 2 === 0;
  const expandWidth = (e) => { e.stopPropagation(); data.onWidthChange(data.currentWidth + 150); };
  const shrinkWidth = (e) => { e.stopPropagation(); data.onWidthChange(Math.max(data.minWidth, data.currentWidth - 150)); };
  return (
    <div style={{ width: '100%', height: '100%', borderBottom: `1px solid ${COLORS.laneBorder}`, borderLeft: `2px solid ${COLORS.accent}`, borderRight: `2px solid ${COLORS.accentHover}`, borderTop: data.isFirst ? `2px solid ${COLORS.accent}` : 'none', display: 'flex', position: 'relative', backgroundColor: isEven ? 'rgba(226, 232, 240, 0.4)' : 'transparent', zIndex: -2, boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)', width: LANE_HEADER_WIDTH, backgroundColor: '#ffffff', color: '#1e293b', fontWeight: '600', fontSize: '14px', padding: '12px 10px', textAlign: 'center', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderLeft: `4px solid ${COLORS.accent}`, zIndex: 1 }}>
        {data.label}
      </div>
      {data.isFirst && (
        <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: '5px', zIndex: 20 }}>
          <button className="nodrag nopan" onClick={shrinkWidth} disabled={data.currentWidth <= data.minWidth} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: data.currentWidth <= data.minWidth ? 'not-allowed' : 'pointer', color: data.currentWidth <= data.minWidth ? '#94a3b8' : '#334155', fontSize: '12px', fontWeight: 'bold', pointerEvents: 'auto' }}>Shrink ⏪</button>
          <button className="nodrag nopan" onClick={expandWidth} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155', fontSize: '12px', fontWeight: 'bold', pointerEvents: 'auto' }}>Expand ⏩</button>
        </div>
      )}
    </div>
  );
};

const nodeTypes = { swimlane: SwimlaneNode, task: TaskNode };
const makeLabel = (baseLabel, actor, showActors) => actor && showActors ? `${baseLabel} \n(${actor})` : baseLabel;
const stripLaneProps = (nodes) => nodes.filter((n) => n.type !== 'swimlane').map((n) => ({ ...n, parentNode: undefined, extent: undefined, position: { x: 0, y: 0 } }));

async function generateDiagramFromText(description, minNodes, maxNodes) {
  const response = await fetch(`${API}/generate-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, min_nodes: parseInt(minNodes, 10), max_nodes: parseInt(maxNodes, 10) }),
  });
  if (!response.ok) throw new Error('AI API zlyhalo');
  return response.json();
}

const SidebarButton = ({ icon: Icon, label, onClick, disabled, variant = 'default', fullWidth = false }) => {
  const [isHovered, setIsHovered] = useState(false);
  let bg = 'transparent'; let color = COLORS.text; let border = `1px solid rgba(255,255,255,0.1)`;
  if (variant === 'primary') { bg = COLORS.accent; border = 'none'; }
  else if (variant === 'danger') { color = COLORS.danger; border = `1px solid ${COLORS.danger}50`; }
  else if (variant === 'success') { bg = COLORS.success; border = 'none'; color = '#fff'; }
  if (isHovered && !disabled) {
    if (variant === 'primary') bg = COLORS.accentHover;
    else if (variant === 'default') bg = 'rgba(255,255,255,0.05)';
    else if (variant === 'danger') bg = `${COLORS.danger}20`;
    else if (variant === 'success') bg = '#059669';
  }
  return (
    <button onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: bg, color: color, border: border, fontWeight: variant === 'primary' || variant === 'success' ? '600' : '500', fontSize: '13px', width: fullWidth ? '100%' : 'auto', flex: fullWidth ? 'none' : '1', opacity: disabled ? 0.5 : 1, transition: 'all 0.2s ease', outline: 'none' }}>
      {Icon && <Icon />} {label}
    </button>
  );
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [showActors, setShowActors] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [minNodes, setMinNodes] = useState(4);
  const [maxNodes, setMaxNodes] = useState(8);
  const [laneCustomWidth, setLaneCustomWidth] = useState(null);
  const [, setLaneMinWidth] = useState(800);
  const [view, setView] = useState('editor');
  const [username, setUsername] = useState(localStorage.getItem('auth_username') || null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('Iné');   // ← NOVÉ

  const taskNodes = nodes.filter((n) => n.type !== 'swimlane');

  const edgeOptions = {
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#ffffff', color: '#1e293b', fillOpacity: 0.9, stroke: '#cbd5e1', strokeWidth: 1 },
    labelStyle: { fill: '#1e293b', fontWeight: 600, fontSize: 12 },
  };

  // ── KĽÚČOVÁ OPRAVA: čítame edges PRED zavolaním setEdges ───
  const onConnect = useCallback((params) => {
    const currentSourceEdges = edges.filter(e => e.source === params.source);
    const currentCount = currentSourceEdges.length;

    let newEdgeLabel = null;
    const firstEdgeLabelUpdates = {};

    if (currentCount === 1) {
      newEdgeLabel = window.prompt('Tento krok sa mení na Rozhodnutie.\nZadaj podmienku pre túto NOVÚ cestu (napr. Áno):') ?? 'Možnosť 2';
      const firstEdge = currentSourceEdges[0];
      if (!firstEdge.label || firstEdge.label.trim() === '') {
        const fl = window.prompt('Zadaj podmienku pre PRVÚ (pôvodnú) cestu (napr. Nie):') ?? 'Možnosť 1';
        firstEdgeLabelUpdates[firstEdge.id] = fl;
      }
    } else if (currentCount > 1) {
      newEdgeLabel = window.prompt(`Zadaj podmienku pre túto novú cestu:`) ?? `Možnosť ${currentCount + 1}`;
    }

    setEdges((eds) => {
      const updated = eds.map(e =>
        firstEdgeLabelUpdates[e.id] ? { ...e, label: firstEdgeLabelUpdates[e.id] } : e
      );
      return addEdge({ ...params, ...edgeOptions, label: newEdgeLabel }, updated);
    });

    if (currentCount >= 1) {
      setNodes((nds) =>
        nds.map(n =>
          n.id === params.source ? { ...n, data: { ...n.data, isDecision: true } } : n
        )
      );
    }
  }, [edges, setEdges, setNodes, edgeOptions]);

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    const nonLane = sel?.find((n) => n.type !== 'swimlane');
    setSelectedNodeId(nonLane ? nonLane.id : null);
    if (nonLane) setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = (_event, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); };

  const buildSwimLaneLayout = useCallback((currentTaskNodes, currentEdges, customWidth = laneCustomWidth) => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });

    currentTaskNodes.forEach((n) => {
      const isDecision = n.data?.isDecision === true;
      g.setNode(n.id, { width: NODE_WIDTH, height: isDecision ? DECISION_HEIGHT : NODE_HEIGHT });
    });
    currentEdges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    const xMap = {};
    currentTaskNodes.forEach((n) => { xMap[n.id] = g.node(n.id).x - NODE_WIDTH / 2; });

    const contentMaxX = currentTaskNodes.length > 0 ? Math.max(...currentTaskNodes.map((n) => xMap[n.id])) + NODE_WIDTH + LANE_PADDING_X : 400;
    const calculatedMinWidth = LANE_HEADER_WIDTH + contentMaxX + (LANE_PADDING_X * 2);
    setLaneMinWidth(calculatedMinWidth);
    const finalLaneWidth = customWidth !== null ? Math.max(customWidth, calculatedMinWidth) : calculatedMinWidth;

    const actorOrder = [];
    const seen = new Set();
    currentTaskNodes.forEach((n) => {
      const actor = n.data?.actor || '';
      if (!seen.has(actor)) { seen.add(actor); actorOrder.push(actor); }
    });

    const laneNodes = [];
    const positionedTaskNodes = [];
    const handleWidthChange = (newWidth) => setLaneCustomWidth(newWidth);

    actorOrder.forEach((actor, idx) => {
      const laneY = idx * LANE_HEIGHT;
      const laneId = `__lane__${actor || '__none__'}`;
      laneNodes.push({
        id: laneId, type: 'swimlane',
        data: { label: actor || 'Bez roly', index: idx, isFirst: idx === 0, currentWidth: finalLaneWidth, minWidth: calculatedMinWidth, onWidthChange: handleWidthChange },
        position: { x: 0, y: laneY }, style: { width: finalLaneWidth, height: LANE_HEIGHT }, selectable: false, draggable: false, zIndex: -1,
      });

      currentTaskNodes.filter((n) => (n.data?.actor || '') === actor).forEach((n) => {
        const isDecision = n.data?.isDecision === true;
        const dagreNode = g.node(n.id);
        const relativeY = Math.max(0, dagreNode.y - (isDecision ? 40 : 25));
        positionedTaskNodes.push({
          ...n, parentNode: laneId, extent: 'parent',
          position: { x: LANE_HEADER_WIDTH + LANE_PADDING_X + xMap[n.id], y: relativeY },
          sourcePosition: Position.Right, targetPosition: Position.Left, zIndex: 10,
        });
      });
    });
    return { nodes: [...laneNodes, ...positionedTaskNodes], edges: currentEdges };
  }, [laneCustomWidth]);

  useEffect(() => {
    if (nodes.length > 0 && laneCustomWidth !== null) {
      const currentTasks = nodes.filter((n) => n.type !== 'swimlane');
      const { nodes: laid } = buildSwimLaneLayout(currentTasks, edges, laneCustomWidth);
      setNodes(laid);
    }
  }, [laneCustomWidth]);

  const loadModel = async () => {
    setIsLoading(true); setLaneCustomWidth(null);
    try {
      const data = await generateDiagramFromText(promptText || 'Vygeneruj jednoduchý business proces', minNodes, maxNodes);
      if (data.nodes.some(n => n.id === "start" && n.label === "Chyba AI")) {
        alert(`Chyba AI:\n\n${data.nodes.find(n => n.id === "end")?.label}`);
        setIsLoading(false); return;
      }
      const rawEdges = (data.edges || []).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || null, ...edgeOptions }));
      const outgoingCounts = {};
      rawEdges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });

      const rawNodes = (data.nodes || []).map((node) => ({
        id: node.id, type: 'task',
        data: { label: makeLabel(node.label, node.actor || '', showActors), baseLabel: node.label, actor: node.actor || '', nodeType: node.type || 'task', isDecision: (outgoingCounts[node.id] || 0) > 1 },
        position: { x: 0, y: 0 },
      }));

      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(rawNodes, rawEdges);
      setNodes(laid); setEdges(laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null); setNextId(1);
    } catch (err) {
      alert(`Generovanie zlyhalo: ${err.message}`);
    } finally { setIsLoading(false); }
  };

  const handleLogout = () => { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_username'); setUsername(null); setView('editor'); };
  const requireAuth = (actionCallback) => { if (localStorage.getItem('auth_token')) { actionCallback(); } else { setPendingAction(() => actionCallback); setShowAuthModal(true); } };
  const onLoginSuccess = (user) => { setUsername(user); setShowAuthModal(false); if (pendingAction) { pendingAction(); setPendingAction(null); } };

  const executeSaveToCatalog = async () => {
    if (taskNodes.length === 0) { alert('Nie je čo uložiť.'); return; }
    const title = window.prompt('Názov diagramu:'); if (!title || !title.trim()) return;
    const isPublic = window.confirm('Verejný diagram? (OK = Áno, Zrušiť = Súkromný)');
    const processModel = {
      nodes: taskNodes.map((n) => ({ id: n.id, type: n.data.nodeType || 'task', label: n.data.baseLabel || n.data.label, actor: n.data.actor || null, isDecision: n.data.isDecision || false })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label || null })),
    };
    try {
      const resp = await fetch(`${API}/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({
          title: title.trim(),
          prompt: promptText,
          min_nodes: Number(minNodes),
          max_nodes: Number(maxNodes),
          final_node_count: taskNodes.length,
          model_json: processModel,
          is_public: isPublic,
          category: selectedCategory,      // ← NOVÉ
        }),
      });
      if (resp.status === 401) { handleLogout(); alert('Vypršalo prihlásenie.'); return; }
      if (!resp.ok) throw new Error('Ukladanie zlyhalo');
      alert(`✅ Uložené ako „${title.trim()}" · kategória: ${selectedCategory}`);
    } catch (err) { alert('Ukladanie zlyhalo.'); }
  };

  const saveToCatalog = () => requireAuth(executeSaveToCatalog);
  const openCatalog = () => requireAuth(() => setView('catalog'));

  // ─── EXPORT CELÉHO DIAGRAMU ───────────────────────────────
  const handleDownload = (format = 'png') => {
    const viewport = document.querySelector('.react-flow__viewport');
    if (!viewport) { alert('Diagram nie je k dispozícii.'); return; }

    // Používame `nodes` priamo zo state — nepotrebujeme useReactFlow hook
    const taskNodes = nodes.filter(n => n.type === 'task');
    if (taskNodes.length === 0) { alert('Diagram je prázdny.'); return; }

    const PADDING = 60;
    const bounds = getRectOfNodes(nodes); // všetky uzly vrátane swimlane
    const imageWidth  = Math.round(bounds.width  + PADDING * 2);
    const imageHeight = Math.round(bounds.height + PADDING * 2);

    const [tx, ty, scale] = getTransformForBounds(
      bounds, imageWidth, imageHeight, 0.1, 2, 0.05
    );

    const exportFn = format === 'jpg' ? toJpeg : toPng;

    exportFn(viewport, {
      backgroundColor: '#f0f4f8',
      width:  imageWidth,
      height: imageHeight,
      pixelRatio: 2,
      style: {
        width:           imageWidth,
        height:          imageHeight,
        transform:       `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: 'top left',
      },
    })
      .then(dataUrl => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `diagram.${format}`;
        a.click();
      })
      .catch(err => {
        console.error('Export zlyhal:', err);
        alert('Export zlyhal. Skontroluj konzolu.');
      });
  };

  const addNode = () => {
    const id = `new-${nextId}`; setNextId((n) => n + 1);
    const newNode = { id, type: 'task', data: { label: makeLabel(`Krok ${nextId}`, '', showActors), baseLabel: `Krok ${nextId}`, actor: '', nodeType: 'task', isDecision: false }, position: { x: 0, y: 0 } };
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout([...stripLaneProps(nodes), newNode], edges);
    setNodes(laid); setEdges(laidEdges);
  };

  const renameSelectedNode = () => {
    if (!selectedNodeId) return;
    const newLabel = window.prompt('Nový názov kroku:'); if (!newLabel) return;
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, baseLabel: newLabel, label: makeLabel(newLabel, n.data.actor || '', showActors) } } : n);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges);
  };

  const renameSelectedEdge = () => {
    if (!selectedEdgeId) return;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    const newLabel = window.prompt('Zadaj podmienku na hrane:', edge?.label || '');
    if (newLabel !== null) {
      setEdges((eds) => eds.map((e) => e.id === selectedEdgeId ? { ...e, label: newLabel || undefined } : e));
    }
  };

  const changeActorSelected = () => {
    if (!selectedNodeId) return;
    const newActor = window.prompt('Nová rola:'); if (newActor === null) return;
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, actor: newActor, label: makeLabel(n.data.baseLabel || n.data.label, newActor, showActors) } } : n);
    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges); setSelectedNodeId(null);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const edgesToDelete = edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
    const remainingEdges = edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);

    let updatedNodes = stripLaneProps(nodes).filter((n) => n.id !== selectedNodeId);
    edgesToDelete.forEach(deletedEdge => {
      const srcId = deletedEdge.source;
      if (srcId !== selectedNodeId) {
        const remainingOut = remainingEdges.filter(e => e.source === srcId).length;
        if (remainingOut <= 1) {
          updatedNodes = updatedNodes.map(n => n.id === srcId ? { ...n, data: { ...n.data, isDecision: false } } : n);
        }
      }
    });

    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedNodes, remainingEdges);
    setNodes(laid); setEdges(laidEdges); setSelectedNodeId(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    const edgeToDelete = edges.find(e => e.id === selectedEdgeId);
    const sourceNodeId = edgeToDelete?.source;
    const remainingEdges = edges.filter((e) => e.id !== selectedEdgeId);

    if (sourceNodeId) {
      const remainingOut = remainingEdges.filter(e => e.source === sourceNodeId).length;
      if (remainingOut <= 1) {
        setNodes((nds) => nds.map(n =>
          n.id === sourceNodeId ? { ...n, data: { ...n.data, isDecision: false } } : n
        ));
      }
    }

    setEdges(remainingEdges);
    setSelectedEdgeId(null);
  };

  const toggleActors = () => {
    setShowActors((prev) => {
      const next = !prev;
      setNodes((nds) => nds.map((n) => n.type === 'swimlane' ? n : { ...n, data: { ...n.data, label: makeLabel(n.data.baseLabel || n.data.label, n.data.actor || '', next) } }));
      return next;
    });
  };

  const onLayout = useCallback(() => {
    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(nodes), edges);
    setNodes(laid); setEdges(laidEdges);
  }, [nodes, edges, buildSwimLaneLayout]);

  if (view === 'catalog') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '60px', background: COLORS.sidebarBg, color: 'white', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button onClick={() => setView('editor')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>← Editor</button>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Proces AI Archív</span>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: COLORS.textMuted }}>👤 {username}</span>
            <button onClick={handleLogout} style={{ background: COLORS.danger, color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Odhlásiť</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: COLORS.canvasBg }}>
          <CatalogPage username={username} onLogout={handleLogout}
            onLoadModel={(loadedNodes, loadedEdges, newPrompt) => {
              const fixedNodes = loadedNodes.map(n => ({ ...n, type: 'task' }));
              const outgoingCounts = {};
              loadedEdges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });
              const nodesWithDecision = fixedNodes.map(n => ({
                ...n,
                data: { ...n.data, isDecision: n.data.isDecision || (outgoingCounts[n.id] || 0) > 1 }
              }));
              setLaneCustomWidth(null);
              const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(nodesWithDecision, loadedEdges);
              setNodes(laid); setEdges(laidEdges); setPromptText(newPrompt); setView('editor');
            }}
            onClose={() => setView('editor')} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', backgroundColor: COLORS.canvasBg }}>
      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingAction(null); }} onLoginSuccess={onLoginSuccess} />}

      {/* ── SIDEBAR ── */}
      <div style={{ width: '320px', minWidth: '320px', height: '100%', backgroundColor: COLORS.sidebarBg, color: COLORS.text, display: 'flex', flexDirection: 'column', boxShadow: '4px 0 15px rgba(0,0,0,0.1)', zIndex: 10, overflowY: 'auto' }}>

        {/* Hlavička + používateľ */}
        <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
          <h1 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: COLORS.accent }}>⚡</span> Process AI
          </h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '8px' }}>
            {username ? (
              <><span style={{ fontSize: '13px', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.User /> {username}</span><button onClick={handleLogout} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '12px' }}>Odhlásiť</button></>
            ) : (
              <><span style={{ fontSize: '13px', color: COLORS.textMuted }}>Neprihlásený</span><button onClick={() => setShowAuthModal(true)} style={{ background: COLORS.accent, color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Prihlásiť sa</button></>
            )}
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* AI Generovanie */}
          <div style={{ background: COLORS.sidebarCard, padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: COLORS.textMuted, letterSpacing: '1px' }}>AI Generovanie</div>
            <textarea placeholder="Popíš proces..." value={promptText} onChange={(e) => setPromptText(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '13px', resize: 'vertical', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px' }}>
                <span style={{ fontSize: '11px', padding: '0 8px', color: COLORS.textMuted }}>Min:</span>
                <input type="number" value={minNodes} onChange={(e) => setMinNodes(e.target.value)} min="1" style={{ width: '40px', background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', textAlign: 'center', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px' }}>
                <span style={{ fontSize: '11px', padding: '0 8px', color: COLORS.textMuted }}>Max:</span>
                <input type="number" value={maxNodes} onChange={(e) => setMaxNodes(e.target.value)} min="2" style={{ width: '40px', background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', textAlign: 'center', outline: 'none' }} />
              </div>
            </div>
            <SidebarButton icon={Icons.Generate} label={isLoading ? 'Generujem...' : 'Generovať model'} onClick={loadModel} disabled={isLoading || !promptText.trim()} variant="primary" fullWidth />
          </div>

          {/* Úprava uzlov */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: COLORS.textMuted, letterSpacing: '1px', marginBottom: '4px' }}>Úprava uzlov</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SidebarButton icon={Icons.Add} label="Pridať" onClick={addNode} />
              <SidebarButton icon={Icons.Align} label="Zarovnať" onClick={onLayout} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SidebarButton icon={Icons.Edit} label="Uzol" onClick={renameSelectedNode} disabled={!selectedNodeId} />
              <SidebarButton icon={Icons.User} label="Rola" onClick={changeActorSelected} disabled={!selectedNodeId} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SidebarButton icon={Icons.Text} label="Text hrany" onClick={renameSelectedEdge} disabled={!selectedEdgeId} fullWidth />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SidebarButton icon={Icons.Trash} label="Uzol" onClick={deleteSelectedNode} disabled={!selectedNodeId} variant="danger" />
              <SidebarButton icon={Icons.Trash} label="Hranu" onClick={deleteSelectedEdge} disabled={!selectedEdgeId} variant="danger" />
            </div>
            <SidebarButton icon={Icons.Users} label={showActors ? 'Skryť roly v názvoch' : 'Zobraziť roly v názvoch'} onClick={toggleActors} fullWidth />
          </div>

          <div style={{ flex: 1 }}></div>

          {/* Uloženie + Archív */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Výber kategórie */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: COLORS.textMuted, letterSpacing: '1px' }}>
                Kategória modelu
              </div>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 30px 8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} style={{ background: '#1e1b4b', color: '#fff' }}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <SidebarButton icon={Icons.Save} label="Uložiť model" onClick={saveToCatalog} variant="success" fullWidth />
            <SidebarButton icon={Icons.Folder} label="Otvoriť archív" onClick={openCatalog} fullWidth />
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button onClick={() => handleDownload('png')} title="Stiahnuť celý diagram ako PNG" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#312e81', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                <Icons.Download /> PNG
              </button>
              <button onClick={() => handleDownload('jpg')} title="Stiahnuť celý diagram ako JPG" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#312e81', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                <Icons.Download /> JPG
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── CANVAS ── */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onSelectionChange={onSelectionChange} onEdgeClick={onEdgeClick}
          connectionLineType={ConnectionLineType.SmoothStep} fitView defaultEdgeOptions={edgeOptions}
        >
          <Background color="#94a3b8" variant="dots" gap={24} size={2} />
        </ReactFlow>
      </div>
    </div>
  );
}

export default App;
