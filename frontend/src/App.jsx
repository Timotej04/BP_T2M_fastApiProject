import { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre'; // NOVÉ: Import knižnice na layoutovanie

const PASTEL_COLORS = [
  '#fdfd96', '#ffb7b2', '#c1e1c1', '#b5ead7', '#c7ceea',
  '#e2f0cb', '#ffdac1', '#f4c2c2', '#e6e6fa', '#ffd1dc',
];

const makeLabel = (baseLabel, actor, showActors) => {
  if (actor && showActors) {
    return `${baseLabel} (${actor})`;
  }
  return baseLabel;
};

const applyActorColors = (nodes) => {
  const actorColorMap = {};
  let colorIndex = 0;

  return nodes.map((node) => {
    const actor = node.data?.actor ? node.data.actor.trim() : '';

    if (!actor) {
      return {
        ...node,
        style: { ...node.style, backgroundColor: '#ffffff', color: '#000000' },
      };
    }

    if (!actorColorMap[actor]) {
      actorColorMap[actor] = PASTEL_COLORS[colorIndex % PASTEL_COLORS.length];
      colorIndex++;
    }

    return {
      ...node,
      style: {
        ...node.style,
        backgroundColor: actorColorMap[actor],
        color: '#000000',
        border: '1px solid #777',
      },
    };
  });
};

// ==========================================
// NOVÉ: Funkcia na automatický layout (DAGRE)
// ==========================================
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// direction = 'LR' (Left to Right) - smer zľava doprava
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    // Definujeme štandardnú veľkosť uzla pre výpočet algoritmu
    dagreGraph.setNode(node.id, { width: 150, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Necháme Dagre vypočítať polohy
  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Nastavenie portov (kam sa pripájajú hrany)
    // Keďže ideme zľava doprava, source je vpravo, target je vľavo
    const targetPosition = isHorizontal ? Position.Left : Position.Top;
    const sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // Musíme odčítať polovicu šírky a výšky, aby bol uzol centrovaný na súradnici
    return {
      ...node,
      targetPosition,
      sourcePosition,
      position: {
        x: nodeWithPosition.x - 75, // posun o polovicu definovanej šírky
        y: nodeWithPosition.y - 25, // posun o polovicu definovanej výšky
      },
    };
  });

  return { nodes: newNodes, edges };
};

// ==========================================

