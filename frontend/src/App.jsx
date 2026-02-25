import { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

const makeLabel = (baseLabel, actor, showActors) => {
  if (actor && showActors) {
    return `${baseLabel} (${actor})`;
  }
  return baseLabel;
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [showActors, setShowActors] = useState(true);
  const [exportJson, setExportJson] = useState(''); // tu si zobrazíme JSON

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onSelectionChange = useCallback(({ nodes }) => {
    if (nodes && nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
      setSelectedEdgeId(null);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const onEdgeClick = (event, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  const loadModel = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/generate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'test' }),
      });

      const data = await response.json();

      const apiNodes = (data.nodes || []).map((node, index) => {
        const baseLabel = node.label;
        const actor = node.actor || '';
        return {
          id: node.id,
          data: {
            label: makeLabel(baseLabel, actor, showActors),
            baseLabel,
            actor,
            type: node.type || 'task',
          },
          position: { x: 100, y: index * 100 },
        };
      });

      const apiEdges = (data.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || null,
      }));

      setNodes(apiNodes);
      setEdges(apiEdges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setNextId(1);
      setExportJson('');
    } catch (err) {
      console.error('Chyba pri načítaní modelu:', err);
    }
  };

  const addNode = () => {
    const id = `new-${nextId}`;
    const baseLabel = `Nový krok ${nextId}`;
    const actor = '';

    setNextId((n) => n + 1);

    setNodes((nds) => [
      ...nds,
      {
        id,
        data: {
          label: makeLabel(baseLabel, actor, showActors),
          baseLabel,
          actor,
          type: 'task',
        },
        position: { x: 300, y: nds.length * 100 },
      },
    ]);
  };

  const renameSelected = () => {
    if (!selectedNodeId) return;

    const newLabel = window.prompt('Nový názov kroku:');
    if (!newLabel) return;

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
    if (newActor === null) return; // Cancel

    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                actor: newActor,
                label: makeLabel(
                  n.data.baseLabel || n.data.label,
                  newActor,
                  showActors,
                ),
              },
            }
          : n,
      ),
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;

    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
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
          const base = n.data.baseLabel || n.data.label;
          const actor = n.data.actor || '';
          return {
            ...n,
            data: {
              ...n.data,
              label: makeLabel(base, actor, next),
            },
          };
        }),
      );
      return next;
    });
  };

  // ---- EXPORT DO ProcessModel JSON ----
  const buildProcessModel = () => {
    const modelNodes = nodes.map((n) => ({
      id: n.id,
      type: n.data.type || 'task',
      label: n.data.baseLabel || n.data.label,
      actor: n.data.actor || null,
    }));

    const modelEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || null,
    }));

    return { nodes: modelNodes, edges: modelEdges };
  };

  const exportModelToJson = () => {
    const processModel = buildProcessModel();
    const json = JSON.stringify(processModel, null, 2);
    setExportJson(json);
  };

  const saveModelToBackend = async () => {
    const processModel = buildProcessModel();

    try {
      const response = await fetch('http://127.0.0.1:8000/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processModel),
      });

      const data = await response.json();
      console.log('Backend prijal model:', data);
      alert('Model bol odoslaný na backend (pozri konzolu/server).');
    } catch (err) {
      console.error('Chyba pri odosielaní modelu na backend:', err);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 10,
          left: 10,
          top: 10,
          display: 'flex',
          gap: '8px',
        }}
      >
        <button onClick={loadModel}>Načítať model z backendu</button>
        <button onClick={addNode}>Pridať uzol</button>
        <button onClick={renameSelected} disabled={!selectedNodeId}>
          Premenovať uzol
        </button>
        <button onClick={changeActorSelected} disabled={!selectedNodeId}>
          Zmeniť actora
        </button>
        <button onClick={deleteSelectedNode} disabled={!selectedNodeId}>
          Zmazať uzol
        </button>
        <button onClick={deleteSelectedEdge} disabled={!selectedEdgeId}>
          Zmazať hranu
        </button>
        <button onClick={toggleActors}>
          {showActors ? 'Skryť actorov' : 'Zobraziť actorov'}
        </button>
        <button onClick={exportModelToJson}>Export JSON</button>
        <button onClick={saveModelToBackend}>Odoslať na backend</button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
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

      {/* Panel s JSON exportom dolu */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          maxHeight: '35vh',
          background: '#1e1e1e',
          color: '#eee',
          padding: '8px',
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '4px',
        }}
      >
        {exportJson
          ? <pre>{exportJson}</pre>
          : <span>Tu sa po kliknutí na „Export JSON“ zobrazí ProcessModel.</span>}
      </div>
    </div>
  );
}

export default App;
