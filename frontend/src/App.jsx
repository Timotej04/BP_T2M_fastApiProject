import { useCallback, useState } from 'react';
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

// ── Konštanty ──────────────────────────────────────────────
const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const LANE_HEIGHT = 120;
const LANE_HEADER_WIDTH = 130;
const LANE_PADDING_X = 20;

// ── Vlastný SwimlaneNode ────────────────────────────────────
const SwimlaneNode = ({ data }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      border: '2px solid #999',
      borderRadius: 6,
      display: 'flex',
      backgroundColor: 'transparent',   // celý lane = priehľadný ✅
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        width: LANE_HEADER_WIDTH,
        minWidth: LANE_HEADER_WIDTH,
        borderRight: '2px solid #999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#dde4ef',      // ← len hlavička má pozadie ✅
        color: '#000000',
        fontWeight: 'bold',
        fontSize: 13,
        padding: '0 10px',
        textAlign: 'center',
        borderRadius: '4px 0 0 4px',
      }}
    >
      {data.label}
    </div>
  </div>
);



const nodeTypes = { swimlane: SwimlaneNode };

// ── Swim Lane Layout ────────────────────────────────────────
const buildSwimLaneLayout = (taskNodes, edges) => {
  // Vždy čerstvá inštancia Dagre (oprava bugu s globálnym grafom)
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 60 });

  taskNodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  // X-pozície z Dagre
  const xMap = {};
  taskNodes.forEach((n) => {
    xMap[n.id] = g.node(n.id).x - NODE_WIDTH / 2;
  });

  const maxContentX =
    taskNodes.length > 0
      ? Math.max(...taskNodes.map((n) => xMap[n.id])) + NODE_WIDTH + LANE_PADDING_X
      : 400;
  const laneWidth = LANE_HEADER_WIDTH + maxContentX + LANE_PADDING_X;

  // Unikátni actori v poradí prvého výskytu
  const actorOrder = [];
  const seen = new Set();
  taskNodes.forEach((n) => {
    const actor = n.data?.actor || '';
    if (!seen.has(actor)) {
      seen.add(actor);
      actorOrder.push(actor);
    }
  });

  const laneNodes = [];
  const positionedTaskNodes = [];

  actorOrder.forEach((actor, idx) => {
    const laneY = idx * (LANE_HEIGHT + 4);
    const laneId = `__lane__${actor || '__none__'}`;

    laneNodes.push({id: laneId,
      type: 'swimlane',
      data: { label: actor || 'Bez roly' },
      position: { x: 0, y: laneY },
      style: { width: laneWidth, height: LANE_HEIGHT }, // ← žiadny background tu
      selectable: false,
      draggable: false,
      zIndex: -1,
    });


    taskNodes
      .filter((n) => (n.data?.actor || '') === actor)
      .forEach((n) => {
        positionedTaskNodes.push({
          ...n,
          parentNode: laneId,
          extent: 'parent',
          position: {
            x: LANE_HEADER_WIDTH + LANE_PADDING_X + xMap[n.id],
            y: (LANE_HEIGHT - NODE_HEIGHT) / 2,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          zIndex: 10,
        });
      });
  });

  return { nodes: [...laneNodes, ...positionedTaskNodes], edges };
};

// ── Pomocné funkcie ─────────────────────────────────────────
const makeLabel = (baseLabel, actor, showActors) =>
  actor && showActors ? `${baseLabel} (${actor})` : baseLabel;

// Odoberie lane-špecifické polia pred re-layoutom
const stripLaneProps = (nodes) =>
  nodes
    .filter((n) => n.type !== 'swimlane')
    .map((n) => ({ ...n, parentNode: undefined, extent: undefined, position: { x: 0, y: 0 } }));

async function generateDiagramFromText(description, minNodes, maxNodes) {
  const response = await fetch('http://127.0.0.1:8000/generate-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description,
      min_nodes: parseInt(minNodes, 10),
      max_nodes: parseInt(maxNodes, 10),
    }),
  });
  if (!response.ok) throw new Error('AI API zlyhalo');
  return response.json();
}

