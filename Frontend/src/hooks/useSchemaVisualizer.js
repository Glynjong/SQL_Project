import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState, addEdge, MarkerType } from 'reactflow';
import { fetchForeignKeys, fetchSchemaMetadata, runQuery } from '../utils/apiUtils';
import { createForeignKeyEdges, createDatabaseNode, nodeTableExists, buildCreateTableSQL } from '../utils/schemaUtils';

export const useSchemaVisualizer = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [schemaData, setSchemaData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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
    setError(null);
    try {
      const data = await fetchSchemaMetadata();
      setSchemaData(data);
      return data;
    } catch (err) {
      console.error('Failed to load schema metadata:', err);
      setError(err.message);
      return {};
    } finally {
      setIsLoading(false);
    }
  };

  const addTableToCanvas = async (tableName, colsOverride) => {
    if (nodeTableExists(nodes, tableName)) return;

    const cols = colsOverride || schemaData[tableName];
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

  // Builds and runs a CREATE TABLE statement from a structured spec (see
  // AddTableModal), then refreshes metadata and drops the new table onto
  // the canvas — so "Add Table" behaves like a real schema change, not
  // just a visual mockup.
  const createTable = async (spec) => {
    let sql;
    try {
      sql = buildCreateTableSQL(spec);
    } catch (err) {
      return { success: false, error: err.message };
    }
    const result = await runQuery(sql);
    if (!result.success) {
      return { success: false, error: result.error, sql };
    }
    const freshData = await loadSchemaMetadata();
    await addTableToCanvas(spec.tableName, freshData[spec.tableName]);
    return { success: true, sql };
  };

  // After a structure edit (see EditTableModal): rebuild the tables that are
  // already on the canvas from fresh metadata, keeping their positions.
  // renameMap = { oldName: newName }; droppedTable = a table that no longer exists.
  const refreshCanvasTables = async (renameMap = {}, droppedTable = null) => {
    const fresh = await loadSchemaMetadata();
    const finalName = (id) => renameMap[id] || id;

    setNodes((nds) =>
      nds
        .filter((n) => n.id !== droppedTable)
        .map((n) => {
          const name = finalName(n.id);
          return fresh[name] ? { ...createDatabaseNode(name, fresh[name]), position: n.position } : null;
        })
        .filter(Boolean)
    );

    const names = new Set(
      nodes.filter((n) => n.id !== droppedTable).map((n) => finalName(n.id)).filter((t) => fresh[t])
    );
    try {
      const fkRows = await fetchForeignKeys();
      const fkEdges = createForeignKeyEdges(fkRows, names);
      setEdges((eds) => {
        // FK edges are re-derived from the database; manual edges are kept
        // (following any rename) unless one of their tables is gone.
        const manual = eds
          .filter((e) => !String(e.id).startsWith('fk-'))
          .map((e) => ({ ...e, source: finalName(e.source), target: finalName(e.target) }))
          .filter((e) => names.has(e.source) && names.has(e.target));
        return [...manual, ...fkEdges];
      });
    } catch (err) {
      console.error('Failed to refresh FK edges:', err);
    }
  };

  const addAllTablesToCanvas = async () => {
    // Self-healing: if metadata was never loaded (or the one-time mount
    // fetch failed — e.g. hit before the backend was ready), retry here
    // instead of silently doing nothing, which is what used to happen.
    let currentSchemaData = schemaData;
    if (Object.keys(currentSchemaData).length === 0) {
      currentSchemaData = await loadSchemaMetadata();
    }
    if (Object.keys(currentSchemaData).length === 0) {
      // Fetch genuinely returned zero tables (either a real error, now
      // visible via `error`, or the database truly has none in `public`).
      return;
    }

    const newNodes = [];
    const tableNames = Object.keys(currentSchemaData);
    
    // Create grid layout for tables
    const itemsPerRow = Math.ceil(Math.sqrt(tableNames.length));
    const nodeWidth = 250;
    const nodeHeight = 200;
    const spacing = 50;

    tableNames.forEach((tableName, index) => {
      if (nodeTableExists(newNodes, tableName)) return;

      const row = Math.floor(index / itemsPerRow);
      const col = index % itemsPerRow;
      const cols = currentSchemaData[tableName];
      
      const node = createDatabaseNode(tableName, cols);
      node.position = {
        x: col * (nodeWidth + spacing),
        y: row * (nodeHeight + spacing),
      };
      newNodes.push(node);
    });

    setNodes(newNodes);

    // Add foreign key edges after all tables are added
    setTimeout(async () => {
      try {
        const fkRows = await fetchForeignKeys();
        const canvasTableNames = new Set(newNodes.map((n) => n.id));
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
    }, 100);
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
    error,
    loadSchemaMetadata,
    addTableToCanvas,
    addAllTablesToCanvas,
    createTable,
    refreshCanvasTables,
    clearCanvas,
  };
};
