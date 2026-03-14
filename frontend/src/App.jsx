import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Zoznam jemných pastelových farieb pre rôznych aktérov (text na nich ostane čierny)
const PASTEL_COLORS = [
  '#fdfd96', // jemná žltá
  '#ffb7b2', // jemná červená/lososová
  '#c1e1c1', // jemná zelená
  '#b5ead7', // mäta
  '#c7ceea', // jemná modrá
  '#e2f0cb', // pastelová tyrkysová
  '#ffdac1', // broskyňová
  '#f4c2c2', // marhuľová
  '#e6e6fa', // levanduľová
  '#ffd1dc', // svetlo ružová
];

// Funkcia na vytvorenie labelu uzla (rovnako ako predtým)
const makeLabel = (baseLabel, actor, showActors) => {
  if (actor && showActors) {
    return `${baseLabel} (${actor})`;
  }
  return baseLabel;
};

// Funkcia na prepočítanie farieb podľa aktuálnych actorov v sieti
// Prejde všetky uzly, zozbiera unikátnych actorov a pridelí im farby.
// Prázdni actori alebo null/undefined dostanú bielu farbu.
const applyActorColors = (nodes) => {
  const actorColorMap = {};
  let colorIndex = 0;

  return nodes.map((node) => {
    const actor = node.data.actor ? node.data.actor.trim() : '';

    // Ak nemá actora, farba je biela
    if (!actor) {
      return {
        ...node,
        style: { ...node.style, backgroundColor: '#ffffff', color: '#000000' },
      };
    }

    // Ak actor ešte nemá farbu, priradíme mu ďalšiu zo zoznamu
    if (!actorColorMap[actor]) {
      actorColorMap[actor] = PASTEL_COLORS[colorIndex % PASTEL_COLORS.length];
      colorIndex++;
    }

    // Aplikujeme priradenú farbu
    return {
      ...node,
      style: {
        ...node.style,
        backgroundColor: actorColorMap[actor],
        color: '#000000', // Text bude vždy čierny, aby bol čitateľný na pastelovej
        border: '1px solid #777', // Zvýraznenie okraja, keďže farby sú jemné
      },
    };
  });
};

// Volanie backendu – odosiela aj min a max počet uzlov
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
  if (!response.ok) {
    throw new Error('AI API zlyhalo');
  }
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

  // Stavy pre riadenie hĺbky procesov
  const [minNodes, setMinNodes] = useState(2);
  const [maxNodes, setMaxNodes] = useState(6);

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

  // Generovanie modelu z textu
  const loadModel = async () => {
    try {
      const data = await generateDiagramFromText(
        promptText || 'Vygeneruj jednoduchý business proces',
        minNodes,
        maxNodes
      );

      let apiNodes = (data.nodes || []).map((node, index) => {
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

      // Aplikujeme dynamické farby na načítané uzly z AI
      apiNodes = applyActorColors(apiNodes);

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
      setShowJsonPanel(false);
    } catch (err) {
      console.error('Chyba pri načítaní modelu:', err);
      alert('Generovanie modelu zlyhalo, pozri konzolu.');
    }
  };

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
          position: { x: 300, y: nds.length * 100 },
        },
      ];
      // Hneď po pridaní prepočítame farby (aj keď nový je bez actora, bude biely)
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
      // Názov nemení actora, ale pre istotu aplikujeme farby, aby sme nestratili štýl
      return applyActorColors(updatedNodes);
    });
  };

  const changeActorSelected = () => {
    if (!selectedNodeId) return;
    const newActor = window.prompt('Nový actor (kto vykonáva činnosť):');
    if (newActor === null) return; // používateľ dal Cancel

    setNodes((nds) => {
      const updatedNodes = nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                actor: newActor, // Tu sa zmení actor
                label: makeLabel(n.data.baseLabel || n.data.label, newActor, showActors),
              },
            }
          : n,
      );
      // DÔLEŽITÉ: Po zmene actora musíme prepočítať farby celej siete
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
        // Zachováme farby aj pri prepínaní viditeľnosti roly
        return applyActorColors(toggledNodes);
      });
      return next;
    });
  };

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

      {/* Hlavný ovládací panel */}
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
        connectionLineType={ConnectionLineType.SmoothStep}
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
