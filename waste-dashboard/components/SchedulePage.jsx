import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useBins } from '../context/BinsContext';

const tabColors = {
  metal: { active: 'bg-amber-200 text-amber-800 border-amber-500', inactive: 'border-transparent text-slate-500 hover:bg-amber-100' },
  bio:   { active: 'bg-green-200 text-green-800 border-green-500', inactive: 'border-transparent text-slate-500 hover:bg-green-100' },
  nonbio:{ active: 'bg-cyan-200 text-cyan-800 border-cyan-500',   inactive: 'border-transparent text-slate-500 hover:bg-cyan-100' },
};

const panelColors = {
  metal: 'bg-amber-200',
  bio:   'bg-green-200',
  nonbio:'bg-cyan-200',
};

function BinSchedulePanel({ bin, history, onSchedule, onToggle, onDispatch, activeBinId }) {
  if (!bin) return null;
  const bgColor = panelColors[activeBinId] || 'bg-slate-100';

  return (
    <div className={`${bgColor} p-6 rounded-b-lg rounded-r-lg`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">{bin.name}</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => onDispatch(bin)} className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold hover:bg-slate-800 transition">
            Schedule Pickup
          </button>
          <button onClick={() => onSchedule(bin.id)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">
            Mark Bin Serviced
          </button>
        </div>
      </div>
      <div className="mb-6">
        <div className="flex justify-between text-sm text-slate-800 mb-1">
          <span>Current Capacity</span>
          <span className="font-semibold">{bin.level}%</span>
        </div>
        <div className="w-full bg-slate-200/70 rounded-full h-4">
          <div className="bg-green-500 h-4 rounded-full transition-all duration-500" style={{ width: `${bin.level}%` }}></div>
        </div>
      </div>
      <div className="mt-6 p-4 bg-white/50 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-900">Auto-Dispatch Alerts</h3>
            <p className="text-xs text-slate-700">Auto-send pickup email when bin reaches 80%.</p>
          </div>
          <button
            onClick={() => onToggle(bin.id)}
            className={`w-20 py-2 rounded-full font-bold text-sm transition-colors ${bin.autoDispatchEnabled ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-700'}`}
          >
            {bin.autoDispatchEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div className="mt-4">
        <h3 className="font-semibold text-slate-900 mb-2">Pickup History</h3>
        <table className="w-full text-left bg-white/50 rounded-lg">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="p-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
              <th className="p-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Pickup</th>
              <th className="p-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Serviced By</th>
            </tr>
          </thead>
          <tbody>
            {history.filter(p => p.binId === bin.id).map((pickup, index) => (
              <tr key={pickup.id} className="border-b border-slate-200">
                <td className="p-2 text-slate-700">{index + 1}</td>
                <td className="p-2 text-slate-700">{new Date(pickup.timestamp).toLocaleString()}</td>
                <td className="p-2 text-slate-700 font-medium">{pickup.servicedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { bins, markBinServiced, fetchData: fetchSharedData } = useBins(); 
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('metal'); 
  const router = useRouter();

  useEffect(() => {
    const { bin: binFromQuery } = router.query;
    if (binFromQuery && ['metal', 'bio', 'nonbio'].includes(binFromQuery)) {
      setActiveTab(binFromQuery);
    }
  }, [router.query]);

  const fetchHistory = async () => {
    try {
      const historyRes = await fetch('http://localhost:3001/api/history');
      const historyData = await historyRes.json();
      setHistory(historyData);
    } catch (err) {
      console.error("Failed to fetch history data:", err);
    }
  };

  useEffect(() => {
    async function fetchHistory() {
      try {
        const historyRes = await fetch('http://localhost:3001/api/history');
        if (!historyRes.ok) throw new Error('History response not ok');
        const historyData = await historyRes.json();
        setHistory(historyData);
      } catch (err) {
        console.error("Failed to fetch history data:", err);
        setHistory([]);
      }
    }
    fetchHistory();
  }, []);

  const handleRefresh = () => {
  fetchSharedData();
  fetchHistory();
};



  const handleToggleAutoDispatch = async (binId) => {
  try {
    await fetch(`http://localhost:3001/api/bins/${binId}/toggle-autodispatch`, { method: 'POST' });
    fetchSharedData();
  } catch (err) {
    console.error("Failed to toggle auto-dispatch:", err);
  }
};

  const handleDispatch = async (bin) => {
    if (!bin) {
      alert("No bin data available.");
      return;
    }
    
    try {
      const res = await fetch('http://localhost:3001/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binName: bin.name, binLevel: bin.level, binId: bin.id })
      });

      if (!res.ok) throw new Error('Server responded with an error');
      
      alert(`Dispatch email for ${bin.name} sent successfully!`);
    } catch (err) {
      console.error("Failed to send dispatch email:", err);
      alert("Failed to send dispatch email. See console for details.");
    }
  };
  
  const TABS = [
    { id: 'metal', label: 'Metal Bin' },
    { id: 'bio', label: 'Biodegradable Bin' },
    { id: 'nonbio', label: 'Non-Biodegradable Bin' },
  ];

  const activeBinData = (bins || []).find(b => b && b.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex justify-between items-center mb-6">
  <h1 className="text-3xl font-bold text-slate-800">Service & Scheduling</h1>
  <button 
    onClick={handleRefresh}
    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
  >
    Refresh
  </button>
</div>
      <div className="flex">
        {TABS.map(tab => {
          const colors = tabColors[tab.id];
          return (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 -mb-px font-semibold border-b-2 rounded-t-lg ${
                activeTab === tab.id 
                  ? colors.active 
                  : colors.inactive
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <BinSchedulePanel 
        bin={activeBinData}
        history={history}
        onSchedule={markBinServiced}
        onToggle={handleToggleAutoDispatch}
        onDispatch={handleDispatch}
        activeBinId={activeTab}
      />
    </div>
  );
}
