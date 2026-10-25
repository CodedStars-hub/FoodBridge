import { useEffect } from 'react';
import { useApiData } from './useApiData.js';
export function useInbox(query = 'limit=8') {
  const result = useApiData(`/notifications?${query}`);
  useEffect(() => {
    window.addEventListener('foodbridge:inbox-changed', result.refresh);
    return () =>
      window.removeEventListener('foodbridge:inbox-changed', result.refresh);
  }, [result.refresh]);
  return result;
}
