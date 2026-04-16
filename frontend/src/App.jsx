import { useCallback, useState, useEffect, useRef } from 'react';
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

const API = import.meta.env.VITE_API_URL || 'https://prompt2flow.onrender.com';
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

// ── VŠETKY KATEGÓRIE ──
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
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
  Undo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>,
  Redo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>,
  KPI: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>),
  Bpmn: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>)
};


// ── AppModal – nahradzuje window.prompt / confirm / alert ────────
function AppModal({ config, onClose }) {
  const [value, setValue] = useState(config.defaultValue || '');
  const inputRef = useRef(null);
  useEffect(() => { if (config.type === 'prompt' && inputRef.current) inputRef.current.focus(); }, [config.type]);
  if (!config) return null;
  const onKey = (e) => {
    if (e.key === 'Enter' && config.type !== 'confirm') onClose(value);
    if (e.key === 'Escape') onClose(null);
  };
  const ov={position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'};
  const bx={background:'#fff',borderRadius:'12px',padding:'24px 28px',minWidth:'320px',maxWidth:'420px',width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',display:'flex',flexDirection:'column',gap:'16px'};
  const bp={padding:'8px 20px',background:'#1e1b4b',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:600};
  const bs={padding:'8px 20px',background:'#f1f5f9',color:'#475569',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',fontSize:'14px'};
  const bd={padding:'8px 20px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:600};
  const inp={width:'100%',padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',fontFamily:'inherit'};
  return (
    <div style={ov} onClick={e=>{if(e.target===e.currentTarget)onClose(null);}}>
      <div style={bx} onKeyDown={onKey}>
        {config.title   && <p style={{margin:0,fontSize:'16px',fontWeight:700,color:'#1e293b'}}>{config.title}</p>}
        {config.message && <p style={{margin:0,fontSize:'14px',color:'#475569',lineHeight:1.5}}>{config.message}</p>}
        {config.type==='prompt' && <input ref={inputRef} style={inp} value={value} onChange={e=>setValue(e.target.value)} placeholder={config.placeholder||''} />}
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          {config.type==='alert'   && <button style={bp} onClick={()=>onClose(true)}>OK</button>}
          {config.type==='prompt'  && (<><button style={bs} onClick={()=>onClose(null)}>Zrušiť</button><button style={bp} onClick={()=>onClose(value)}>Potvrdiť</button></>)}
          {config.type==='confirm' && (<><button style={bs} onClick={()=>onClose(false)}>{config.cancelLabel||'Nie'}</button><button style={config.danger?bd:bp} onClick={()=>onClose(true)}>{config.confirmLabel||'Áno'}</button></>)}
        </div>
      </div>
    </div>
  );
}

// ── VLASTNÝ KOMPONENT PRE UZOL ─────────────────────────────
const TaskNode = ({ data, selected }) => {
  const isDecision = data.isDecision === true;
  const isInvalid = data.isInvalid === true;
  const strokeColor = selected ? COLORS.accent : isInvalid ? COLORS.danger : isDecision ? '#818cf8' : '#cbd5e1';
  const fillColor = isInvalid ? '#fef2f2' : isDecision ? '#fdfeef' : '#ffffff';
  const hasKpi = !isDecision && (data.durationMinutes != null || data.costEuros != null);
  const nodeHeight = hasKpi ? NODE_HEIGHT + 22 : NODE_HEIGHT;

  return (
    <div style={{ width: NODE_WIDTH, height: isDecision ? DECISION_HEIGHT : nodeHeight, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDecision ? '10px 30px' : '6px 10px' }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 10, height: 10, left: isDecision ? 10 : -5 }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: -1, filter: selected ? 'drop-shadow(0 0 4px #6366f1)' : isInvalid ? 'drop-shadow(0 0 4px #ef4444)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))' }}>
        {isDecision ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${NODE_WIDTH} ${DECISION_HEIGHT}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            <polygon points={`${NODE_WIDTH/2},2 ${NODE_WIDTH-2},${DECISION_HEIGHT/2} ${NODE_WIDTH/2},${DECISION_HEIGHT-2} 2,${DECISION_HEIGHT/2}`} fill={fillColor} stroke={strokeColor} strokeWidth={isInvalid ? 3 : 2} />
          </svg>
        ) : (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <rect x="1" y="1" width={NODE_WIDTH-2} height={nodeHeight-2} rx="8" fill={fillColor} stroke={strokeColor} strokeWidth={isInvalid ? 3 : 2} />
          </svg>
        )}
      </div>
      <div style={{ fontSize: '12px', color: isInvalid ? '#991b1b' : '#1e293b', fontWeight: isDecision ? '600' : '500', textAlign: 'center', zIndex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%' }}>
        <span>{data.label}</span>
        {hasKpi && (
          <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: '#475569', background: 'rgba(241,245,249,0.95)', padding: '2px 7px', borderRadius: '4px', border: '1px solid #e2e8f0', lineHeight: 1.4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {data.durationMinutes != null ? (
              <span title="Odhadovaný čas">⏱ {Number.isInteger(data.durationMinutes) ? data.durationMinutes : data.durationMinutes.toFixed(1)} min</span>
            ) : null}
            {data.costEuros != null ? (
              <span title="Odhadované náklady">💶 {Number.isInteger(data.costEuros) ? data.costEuros : data.costEuros.toFixed(2)} EUR</span>
            ) : null}
          </div>
        )}
      </div>
      {isInvalid && (
        <div title={data.validationMsg} style={{ position: 'absolute', top: -8, right: -8, background: COLORS.danger, color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', cursor: 'help' }}>!</div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 10, height: 10, right: isDecision ? 10 : -5 }} />
    </div>
  );
};

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


async function editDiagramFromText(instruction, currentModel) {
  const response = await fetch(`${API}/edit-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, current_model: currentModel }),
  });
  if (!response.ok) throw new Error('AI API zlyhalo pri úprave');
  return response.json();
}

async function generateDiagramFromText(description, minNodes, maxNodes, includeKpi) {
  const response = await fetch(`${API}/generate-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, min_nodes: parseInt(minNodes, 10), max_nodes: parseInt(maxNodes, 10), include_kpi: includeKpi }),
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

  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);

  const [isSavedToCatalog, setIsSavedToCatalog] = useState(false);

  const [minNodes, setMinNodes] = useState(4);
  const [maxNodes, setMaxNodes] = useState(8);
  const [includeKpi, setIncludeKpi] = useState(false);
  const [laneCustomWidth, setLaneCustomWidth] = useState(null);
  const [, setLaneMinWidth] = useState(800);
  const [view, setView] = useState('editor');
  const [username, setUsername] = useState(localStorage.getItem('auth_username') || null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('Iné');

  // ─── LINTER: Automatická kontrola logiky diagramu ───
  useEffect(() => {
    setNodes(nds => {
      let changed = false;
      const newNodes = nds.map(n => {
        if (n.type === 'swimlane') return n;
        const isStart = n.id === 'start' || (n.data.baseLabel && n.data.baseLabel.toLowerCase().includes('zaiatok'));
        const isEnd = n.id === 'end' || (n.data.baseLabel && n.data.baseLabel.toLowerCase().includes('koniec'));
        const incomingCount = edges.filter(e => e.target === n.id).length;
        const outgoingCount = edges.filter(e => e.source === n.id).length;
        let isInvalid = false;
        let validationMsg = '';
        if (!isStart && incomingCount === 0) {
          isInvalid = true;
          validationMsg = 'Chyba vstupna hrana! Tento krok procesu je nedosiahnutelny.';
        } else if (!isEnd && outgoingCount === 0) {
          isInvalid = true;
          validationMsg = 'Chyba vystupna hrana! Proces tu necakane konci - slepa ulicka.';
        }
        if (n.data.isInvalid !== isInvalid || n.data.validationMsg !== validationMsg) {
          changed = true;
          return { ...n, data: { ...n.data, isInvalid, validationMsg } };
        }
        return n;
      });
      return changed ? newNodes : nds;
    });
  }, [edges, setNodes]);

  // ─ Modal ───────────────────────────────────────────────────────────────
  const [modalConfig, setModalConfig] = useState(null);
  const modalResolveRef = useRef(null);
  const showModal = (cfg) => new Promise(res => { modalResolveRef.current = res; setModalConfig(cfg); });
  const handleModalClose = (v) => { setModalConfig(null); if (modalResolveRef.current) { modalResolveRef.current(v); modalResolveRef.current = null; } };
  const modalAlert   = (msg, title = 'Upozornenie') => showModal({ type: 'alert', title, message: msg });
  const modalPrompt  = (title, placeholder = '', defaultValue = '') => showModal({ type: 'prompt', title, placeholder, defaultValue });
  const modalConfirm = (msg, title = 'Potvrdení', confirmLabel = 'Áno', cancelLabel = 'Nie', danger = false) =>
    showModal({ type: 'confirm', title, message: msg, confirmLabel, cancelLabel, danger });

  const ensureSavedBeforeDownload = async () => {
    if (isSavedToCatalog) return true;

    await modalAlert(
      'Pred stiahnutím musíš diagram najprv uložiť do archívu. Môže byť aj súkromný.',
      'Najprv ulož diagram'
    );
    return false;
  };
  // ─ História Undo/Redo ──────────────────────────────────────────────
  const histRef = useRef([{ nodes: [], edges: [] }]);
  const histIdxRef = useRef(0);
  const saveHistory = useCallback((ns, es) => {
    const cleanNodes = (items) => items.map(({ selected, dragging, positionAbsolute, ...rest }) => rest);

    if (histRef.current.length > 0 && histIdxRef.current >= 0) {
      const current = histRef.current[histIdxRef.current];
      if (JSON.stringify(cleanNodes(current.nodes)) === JSON.stringify(cleanNodes(ns)) &&
          JSON.stringify(current.edges) === JSON.stringify(es)) {
        return;
      }
    }

    histRef.current = histRef.current.slice(0, histIdxRef.current + 1);
    histRef.current.push({
      nodes: JSON.parse(JSON.stringify(ns)),
      edges: JSON.parse(JSON.stringify(es)),
    });
    if (histRef.current.length > 50) {
      histRef.current.shift();
    }
    histIdxRef.current = histRef.current.length - 1;
    setIsSavedToCatalog(false);
  }, []);
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    const s = histRef.current[histIdxRef.current];
    setNodes(JSON.parse(JSON.stringify(s.nodes)));
    setEdges(JSON.parse(JSON.stringify(s.edges)));
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return;
    histIdxRef.current += 1;
    const s = histRef.current[histIdxRef.current];
    setNodes(JSON.parse(JSON.stringify(s.nodes)));
    setEdges(JSON.parse(JSON.stringify(s.edges)));
  }, [setNodes, setEdges]);
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

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

  const onConnect = useCallback(async (params) => {
    const currentSourceEdges = edges.filter(e => e.source === params.source);
    const currentCount = currentSourceEdges.length;

    let newEdgeLabel = null;
    const firstEdgeLabelUpdates = {};

    if (currentCount === 1) {
      const r2 = await modalPrompt('Podmienka pre NOVÚ cestu (napr. Áno):', 'Áno', 'Áno');
      if (r2 === null) return;
      newEdgeLabel = r2.trim() || 'Možnosť 2';
      const firstEdge = currentSourceEdges[0];
      if (!firstEdge.label || firstEdge.label.trim() === '') {
        const r1 = await modalPrompt('Podmienka pre PRVU cestu (napr. Nie):', 'Nie', 'Nie');
        if (r1 === null) return;
        firstEdgeLabelUpdates[firstEdge.id] = r1.trim() || 'Možnosť 1';
      }
    } else if (currentCount > 1) {
      const rn = await modalPrompt('Podmienka pre novú cestu:', `Možnosť ${currentCount + 1}`, `Možnosť ${currentCount + 1}`);
      if (rn === null) return;
      newEdgeLabel = rn.trim() || `Možnosť ${currentCount + 1}`;
    }

      const updatedEdgesBase = edges.map((e) =>
        firstEdgeLabelUpdates[e.id] ? { ...e, label: firstEdgeLabelUpdates[e.id] } : e
      );
      const nextEdges = addEdge({ ...params, ...edgeOptions, label: newEdgeLabel }, updatedEdgesBase);
      const nextNodes = currentCount >= 1
        ? nodes.map((n) => n.id === params.source ? { ...n, data: { ...n.data, isDecision: true } } : n)
        : nodes;

      setEdges(nextEdges);
      setNodes(nextNodes);
      saveHistory(nextNodes, nextEdges);
  }, [edges, nodes, setEdges, setNodes, edgeOptions]);

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
      const data = await generateDiagramFromText(promptText || 'Vygeneruj jednoduchý business proces', minNodes, maxNodes, includeKpi);
      if (data.nodes.some(n => n.id === "start" && n.label === "Chyba AI")) {
        await modalAlert(data.nodes.find(n => n.id === 'end')?.label || 'Chyba AI', 'Chyba AI');
        setIsLoading(false); return;
      }
      const rawEdges = (data.edges || []).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || null, ...edgeOptions }));
      const outgoingCounts = {};
      rawEdges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });

      const rawNodes = (data.nodes || []).map((node) => ({
        id: node.id, type: 'task',
        data: { 
          label: makeLabel(node.label, node.actor || '', showActors), 
          baseLabel: node.label, 
          actor: node.actor || '', 
          nodeType: node.type || 'task', 
          isDecision: (outgoingCounts[node.id] || 0) > 1,
          durationMinutes: node.duration_minutes ?? null,
          costEuros: node.cost_euros ?? null,
        },
        position: { x: 0, y: 0 },
      }));

      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(rawNodes, rawEdges);
      setNodes(laid); setEdges(laidEdges);
      histRef.current = []; histIdxRef.current = -1;
      saveHistory(laid, laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null); setNextId(1);
    } catch (err) {
      await modalAlert(`Generovanie zlyhalo: ${err.message}`, 'Chyba');
    } finally { setIsLoading(false); }
  };

  const handleLogout = () => { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_username'); setUsername(null); setView('editor'); };
  const requireAuth = (actionCallback) => { if (localStorage.getItem('auth_token')) { actionCallback(); } else { setPendingAction(() => actionCallback); setShowAuthModal(true); } };
  const onLoginSuccess = (user) => { setUsername(user); setShowAuthModal(false); if (pendingAction) { pendingAction(); setPendingAction(null); } };

  const executeSaveToCatalog = async () => {
    if (taskNodes.length === 0) { await modalAlert('Nie je čo uložiť.', 'Prázdny diagram'); return; }

    // KONTROLA LINTERA: Majú nejaké uzly chybu?
    const hasErrors = taskNodes.some((n) => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'Váš diagram obsahuje logické chyby (slepé uličky alebo chýbajúce vstupy). Chcete ho napriek tomu uložiť?',
        'Upozornenie: Chybné prepojenia',
        'Ignorovať a pokračovať',
        'Vrátiť sa k úpravám',
        true
      );
      if (!proceed) return;
    }

    const title = await modalPrompt('Názov diagramu:', 'napr. Schvaľovanie faktúry');
    if (!title || !title.trim()) return;

    const isPublic = await modalConfirm('Chceš diagram zverejniť pre ostatných používateľov?', 'Viditeľnosť diagramu', 'Áno, zverejniť', 'Nie, súkromný');
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
          category: selectedCategory,
        }),
      });
      if (resp.status === 401) { handleLogout(); await modalAlert('Prihlásenie vypršalo. Prihlás sa znova.', 'Relácia vypršala'); return; }
      if (!resp.ok) throw new Error('Ukladanie zlyhalo');
      setIsSavedToCatalog(true);
      await modalAlert(`Diagram „${title.trim()}“ bol úspešne uložený.`, '✅ Uložené');
    } catch (err) { await modalAlert('Ukladanie zlyhalo. Skús to znova.', 'Chyba'); }
  };

  const saveToCatalog = () => requireAuth(executeSaveToCatalog);
  const openCatalog = () => requireAuth(() => setView('catalog'));

  // ─ Export diagramu do BPMN 2.0 XML ────────────────────────────────────
  const handleDownloadBpmn = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('Diagram je prázdny.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
      'Diagram má červeným vyznačené neuzavreté kroky alebo chýbajúce vstupné hrany. Chcete napriek tomu stiahnuť BPMN súbor?',
      'Stiahnutie BPMN s chybami',
      'Ignorovať a stiahnuť BPMN',
    'Zrušiť stiahnutie'
    );
    if (!proceed) return;
    }

    // ── Layout konštanty ─────────────────────────────────────────────────
    const POOL_LABEL_W = 30;
    const LANE_LABEL_W = 30;
    const HEADER_W     = POOL_LABEL_W + LANE_LABEL_W;
    const COL_W        = 200;
    const ROW_H        = 140;
    const NODE_W       = 120;
    const NODE_H       = 60;
    const GW_SIZE      = 50;
    const SE_SIZE      = 36;
    const PAD_X        = 40;
    const POOL_X       = 80;
    const POOL_Y       = 80;

    // ── Unikatne lanes ───────────────────────────────────────────────────
    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || 'Bez roly';
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });
    const laneCount = actorOrder.length;
    const laneIdxOf = {};
    actorOrder.forEach((a, i) => { laneIdxOf[a] = i; });

    // ── Krok 1: Pociatocne stlpce (cykly -> robustny DFS + Kahn) ─────────
    const outMap = {};
    const inMap = {};
    taskNodes.forEach(n => { outMap[n.id] = []; inMap[n.id] = []; });
    edges.forEach(e => {
      if (outMap[e.source]) outMap[e.source].push(e.target);
      if (inMap[e.target]) inMap[e.target].push(e.source);
    });

    const visited = new Set();
    const visiting = new Set();
    const backEdges = new Set();

    const dfs = (u) => {
      visited.add(u);
      visiting.add(u);
      (outMap[u] || []).forEach(v => {
        if (visiting.has(v)) {
          backEdges.add(u + '->' + v);
        } else if (!visited.has(v)) {
          dfs(v);
        }
      });
      visiting.delete(u);
    };

    const sortedByIn = [...taskNodes].sort((a, b) => inMap[a.id].length - inMap[b.id].length);
    sortedByIn.forEach(n => {
      if (!visited.has(n.id)) dfs(n.id);
    });

    const dagInDeg = {};
    const dagOutMap = {};
    taskNodes.forEach(n => { dagInDeg[n.id] = 0; dagOutMap[n.id] = []; });
    edges.forEach(e => {
      if (!backEdges.has(e.source + '->' + e.target)) {
        if (dagOutMap[e.source]) dagOutMap[e.source].push(e.target);
        if (dagInDeg[e.target] !== undefined) dagInDeg[e.target]++;
      }
    });

    const col = {};
    const bfsQ = taskNodes.filter(n => dagInDeg[n.id] === 0).map(n => n.id);
    bfsQ.forEach(id => { col[id] = 0; });
    const proc = [...bfsQ];
    while (proc.length > 0) {
      const cur = proc.shift();
      (dagOutMap[cur] || []).forEach(nxt => {
        col[nxt] = Math.max(col[nxt] || 0, (col[cur] || 0) + 1);
        dagInDeg[nxt]--;
        if (dagInDeg[nxt] === 0) proc.push(nxt);
      });
    }
    taskNodes.forEach(n => { if (col[n.id] === undefined) col[n.id] = 0; });

    // ── Krok 2: Iteracna stabilizacia (max 50 kol) ───────────────────────
    // Pre "strict left-to-right" posunúť kolízie GLOBÁLNE, nie len pre lane.
    for (let iter = 0; iter < 50; iter++) {
      let changed = false;

      // A) Hranova podmienka: col[target] > col[source]
      edges.forEach(e => {
        const cs = col[e.source];
        const ct = col[e.target];
        const isBackEdge = backEdges.has(e.source + '->' + e.target);

        if (!isBackEdge && cs !== undefined && ct !== undefined && ct <= cs) {
          col[e.target] = cs + 1;
          changed = true;
        }
      });

      // B) Kolizie GLOBÁLNE V CELOM DIAGRAME
      const colUsed = {};
      taskNodes
        .slice()
        .sort((a, b) => (col[a.id] || 0) - (col[b.id] || 0))
        .forEach(n => {
          let c = col[n.id] || 0;
          const startC = c;
          while (colUsed[c]) c++;
          if (c !== startC) { col[n.id] = c; changed = true; }
          colUsed[c] = true;
        });

      if (!changed) break;
    }


    // ── Finalny maxCol a rozmery diagramu ────────────────────────────────
    const maxCol   = Math.max(0, ...taskNodes.map(n => col[n.id] || 0));
    const contentW = PAD_X + (maxCol + 1) * COL_W + PAD_X;
    const laneW    = Math.max(LANE_LABEL_W + contentW, 800);
    const totalH   = laneCount * ROW_H;

    // ── Pozicie uzlov ────────────────────────────────────────────────────
    const isStartNode = n => n.id === 'start' || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('začiatok');
    const isEndNode   = n => n.id === 'end'   || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('koniec');
    const nodeSize    = n => {
      if (isStartNode(n) || isEndNode(n)) return { w: SE_SIZE, h: SE_SIZE };
      if (n.data.isDecision)               return { w: GW_SIZE, h: GW_SIZE };
      return { w: NODE_W, h: NODE_H };
    };

    const nodePos = {};
    taskNodes.forEach(n => {
      const li       = laneIdxOf[n.data.actor || 'Bez roly'] ?? 0;
      const { w, h } = nodeSize(n);
      const cx = POOL_X + HEADER_W + PAD_X + (col[n.id] || 0) * COL_W + NODE_W / 2;
      const cy = POOL_Y + li * ROW_H + ROW_H / 2;
      nodePos[n.id] = {
        x: Math.round(cx - w / 2), y: Math.round(cy - h / 2),
        w, h, cx: Math.round(cx),  cy: Math.round(cy)
      };
    });

    const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const processId     = 'Process_1';
    const collabId      = 'Collaboration_1';
    const participantId = 'Participant_1';

    // ── laneSet ──────────────────────────────────────────────────────────
    let laneSetXml = '\n    <bpmn:laneSet id="LaneSet_1">';
    actorOrder.forEach((actor, idx) => {
      const refs = taskNodes
        .filter(n => (n.data.actor || 'Bez roly') === actor)
        .map(n => '\n        <bpmn:flowNodeRef>' + n.id + '</bpmn:flowNodeRef>')
        .join('');
      laneSetXml += '\n      <bpmn:lane id="Lane_' + idx + '" name="' + esc(actor) + '">' + refs + '\n      </bpmn:lane>';
    });
    laneSetXml += '\n    </bpmn:laneSet>';

    // ── Uzly ─────────────────────────────────────────────────────────────
    let bpmnNodes = '';
    taskNodes.forEach(n => {
      const lbl = n.data.baseLabel || n.data.label || '';
      let et = 'bpmn:task';
      if (isStartNode(n))         et = 'bpmn:startEvent';
      else if (isEndNode(n))      et = 'bpmn:endEvent';
      else if (n.data.isDecision) et = 'bpmn:exclusiveGateway';

      bpmnNodes += '\n    <' + et + ' id="' + n.id + '" name="' + esc(lbl) + '">';
      const hasDur  = n.data.durationMinutes != null;
      const hasCost = n.data.costEuros != null;
      if (et === 'bpmn:task' && (hasDur || hasCost)) {
        let doc = '';
        if (hasDur)            doc += 'Trvanie: ' + n.data.durationMinutes + ' min';
        if (hasDur && hasCost) doc += ' | ';
        if (hasCost)           doc += 'Naklady: ' + n.data.costEuros + ' EUR';
        bpmnNodes += '\n      <bpmn:documentation>' + doc + '</bpmn:documentation>';
        bpmnNodes += '\n      <bpmn:extensionElements>\n        <camunda:properties>';
        if (hasDur)  bpmnNodes += '\n          <camunda:property name="durationMinutes" value="' + n.data.durationMinutes + '" />';
        if (hasCost) bpmnNodes += '\n          <camunda:property name="costEuros" value="' + n.data.costEuros + '" />';
        bpmnNodes += '\n        </camunda:properties>\n      </bpmn:extensionElements>';
      }
      edges.filter(e => e.target === n.id).forEach(e => { bpmnNodes += '\n      <bpmn:incoming>' + e.id + '</bpmn:incoming>'; });
      edges.filter(e => e.source === n.id).forEach(e => { bpmnNodes += '\n      <bpmn:outgoing>' + e.id + '</bpmn:outgoing>'; });
      bpmnNodes += '\n    </' + et + '>';
    });

    // ── Hrany ────────────────────────────────────────────────────────────
    let bpmnEdges = '';
    edges.forEach(e => {
      bpmnEdges += '\n    <bpmn:sequenceFlow id="' + e.id + '" sourceRef="' + e.source + '" targetRef="' + e.target + '" name="' + esc(e.label || '') + '" />';
    });

    // ── DI: Participant + Lanes ──────────────────────────────────────────
    const partTotalW = POOL_LABEL_W + laneW;
    let diShapes = '\n      <bpmndi:BPMNShape id="' + participantId + '_di" bpmnElement="' + participantId + '" isHorizontal="true">'
      + '\n        <dc:Bounds x="' + POOL_X + '" y="' + POOL_Y + '" width="' + partTotalW + '" height="' + totalH + '" />'
      + '\n      </bpmndi:BPMNShape>';
    actorOrder.forEach((_, idx) => {
      diShapes += '\n      <bpmndi:BPMNShape id="Lane_' + idx + '_di" bpmnElement="Lane_' + idx + '" isHorizontal="true">'
        + '\n        <dc:Bounds x="' + (POOL_X + POOL_LABEL_W) + '" y="' + (POOL_Y + idx * ROW_H) + '" width="' + laneW + '" height="' + ROW_H + '" />'
        + '\n      </bpmndi:BPMNShape>';
    });

    // ── DI: Uzly ─────────────────────────────────────────────────────────
    taskNodes.forEach(n => {
      const p = nodePos[n.id];
      diShapes += '\n      <bpmndi:BPMNShape id="' + n.id + '_di" bpmnElement="' + n.id + '"'
        + (n.data.isDecision ? ' isMarkerVisible="true"' : '') + '>'
        + '\n        <dc:Bounds x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" />'
        + '\n      </bpmndi:BPMNShape>';
    });

    // ── DI: Hrany (Založené na pravidlách Camunda / BPMN.io) ─────────────

    const routeEdge = (sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards) => {
      const midGapSource = POOL_X + HEADER_W + PAD_X + sc * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      const midGapTarget = POOL_X + HEADER_W + PAD_X + (tc - 1) * COL_W + NODE_W + (COL_W - NODE_W) / 2;

      // ── 1. BACKWARDS cyklus (šípka ide späť) ───────────────────────────
      if (isBackwards) {
        const outX = x1 + 15;
        const detourY = Math.round(POOL_Y + scRow * ROW_H + 15);
        const inX = x2 - 15;

        return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
             + '\n        <di:waypoint x="' + outX + '" y="' + y1 + '" />'
             + '\n        <di:waypoint x="' + outX + '" y="' + detourY + '" />'
             + '\n        <di:waypoint x="' + inX + '" y="' + detourY + '" />'
             + '\n        <di:waypoint x="' + inX + '" y="' + y2 + '" />'
             + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
      }

      // ── 2. FORWARDS (rôzne lane) ───────────────────────────────────────
      if (scRow !== tcRow) {
        if (tc === sc + 1) {
          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        } else {

          const isGoingDown = tcRow > scRow;

          const highwayY = isGoingDown 
            ? Math.round(POOL_Y + (scRow + 1) * ROW_H)
            : Math.round(POOL_Y + scRow * ROW_H);

          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + highwayY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + highwayY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        }
      }

      // ── 3. FORWARDS (rovnaká lane) ─────────────────────────────────────
      if (scRow === tcRow) {
        if (tc === sc + 1) {
          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        } else {
          const detourY = Math.round(POOL_Y + scRow * ROW_H + ROW_H - 10);

          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + detourY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + detourY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        }
      }
    };

    let diEdges = '';
    edges.forEach(e => {
      const sn = taskNodes.find(n => n.id === e.source);
      const tn = taskNodes.find(n => n.id === e.target);
      if (!sn || !tn) return;

      const sp = nodePos[sn.id];
      const tp = nodePos[tn.id];
      const sc = col[sn.id] || 0;
      const tc = col[tn.id] || 0;
      const scRow = laneIdxOf[sn.data.actor || 'Bez roly'] ?? 0;
      const tcRow = laneIdxOf[tn.data.actor || 'Bez roly'] ?? 0;

      const x1 = sp.x + sp.w;   const y1 = sp.cy;
      const x2 = tp.x;          const y2 = tp.cy;
      const isBackwards = tc <= sc;

      const wpts = routeEdge(sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards);
      diEdges += '\n      <bpmndi:BPMNEdge id="' + e.id + '_di" bpmnElement="' + e.id + '">' + wpts + '\n      </bpmndi:BPMNEdge>';
    });

    // ── Finálne XML ──────────────────────────────────────────────────────
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
      + 'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
      + 'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
      + 'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
      + 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
      + 'id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n'
      + '  <bpmn:collaboration id="' + collabId + '">\n'
      + '    <bpmn:participant id="' + participantId + '" name="Proces" processRef="' + processId + '" />\n'
      + '  </bpmn:collaboration>\n'
      + '  <bpmn:process id="' + processId + '" isExecutable="true">'
      + laneSetXml + bpmnNodes + '\n' + bpmnEdges
      + '\n  </bpmn:process>\n'
      + '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n'
      + '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="' + collabId + '">'
      + diShapes + diEdges
      + '\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>';

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.bpmn';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

    // ─ Export diagramu do UML Activity Diagram (XMI 2.1) ───────────────
  const handleDownloadUml = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('Diagram je prázdny.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'Diagram má červeným vyznačené neuzavreté kroky alebo chýbajúce vstupné hrany. Chcete napriek tomu stiahnuť XMI súbor?',
        'Stiahnutie XMI s chybami',
        'Ignorovať a stiahnuť XMI',
        'Zrušiť stiahnutie'
      );
      if (!proceed) return;
    }

    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let nodesXml = '';
    taskNodes.forEach(n => {
      const lbl = esc(n.data.baseLabel || n.data.label || '');
      const isStart = n.id === 'start' || lbl.toLowerCase().includes('začiatok');
      const isEnd = n.id === 'end' || lbl.toLowerCase().includes('koniec');
      let type = 'uml:OpaqueAction';
      if (isStart) type = 'uml:InitialNode';
      else if (isEnd) type = 'uml:ActivityFinalNode';
      else if (n.data.isDecision) type = 'uml:DecisionNode';

      nodesXml += `\n        <node xmi:type="${type}" xmi:id="${n.id}" name="${lbl}" />`;
    });

    let edgesXml = '';
    edges.forEach(e => {
      const lbl = esc(e.label || '');
      edgesXml += `\n        <edge xmi:type="uml:ControlFlow" xmi:id="${e.id}" source="${e.source}" target="${e.target}" name="${lbl}" />`;
    });

    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || 'Bez roly';
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });

    let partitionsXml = '';
    actorOrder.forEach((actor, idx) => {
      let refs = '';
      taskNodes.forEach(n => {
        if ((n.data.actor || 'Bez roly') === actor) {
          refs += `\n          <node xmi:idref="${n.id}" />`;
        }
      });
      partitionsXml += `\n        <group xmi:type="uml:ActivityPartition" xmi:id="Partition_${idx}" name="${esc(actor)}">${refs}\n        </group>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://www.eclipse.org/uml2/3.0.0/UML">
  <uml:Model xmi:id="Model_1" name="ProcessModel">
    <packagedElement xmi:type="uml:Activity" xmi:id="Activity_1" name="ProcessActivity">${nodesXml}${edgesXml}${partitionsXml}
    </packagedElement>
  </uml:Model>
</xmi:XMI>`;

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'diagram.xmi';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  // ─ Export diagramu do UXF (UMLet) ───────────────────────────────────────
  const handleDownloadUxf = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('Diagram je prázdny.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'Diagram má červeným vyznačené neuzavreté kroky alebo chýbajúce vstupné hrany. Chcete napriek tomu stiahnuť UXF súbor?',
        'Stiahnutie UXF s chybami',
        'Ignorovať a stiahnuť UXF',
        'Zrušiť stiahnutie'
      );
      if (!proceed) return;
    }

    // ── Layout konštanty a Kahn BFS (Kopírujeme logiku z BPMN) ───────────
    const POOL_LABEL_W = 30;
    const LANE_LABEL_W = 30;
    const HEADER_W     = POOL_LABEL_W + LANE_LABEL_W;
    const COL_W        = 200;
    const ROW_H        = 140;
    const NODE_W       = 120;
    const NODE_H       = 60;
    const GW_SIZE      = 50;
    const SE_SIZE      = 36;
    const PAD_X        = 40;
    const POOL_X       = 80;
    const POOL_Y       = 80;

    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || 'Bez roly';
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });
    const laneCount = actorOrder.length;
    const laneIdxOf = {};
    actorOrder.forEach((a, i) => { laneIdxOf[a] = i; });

    const outMap = {};
    const inMap = {};
    taskNodes.forEach(n => { outMap[n.id] = []; inMap[n.id] = []; });
    edges.forEach(e => {
      if (outMap[e.source]) outMap[e.source].push(e.target);
      if (inMap[e.target]) inMap[e.target].push(e.source);
    });

    const visited = new Set();
    const visiting = new Set();
    const backEdges = new Set();
    const dfs = (u) => {
      visited.add(u);
      visiting.add(u);
      (outMap[u] || []).forEach(v => {
        if (visiting.has(v)) backEdges.add(u + '->' + v);
        else if (!visited.has(v)) dfs(v);
      });
      visiting.delete(u);
    };
    const sortedByIn = [...taskNodes].sort((a, b) => inMap[a.id].length - inMap[b.id].length);
    sortedByIn.forEach(n => { if (!visited.has(n.id)) dfs(n.id); });

    const dagInDeg = {};
    const dagOutMap = {};
    taskNodes.forEach(n => { dagInDeg[n.id] = 0; dagOutMap[n.id] = []; });
    edges.forEach(e => {
      if (!backEdges.has(e.source + '->' + e.target)) {
        if (dagOutMap[e.source]) dagOutMap[e.source].push(e.target);
        if (dagInDeg[e.target] !== undefined) dagInDeg[e.target]++;
      }
    });

    const col = {};
    const bfsQ = taskNodes.filter(n => dagInDeg[n.id] === 0).map(n => n.id);
    bfsQ.forEach(id => { col[id] = 0; });
    const proc = [...bfsQ];
    while (proc.length > 0) {
      const cur = proc.shift();
      (dagOutMap[cur] || []).forEach(nxt => {
        col[nxt] = Math.max(col[nxt] || 0, (col[cur] || 0) + 1);
        dagInDeg[nxt]--;
        if (dagInDeg[nxt] === 0) proc.push(nxt);
      });
    }
    taskNodes.forEach(n => { if (col[n.id] === undefined) col[n.id] = 0; });

    for (let iter = 0; iter < 50; iter++) {
      let changed = false;
      edges.forEach(e => {
        const cs = col[e.source];
        const ct = col[e.target];
        const isBackEdge = backEdges.has(e.source + '->' + e.target);
        if (!isBackEdge && cs !== undefined && ct !== undefined && ct <= cs) {
          col[e.target] = cs + 1;
          changed = true;
        }
      });
      const colUsed = {};
      taskNodes.slice().sort((a, b) => (col[a.id] || 0) - (col[b.id] || 0)).forEach(n => {
        let c = col[n.id] || 0;
        const startC = c;
        while (colUsed[c]) c++;
        if (c !== startC) { col[n.id] = c; changed = true; }
        colUsed[c] = true;
      });
      if (!changed) break;
    }

    const maxCol = Math.max(0, ...taskNodes.map(n => col[n.id] || 0));
    const contentW = PAD_X + (maxCol + 1) * COL_W + PAD_X;
    const laneW = Math.max(LANE_LABEL_W + contentW, 800);

    const isStartNode = n => n.id === 'start' || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('začiatok');
    const isEndNode   = n => n.id === 'end'   || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('koniec');
    const nodeSize    = n => {
      if (isStartNode(n) || isEndNode(n)) return { w: SE_SIZE, h: SE_SIZE };
      if (n.data.isDecision)               return { w: GW_SIZE, h: GW_SIZE };
      return { w: NODE_W, h: NODE_H };
    };

    const nodePos = {};
    taskNodes.forEach(n => {
      const li = laneIdxOf[n.data.actor || 'Bez roly'] ?? 0;
      const { w, h } = nodeSize(n);
      const cx = POOL_X + HEADER_W + PAD_X + (col[n.id] || 0) * COL_W + NODE_W / 2;
      const cy = POOL_Y + li * ROW_H + ROW_H / 2;
      nodePos[n.id] = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, cx: Math.round(cx), cy: Math.round(cy) };
    });

    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── UXF XML generovanie ─────────────────────────────────────────────
    let elementsXml = '';

    // Swimlanes
    actorOrder.forEach((actor, idx) => {
      elementsXml += `\n  <element>
    <id>UMLGeneric</id>
    <coordinates><x>${POOL_X}</x><y>${POOL_Y + idx * ROW_H}</y><w>${laneW}</w><h>${ROW_H}</h></coordinates>
    <panel_attributes>halign=left\nvalign=center\n${esc(actor)}</panel_attributes>
    <additional_attributes/>
  </element>`;
    });

    // Nodes
    taskNodes.forEach(n => {
      const { x, y, w, h } = nodePos[n.id];
      const lbl = esc(n.data.baseLabel || n.data.label || '');
      let idType = 'UMLState';
      let panelAttrs = lbl;

      let textElement = '';
      if (isStartNode(n)) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=initial';
      } else if (isEndNode(n)) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=final';
      } else if (n.data.isDecision) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=decision';
      }

      if (idType === 'UMLSpecialState' && lbl) {
        textElement = `\n  <element>
    <id>Text</id>
    <coordinates><x>${x + w/2 - 70}</x><y>${y + h + 5}</y><w>140</w><h>60</h></coordinates>
    <panel_attributes>halign=center\n${lbl}</panel_attributes>
    <additional_attributes/>
  </element>`;
      }

      elementsXml += `\n  <element>
    <id>${idType}</id>
    <coordinates><x>${x}</x><y>${y}</y><w>${w}</w><h>${h}</h></coordinates>
    <panel_attributes>${panelAttrs}</panel_attributes>
    <additional_attributes/>
  </element>${textElement}`;
    });

    // Edges
    const routeEdgePts = (sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards) => {
      const midGapSource = POOL_X + HEADER_W + PAD_X + sc * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      const midGapTarget = POOL_X + HEADER_W + PAD_X + (tc - 1) * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      if (isBackwards) {
        const outX = x1 + 15;
        const detourY = Math.round(POOL_Y + scRow * ROW_H + 15);
        const inX = x2 - 15;
        return [{x: x1, y: y1}, {x: outX, y: y1}, {x: outX, y: detourY}, {x: inX, y: detourY}, {x: inX, y: y2}, {x: x2, y: y2}];
      }
      if (scRow !== tcRow) {
        if (tc === sc + 1) return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: y2}, {x: x2, y: y2}];
        const isGoingDown = tcRow > scRow;
        const highwayY = isGoingDown ? Math.round(POOL_Y + (scRow + 1) * ROW_H) : Math.round(POOL_Y + scRow * ROW_H);
        return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: highwayY}, {x: midGapTarget, y: highwayY}, {x: midGapTarget, y: y2}, {x: x2, y: y2}];
      }
      if (scRow === tcRow) {
        if (tc === sc + 1) return [{x: x1, y: y1}, {x: x2, y: y2}];
        const detourY = Math.round(POOL_Y + scRow * ROW_H + ROW_H - 10);
        return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: detourY}, {x: midGapTarget, y: detourY}, {x: midGapTarget, y: y2}, {x: x2, y: y2}];
      }
      return [];
    };

    edges.forEach(e => {
      const sn = taskNodes.find(n => n.id === e.source);
      const tn = taskNodes.find(n => n.id === e.target);
      if (!sn || !tn) return;

      const sp = nodePos[sn.id];
      const tp = nodePos[tn.id];
      const sc = col[sn.id] || 0;
      const tc = col[tn.id] || 0;
      const scRow = laneIdxOf[sn.data.actor || 'Bez roly'] ?? 0;
      const tcRow = laneIdxOf[tn.data.actor || 'Bez roly'] ?? 0;
      const isBackwards = tc <= sc;

      const x1 = sp.x + sp.w;   const y1 = sp.cy;
      const x2 = tp.x;          const y2 = tp.cy;

      const pts = routeEdgePts(sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards);
      if (pts.length === 0) return;

      const minX = Math.min(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y));
      const maxX = Math.max(...pts.map(p => p.x));
      const maxY = Math.max(...pts.map(p => p.y));


      const PAD = 20;
      const boxX = minX - PAD;
      const boxY = minY - PAD;
      const boxW = (maxX - minX) + PAD * 2;
      const boxH = (maxY - minY) + PAD * 2;

      const addAttrs = pts.map(p => Math.round(p.x - boxX) + '.0;' + Math.round(p.y - boxY) + '.0').join(';');
      const panelAttr = 'lt=-&gt;' + (e.label ? '\nm1=' + esc(e.label) : '');

      elementsXml += `\n  <element>
    <id>Relation</id>
    <coordinates><x>${boxX}</x><y>${boxY}</y><w>${boxW}</w><h>${boxH}</h></coordinates>
    <panel_attributes>${panelAttr}</panel_attributes>
    <additional_attributes>${addAttrs}</additional_attributes>
  </element>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<diagram program="umlet" version="15.0.0">\n  <zoom_level>10</zoom_level>${elementsXml}\n</diagram>`;

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'diagram.uxf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  // ─ Export diagramu ako obrázok ────────────────────────────────────
  const handleDownload = async (format = 'png') => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    const viewport = document.querySelector('.react-flow__viewport');
    if (!viewport) { modalAlert('Diagram nie je k dispozícii.'); return; }

    const allNodes = nodes.filter(n => n.type !== 'swimlane');
    if (allNodes.length === 0) { modalAlert('Diagram je prázdny.'); return; }

    // KONTROLA LINTERA: Pred stiahnutím obrázka
    const hasErrors = allNodes.some((n) => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'Diagram má červeným vyznačené neuzavreté kroky. Chcete stiahnuť obrázok aj s týmito chybami?',
        'Stiahnutie s chybami',
        'Ignorovať a stiahnuť',
        'Zrušiť stiahnutie'
      );
      if (!proceed) return;
    }

    const PADDING = 60;
    const bounds = getRectOfNodes(nodes);
    const imgW = Math.round(bounds.width  + PADDING * 2);
    const imgH = Math.round(bounds.height + PADDING * 2);
    const [tx, ty, sc] = getTransformForBounds(bounds, imgW, imgH, 0.1, 2, 0.05);
    const fn = format === 'jpg' ? toJpeg : toPng;
    fn(viewport, {
      backgroundColor: '#f0f4f8', width: imgW, height: imgH, pixelRatio: 2,
      style: { width: imgW, height: imgH, transform: `translate(${tx}px, ${ty}px) scale(${sc})`, transformOrigin: 'top left' },
    }).then(url => { const a = document.createElement('a'); a.href = url; a.download = `diagram.${format}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 250); })
      .catch(() => modalAlert('Export zlyhal. Skontroluj konzolu.', 'Chyba'));
  };

  const addNode = () => {
    const id = `new-${nextId}`; setNextId((n) => n + 1);
    const newNode = { id, type: 'task', data: { label: makeLabel(`Krok ${nextId}`, '', showActors), baseLabel: `Krok ${nextId}`, actor: '', nodeType: 'task', isDecision: false }, position: { x: 0, y: 0 } };
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout([...stripLaneProps(nodes), newNode], edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };


  const editDiagramWithAI = async () => {
    if (!copilotPrompt.trim() || nodes.filter(n => n.type !== 'swimlane').length === 0) return;
    setIsCopilotLoading(true);
    try {
      const currentTasks = nodes.filter((n) => n.type !== 'swimlane');
      const currentModel = {
        nodes: currentTasks.map(n => ({
          id: n.id,
          type: n.data.nodeType || 'task',
          label: n.data.baseLabel || n.data.label,
          actor: n.data.actor || null,
          duration_minutes: n.data.durationMinutes || null,
          cost_euros: n.data.costEuros || null,
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || null,
        })),
      };

      const data = await editDiagramFromText(copilotPrompt, currentModel);
      if (!data.nodes?.length) throw new Error('AI nevrátila uzly');

      const outgoingCounts = {};
      data.edges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });

      const rawNodes = data.nodes.map(node => ({
        id: node.id,
        type: 'task',
        data: {
          label: makeLabel(node.label, node.actor || '', showActors),
          baseLabel: node.label,
          actor: node.actor || '',
          nodeType: node.type || 'task',
          isDecision: (outgoingCounts[node.id] || 0) > 1,
          durationMinutes: node.duration_minutes || null,
          costEuros: node.cost_euros || null,
        },
        position: { x: 0, y: 0 },
      }));

      const rawEdges = data.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || null,
        ...edgeOptions,
      }));

      setLaneCustomWidth(null);
      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(rawNodes, rawEdges);
      setNodes(laid);
      setEdges(laidEdges);
      saveHistory(laid, laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null);
      setCopilotPrompt('');
    } catch (err) {
      await modalAlert(`Úprava zlyhala: ${err.message}`, 'Chyba');
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const renameSelectedNode = async () => {
    if (!selectedNodeId) return;
    const cur = taskNodes.find(n => n.id === selectedNodeId);
    const newLabel = await modalPrompt('Nový názov kroku:', '', cur?.data?.baseLabel || '');
    if (!newLabel || !newLabel.trim()) return;
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, baseLabel: newLabel, label: makeLabel(newLabel, n.data.actor || '', showActors) } } : n);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };

  const renameSelectedEdge = async () => {
    if (!selectedEdgeId) return;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    const newLabel = await modalPrompt('Podmienka na hrane:', '', edge?.label || '');
    if (newLabel !== null) {
      setEdges((eds) => eds.map((e) => e.id === selectedEdgeId ? { ...e, label: newLabel || undefined } : e));
    }
  };

  const editNodeKpi = async () => {
    if (!selectedNodeId) return;
    const cur = taskNodes.find(n => n.id === selectedNodeId);
    if (!cur) return;
    const durStr = await modalPrompt('Trvanie uzla (minuty)', 'napr. 30', cur?.data?.durationMinutes?.toString() || '');
    if (durStr === null) return;
    const costStr = await modalPrompt('Naklady uzla (eura)', 'napr. 50', cur?.data?.costEuros?.toString() || '');
    if (costStr === null) return;
    const durationMinutes = durStr.trim() ? parseFloat(durStr.trim()) || null : null;
    const costEuros = costStr.trim() ? parseFloat(costStr.trim()) || null : null;
    const updatedTasks = taskNodes.map(n =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, durationMinutes, costEuros } } : n
    );
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid);
    setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };

  const changeActorSelected = async () => {
    if (!selectedNodeId) return;
    const cur2 = taskNodes.find(n => n.id === selectedNodeId);
    const newActor = await modalPrompt('Nová rola pre uzol:', '', cur2?.data?.actor || '');
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
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
    setSelectedNodeId(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    const edgeToDelete = edges.find((e) => e.id === selectedEdgeId);
    const sourceNodeId = edgeToDelete?.source;
    const remainingEdges = edges.filter((e) => e.id !== selectedEdgeId);

    let updatedNodes = nodes;
    if (sourceNodeId) {
      const remainingOut = remainingEdges.filter((e) => e.source === sourceNodeId).length;
      if (remainingOut <= 1) {
        updatedNodes = nodes.map((n) =>
          n.id === sourceNodeId ? { ...n, data: { ...n.data, isDecision: false } } : n
        );
      }
    }

    setNodes(updatedNodes);
    setEdges(remainingEdges);
    saveHistory(updatedNodes, remainingEdges);
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
    saveHistory(laid, laidEdges);
  }, [nodes, edges, buildSwimLaneLayout]);

  if (view === 'catalog') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '60px', background: COLORS.sidebarBg, color: 'white', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button onClick={() => setView('editor')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>← Editor</button>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Prompt2Flow Katalóg</span>
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
              setIsSavedToCatalog(true);
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
            <span style={{ color: COLORS.accent }}>⚡</span> Prompt2Flow
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', marginTop: '8px' }}>
              <input type="checkbox" id="kpi-checkbox" checked={includeKpi} onChange={(e) => setIncludeKpi(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="kpi-checkbox" style={{ fontSize: '11px', color: COLORS.textMuted, cursor: 'pointer' }}>Vygenerovať odhady pre trvanie a náklady (KPI)</label>
            </div>
            <SidebarButton icon={Icons.Generate} label={isLoading ? 'Generujem...' : 'Generovať model'} onClick={loadModel} disabled={isLoading || !promptText.trim()} variant="primary" fullWidth />
          </div>


          {/* AI Copilot – úprava diagramu */}
          <div style={{ background: COLORS.sidebarCard, padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: COLORS.textMuted, letterSpacing: '1px' }}>AI Copilot – úprava</div>
            <div style={{ fontSize: '11px', color: COLORS.textMuted, lineHeight: '1.5' }}>Povedz AI čo chceš zmeniť v existujúcom diagrame.</div>
            <textarea
              placeholder='napr. "Pridaj krok schválenia manažérom medzi A a B"'
              value={copilotPrompt}
              onChange={(e) => setCopilotPrompt(e.target.value)}
              style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '13px', resize: 'vertical', outline: 'none' }}
            />
            <SidebarButton
              icon={Icons.Edit}
              label={isCopilotLoading ? 'Upravujem...' : 'Upraviť diagram (AI)'}
              onClick={editDiagramWithAI}
              disabled={isCopilotLoading || !copilotPrompt.trim()}
              variant="success"
              fullWidth
            />
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
              <SidebarButton icon={Icons.KPI} label="KPI uzla" onClick={editNodeKpi} disabled={!selectedNodeId} fullWidth />
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

            <div style={{display:'flex',gap:'6px'}}>
              <button onClick={undo} title="Späť (Ctrl+Z)" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',padding:'8px',background:'#334155',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>
                <Icons.Undo /> Späť
              </button>
              <button onClick={redo} title="Vpred (Ctrl+Y)" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',padding:'8px',background:'#334155',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>
                <Icons.Redo /> Vpred
              </button>
            </div>
            <SidebarButton icon={Icons.Save} label="Uložiť model" onClick={saveToCatalog} variant="success" fullWidth />
            <SidebarButton icon={Icons.Folder} label="Otvoriť katalóg" onClick={openCatalog} fullWidth />
            <div style={{display:'flex',gap:'6px'}}>
              <button onClick={()=>handleDownload('png')} title="Stiahnuť celý diagram ako PNG" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'8px',background:'#312e81',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>
                <Icons.Download /> PNG
              </button>
              <button onClick={()=>handleDownload('jpg')} title="Stiahnuť celý diagram ako JPG" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'8px',background:'#312e81',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>
                <Icons.Download /> JPG
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleDownloadBpmn}
                title="Stiahnuť ako BPMN 2.0 XML"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#065f46', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                <Icons.Bpmn /> BPMN
              </button>
              <button
                onClick={handleDownloadUml}
                title="Stiahnuť ako UML (XMI)"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#6b21a8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                <Icons.Download /> XMI
              </button>
              <button
                onClick={handleDownloadUxf}
                title="Stiahnuť ako UMLet (UXF)"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#9d174d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                <Icons.Download /> UXF
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
          onNodeDragStop={() => saveHistory(nodes, edges)}
          onConnect={onConnect} onSelectionChange={onSelectionChange} onEdgeClick={onEdgeClick}
          connectionLineType={ConnectionLineType.SmoothStep} fitView defaultEdgeOptions={edgeOptions}
        >
          <Background color="#94a3b8" variant="dots" gap={24} size={2} />
        </ReactFlow>
      </div>
      {modalConfig && <AppModal config={modalConfig} onClose={handleModalClose} />}
    </div>
  );
}

export default App;
