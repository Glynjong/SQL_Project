import { useState } from 'react';
import { runQuery } from '../utils/apiUtils';

export const useQueryRunner = () => {
  const [query, setQuery] = useState('SELECT * FROM students;');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeQuery = async (sqlToExecute, onSchemaRefresh) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await runQuery(sqlToExecute);
      if (data.success) {
        setResults(data.rows);
        if (
          sqlToExecute.toUpperCase().includes('CREATE') ||
          sqlToExecute.toUpperCase().includes('DROP')
        ) {
          onSchemaRefresh?.();
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    query,
    setQuery,
    results,
    setResults,
    isLoading,
    error,
    executeQuery,
  };
};
