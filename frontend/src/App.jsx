import { useCallback } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const loadModel = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/generate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'test' }),
      });

      const data = await response.json();

      // React Flow potrebuje pri každom node pozíciu, inak ho nezobrazí [web:114][web:174]
      const apiNodes = (data.nodes || []).map((node, index) => ({
        id: node.id,
        data: { label: node.label },
        position: { x: 100, y: index * 100 }, // jednoduché rozloženie pod seba
      }));

      const apiEdges = (data.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));

      setNodes(apiNodes);
      setEdges(apiEdges);
    } catch (err) {
      console.error('Chyba pri načítaní modelu:', err);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <button
        onClick={loadModel}
        style={{
          position: 'absolute',
          zIndex: 10,
          left: 10,
          top: 10,
        }}
      >
        Načítať model z backendu
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
      >
        <Background />
      </ReactFlow>
    </div>
  );
}

export default App;
