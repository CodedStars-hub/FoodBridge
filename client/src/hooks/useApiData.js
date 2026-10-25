import { useEffect, useReducer, useState } from 'react';
import { api } from '../utils/api.js';
export function useApiData(path) {
  const [version, refresh] = useReducer((value) => value + 1, 0);
  const key = `${path}:${version}`;
  const [result, setResult] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [path, key]);
  return {
    data: result.key === key ? result.data : undefined,
    error: result.key === key ? result.error : undefined,
    loading: result.key !== key,
    refresh,
  };
}