// ── Hlavný komponent ────────────────────────────────────────
function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [showActors, setShowActors] = useState(true);
  const [exportJson, setExportJson] = useState('');
  const [promptText, setPromptText] = useState('');
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [minNodes, setMinNodes] = useState(2);
  const [maxNodes, setMaxNodes] = useState(6);

  // Iba task uzly (bez swim lane kontajnerov)
  const taskNodes = nodes.filter((n) => n.type !== 'swimlane');

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)),
    [setEdges],
  );

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    const nonLane = sel?.find((n) => n.type !== 'swimlane');
    setSelectedNodeId(nonLane ? nonLane.id : null);
    if (nonLane) setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = (_event, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  // ── Generovanie ─────────────────────────────────────────
  const loadModel = async () => {
    setIsLoading(true);
    try {
      const data = await generateDiagramFromText(
        promptText || 'Vygeneruj jednoduchý business proces',
        minNodes,
        maxNodes,
      );

      const rawNodes = (data.nodes || []).map((node) => ({
        id: node.id,
        type: 'default',
        data: {
          label: makeLabel(node.label, node.actor || '', showActors),
          baseLabel: node.label,
          actor: node.actor || '',
          nodeType: node.type || 'task',
        },
        position: { x: 0, y: 0 },
      }));

      const rawEdges = (data.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || null,
        type: 'smoothstep',
      }));

      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(rawNodes, rawEdges);
      setNodes(laid);
      setEdges(laidEdges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setNextId(1);
      setExportJson('');
      setShowJsonPanel(false);
    } catch (err) {
      console.error('Chyba pri načítaní modelu:', err);
      alert('Generovanie modelu zlyhalo, pozri konzolu.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Operácie s uzlami ────────────────────────────────────
  const addNode = () => {
    const id = `new-${nextId}`;
    setNextId((n) => n + 1);
    const newNode = {
      id,
      type: 'default',
      data: {
        label: makeLabel(`Nový krok ${nextId}`, '', showActors),
        baseLabel: `Nový krok ${nextId}`,
        actor: '',
        nodeType: 'task',
      },
      position: { x: 0, y: 0 },
    };
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(
      [...stripLaneProps(nodes), newNode],
      edges,
    );
    setNodes(laid);
    setEdges(laidEdges);
  };

  const renameSelected = () => {
    if (!selectedNodeId) return;
    const newLabel = window.prompt('Nový názov kroku:');
    if (!newLabel) return;
    // Rename nezmení lane → stačí in-place update
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                baseLabel: newLabel,
                label: makeLabel(newLabel, n.data.actor || '', showActors),
              },
            }
          : n,
      ),
    );
  };

  const changeActorSelected = () => {
    if (!selectedNodeId) return;
    const newActor = window.prompt('Nový actor (kto vykonáva činnosť):');
    if (newActor === null) return;

    // Zmena actora = potenciálne nová lane → rebuild
    const updatedTasks = taskNodes.map((n) =>
      n.id === selectedNodeId
        ? {
            ...n,
            data: {
              ...n.data,
              actor: newActor,
              label: makeLabel(n.data.baseLabel || n.data.label, newActor, showActors),
            },
          }
        : n,
    );
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(
      stripLaneProps(updatedTasks),
      edges,
    );
    setNodes(laid);
    setEdges(laidEdges);
    setSelectedNodeId(null);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const remainingEdges = edges.filter(
      (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
    );
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(
      stripLaneProps(nodes).filter((n) => n.id !== selectedNodeId),
      remainingEdges,
    );
    setNodes(laid);
    setEdges(laidEdges);
    setSelectedNodeId(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  };

  const toggleActors = () => {
    setShowActors((prev) => {
      const next = !prev;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === 'swimlane') return n;
          return {
            ...n,
            data: {
              ...n.data,
              label: makeLabel(n.data.baseLabel || n.data.label, n.data.actor || '', next),
            },
          };
        }),
      );
      return next;
    });
  };

  const onLayout = useCallback(() => {
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(nodes), edges);
    setNodes(laid);
    setEdges(laidEdges);
  }, [nodes, edges]);

  // ── Export / Save ────────────────────────────────────────
  const buildProcessModel = () => ({
    nodes: taskNodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType || 'task',
      label: n.data.baseLabel || n.data.label,
      actor: n.data.actor || null,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || null,
    })),
  });

  const exportModelToJson = () => {
    setExportJson(JSON.stringify(buildProcessModel(), null, 2));
    setShowJsonPanel(true);
  };

  const saveModelToBackend = async () => {
    try {
      await fetch('http://127.0.0.1:8000/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildProcessModel()),
      });
      alert('Model bol odoslaný na backend.');
    } catch (err) {
      console.error('Chyba pri odosielaní:', err);
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute', zIndex: 10, left: 10, top: 10,
          display: 'flex', flexDirection: 'column', gap: '10px',
          background: 'rgba(240,240,240,0.95)', padding: '16px',
          borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', color: '#333',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Popíš proces (napr. Nákup v eshope...)"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            style={{ minWidth: '350px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #999' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Min uzlov:</label>
            <input type="number" value={minNodes} onChange={(e) => setMinNodes(e.target.value)}
              style={{ width: '50px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', color: '#000', backgroundColor: '#fff', textAlign: 'center' }} min="1" />
            <label style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '6px' }}>Max uzlov:</label>
            <input type="number" value={maxNodes} onChange={(e) => setMaxNodes(e.target.value)}
              style={{ width: '50px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', color: '#000', backgroundColor: '#fff', textAlign: 'center' }} min="2" />
          </div>
          <button
            onClick={loadModel}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              background: isLoading ? '#999' : '#0066cc',
              color: 'white', border: 'none', borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold',
            }}
          >
            {isLoading ? '⏳ Generujem...' : '🧠 Generuj'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={addNode}>➕ Pridať uzol</button>
          <button onClick={renameSelected} disabled={!selectedNodeId}>✏️ Premenovať</button>
          <button onClick={changeActorSelected} disabled={!selectedNodeId}>👤 Zmeniť rolu</button>
          <button onClick={deleteSelectedNode} disabled={!selectedNodeId}>🗑️ Zmazať uzol</button>
          <button onClick={deleteSelectedEdge} disabled={!selectedEdgeId}>🗑️ Zmazať hranu</button>
          <button onClick={toggleActors}>{showActors ? '👥 Skryť roly' : '👥 Zobraziť roly'}</button>
          <button onClick={onLayout} style={{ background: '#555', color: '#fff' }}>📐 Automaticky zarovnať</button>
          <button onClick={exportModelToJson}>📄 Export JSON</button>
          <button onClick={saveModelToBackend}>💾 Uložiť</button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onEdgeClick={onEdgeClick}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
      >
        <Background />
      </ReactFlow>

      <div
        style={{
          position: 'absolute', left: 10, right: 10, bottom: 10,
          maxHeight: exportJson && showJsonPanel ? '35vh' : '40px',
          background: '#1e1e1e', color: '#00ff00', padding: '8px',
          overflow: 'auto', fontFamily: 'monospace', fontSize: '13px',
          borderRadius: '4px', transition: 'max-height 0.3s ease-in-out',
          cursor: 'pointer', border: '1px solid #333',
        }}
        onClick={() => setShowJsonPanel((v) => !v)}
      >
        {exportJson && showJsonPanel ? (
          <pre style={{ margin: 0 }}>{exportJson}</pre>
        ) : exportJson ? (
          <div style={{ color: '#ccc', textAlign: 'center', marginTop: '2px' }}>
            📄 JSON bol vygenerovaný. Kliknutím sem ho zobrazíte. (Počet uzlov: {taskNodes.length})
          </div>
        ) : (
          <div style={{ color: '#777', textAlign: 'center', marginTop: '2px' }}>
            Kliknite na "Export JSON" pre zobrazenie kódu
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