async function generateDiagramFromText(description, minNodes, maxNodes) {
  const response = await fetch('http://127.0.0.1:8000/generate-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: description,
      min_nodes: parseInt(minNodes, 10),
      max_nodes: parseInt(maxNodes, 10)
    }),
  });
  if (!response.ok) throw new Error('AI API zlyhalo');
  return response.json();
}

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

  const [minNodes, setMinNodes] = useState(2);
  const [maxNodes, setMaxNodes] = useState(6);

    const onConnect = useCallback(
    (params) => setEdges((eds) =>
      addEdge({ ...params, type: 'smoothstep' }, eds)
    ),
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
      const data = await generateDiagramFromText(
        promptText || 'Vygeneruj jednoduchý business proces',
        minNodes,
        maxNodes
      );

      // 1. Zostavíme základné uzly a hrany (bez polohy, tú urobí Dagre)
      let initialNodes = (data.nodes || []).map((node) => {
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
          // Dočasná nulová pozícia, hneď ju prepíše layout
          position: { x: 0, y: 0 },
        };
      });

      let initialEdges = (data.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || null,
        type: 'smoothstep' // Pekné zahnuté hrany
      }));

      // 2. Oživíme to farbami
      initialNodes = applyActorColors(initialNodes);

      // 3. Aplikujeme Dagre Layout zľava doprava (LR)
      const layouted = getLayoutedElements(initialNodes, initialEdges, 'LR');

      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setNextId(1);
      setExportJson('');
      setShowJsonPanel(false);
    } catch (err) {
      console.error('Chyba pri načítaní modelu:', err);
      alert('Generovanie modelu zlyhalo, pozri konzolu.');
    }
  };

  // Pre ručné pridanie uzla používateľom (tu layout neprepočítavame automaticky, aby sme mu nerozbili, čo si naklikal)
  const addNode = () => {
    const id = `new-${nextId}`;
    const baseLabel = `Nový krok ${nextId}`;
    const actor = '';
    setNextId((n) => n + 1);

    setNodes((nds) => {
      const newNodes = [
        ...nds,
        {
          id,
          data: {
            label: makeLabel(baseLabel, actor, showActors),
            baseLabel,
            actor,
            type: 'task',
          },
          position: { x: 100, y: 100 }, // Hodí ho vľavo hore, používateľ si ho presunie
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        },
      ];
      return applyActorColors(newNodes);
    });
  };

  const renameSelected = () => {
    if (!selectedNodeId) return;
    const newLabel = window.prompt('Nový názov kroku:');
    if (!newLabel) return;

    setNodes((nds) => {
      const updatedNodes = nds.map((n) =>
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
      );
      return applyActorColors(updatedNodes);
    });
  };

  const changeActorSelected = () => {
    if (!selectedNodeId) return;
    const newActor = window.prompt('Nový actor (kto vykonáva činnosť):');
    if (newActor === null) return;

    setNodes((nds) => {
      const updatedNodes = nds.map((n) =>
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
      return applyActorColors(updatedNodes);
    });
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
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
      setNodes((nds) => {
        const toggledNodes = nds.map((n) => {
          const base = n.data.baseLabel || n.data.label;
          const actor = n.data.actor || '';
          return {
            ...n,
            data: {
              ...n.data,
              label: makeLabel(base, actor, next),
            },
          };
        });
        return applyActorColors(toggledNodes);
      });
      return next;
    });
  };

  // Tlačidlo na manuálne zarovnanie grafu (ak používateľ robil bordel)
  const onLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, 'LR');
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
  }, [nodes, edges]);

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
    setShowJsonPanel(true);
  };

  const saveModelToBackend = async () => {
    const processModel = buildProcessModel();
    try {
      const response = await fetch('http://127.0.0.1:8000/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processModel),
      });
      alert('Model bol odoslaný na backend.');
    } catch (err) {
      console.error('Chyba pri odosielaní:', err);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>

      <div
        style={{
          position: 'absolute',
          zIndex: 10,
          left: 10,
          top: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: 'rgba(240,240,240,0.95)',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          color: '#333'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Popíš proces (napr. Nákup v eshope...)"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            style={{
              minWidth: '350px',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              color: '#000',
              backgroundColor: '#fff'
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #999' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Min uzlov:</label>
            <input
              type="number"
              value={minNodes}
              onChange={(e) => setMinNodes(e.target.value)}
              style={{ width: '50px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', color: '#000', backgroundColor: '#fff', textAlign: 'center' }}
              min="1"
            />
            <label style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '6px' }}>Max uzlov:</label>
            <input
              type="number"
              value={maxNodes}
              onChange={(e) => setMaxNodes(e.target.value)}
              style={{ width: '50px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', color: '#000', backgroundColor: '#fff', textAlign: 'center' }}
              min="2"
            />
          </div>

          <button
            onClick={loadModel}
            style={{ padding: '8px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🧠 Generuj
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={addNode}>➕ Pridať uzol</button>
          <button onClick={renameSelected} disabled={!selectedNodeId}>✏️ Premenovať</button>
          <button onClick={changeActorSelected} disabled={!selectedNodeId}>👤 Zmeniť rolu</button>
          <button onClick={deleteSelectedNode} disabled={!selectedNodeId}>🗑️ Zmazať uzol</button>
          <button onClick={deleteSelectedEdge} disabled={!selectedEdgeId}>🗑️ Zmazať hranu</button>
          <button onClick={toggleActors}>
            {showActors ? '👥 Skryť roly' : '👥 Zobraziť roly'}
          </button>
          <button onClick={onLayout} style={{ background: '#555', color: '#fff' }}>📐 Automaticky zarovnať</button>
          <button onClick={exportModelToJson}>📄 Export JSON</button>
          <button onClick={saveModelToBackend}>💾 Uložiť</button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onEdgeClick={onEdgeClick}
        connectionLineType={ConnectionLineType.SmoothStep} // Toto zabezpečí pekné lomené čiary zľava doprava
        fitView
      >
        <Background />
      </ReactFlow>

      {/* Spodný vysúvací JSON panel */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          maxHeight: exportJson && showJsonPanel ? '35vh' : '40px',
          background: '#1e1e1e',
          color: '#00ff00',
          padding: '8px',
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: '13px',
          borderRadius: '4px',
          transition: 'max-height 0.3s ease-in-out',
          cursor: 'pointer',
          border: '1px solid #333'
        }}
        onClick={() => setShowJsonPanel((v) => !v)}
      >
        {exportJson && showJsonPanel ? (
          <pre style={{ margin: 0 }}>{exportJson}</pre>
        ) : exportJson ? (
          <div style={{ color: '#ccc', textAlign: 'center', marginTop: '2px' }}>
            📄 JSON bol vygenerovaný. Kliknutím sem ho zobrazíte. (Počet uzlov: {nodes.length})
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
