import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';

const BinsContext = createContext();

export function BinsProvider({ children }) {
  const [bins, setBins] = useState([]);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [collectionsToday, setCollectionsToday] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [binsRes, logsRes, historyRes, collectionsRes] = await Promise.all([
        fetch('http://localhost:3001/api/bins'),
        fetch('http://localhost:3001/api/logs'),
        fetch('http://localhost:3001/api/history'),
        fetch('http://localhost:3001/api/collections/today'),
      ]);

      const binsData = await binsRes.json();
      const logsData = await logsRes.json();
      const historyData = await historyRes.json();
      const collectionsData = await collectionsRes.json();

      setBins(binsData);
      setCollectionsToday(collectionsData);
      setSensorHistory(logsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markBinServiced = useCallback(
    async (binId) => {
      try {
        await fetch(`http://localhost:3001/api/schedule/${binId}`, {
          method: 'POST',
        });
        await fetchData();
      } catch (err) {
        console.error('Failed to schedule pickup:', err);
      }
    },
    [fetchData]
  );

  const value = {
    bins,
    sensorHistory,
    collectionsToday,
    loading,
    markBinServiced,
    fetchData,
  };

  return (
    <BinsContext.Provider value={value}>{children}</BinsContext.Provider>
  );
}

export function useBins() {
  return useContext(BinsContext);
}
