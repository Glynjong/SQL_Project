import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState, addEdge, MarkerType } from 'reactflow';
import { fetchForeignKeys, fetchSchemaMetadata } from '../utils/apiUtils';
import { createForeignKeyEdges, createDatabaseNode, nodeTableExists } from '../utils/schemaUtils';

export const useSchemaVisualizer = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [schemaData, setSchemaData] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: false,
            style: { stroke: 'var(--blue)', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--blue)' },
            label: 'manual',
            labelStyle: { fontSize: 10, fill: 'var(--text-muted)' },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          },
          eds
        )
      ),
    [setEdges]
  );

  const loadSchemaMetadata = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSchemaMetadata();
      setSchemaData(data);
    } catch (err) {
      console.error('Failed to load schema metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addTableToCanvas = async (tableName) => {
    if (nodeTableExists(nodes, tableName)) return;

    const cols = schemaData[tableName];
    const newNode = createDatabaseNode(tableName, cols);
    setNodes((nds) => {
      const updated = [...nds, newNode];
      setTimeout(() => addFKEdgesForTable(tableName, updated), 50);
      return updated;
    });
  };

  const addFKEdgesForTable = async (tableName, currentNodes) => {
    try {
      const fkRows = await fetchForeignKeys();
      const canvasTableNames = new Set([...currentNodes.map((n) => n.id), tableName]);
      const newEdges = createForeignKeyEdges(fkRows, canvasTableNames);

      if (newEdges.length > 0) {
        setEdges((eds) => {
          const existingIds = new Set(eds.map((e) => e.id));
          return [...eds, ...newEdges.filter((e) => !existingIds.has(e.id))];
        });
      }
    } catch (err) {
      console.error('Failed to add FK edges:', err);
    }
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    schemaData,
    isLoading,
    loadSchemaMetadata,
    addTableToCanvas,
    clearCanvas,
  };
};
