import { useBins } from '../context/BinsContext';
import React, { useEffect, useState, useMemo } from 'react';

function classifyWaste(log) {
  const MOISTURE_THRESHOLD = 2000;

  if (log.metal) {
    return { bin: 'Metal Waste', color: '#d97706', type: 'metal' };
  }
  if (log.moisture > MOISTURE_THRESHOLD) {
    return { bin: 'Biodegradable Waste', color: '#16a34a', type: 'bio' };
  }
  return { bin: 'Non-Biodegradable Waste', color: '#0891b2', type: 'nonbio' };
}

export default function LogDetailsPage() {
  const { sensorHistory: logs, fetchData } = useBins();
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    if (logs.length > 0) {
      setSelectedLog(logs[0]);
    }
  }, [logs]);

  const wasteCounts = useMemo(() => {
    const counts = { metal: 0, bio: 0, nonbio: 0 };
    logs.forEach(log => {
      const classification = classifyWaste(log);
      counts[classification.type]++;
    });
    return counts;
  }, [logs]);

  const selectedClassification = selectedLog ? classifyWaste(selectedLog) : null;

  return (
    <div className="min-h-screen bg-slate-200 p-6">
      <div className="flex justify-between items-center mb-4">
  <h1 className="text-2xl font-semibold text-slate-800">Waste Log Details</h1>
  <button 
    onClick={fetchData}
    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
  >
    Refresh
  </button>
</div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Table of Logs */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl shadow">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-slate-800">Time</th>
                <th className="p-2 text-slate-800">Metal</th>
                <th className="p-2 text-slate-800">Moisture</th>
                <th className="p-2 text-slate-800">Gas</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr
                  key={log.id}
                  className={`cursor-pointer hover:bg-slate-100 ${
                    selectedLog?.id === log.id ? 'bg-slate-200' : ''
                  }`}
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="p-2 text-slate-900">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="p-2 text-slate-900">
                    {log.metal ? 'Detected' : 'None'}
                  </td>
                  <td className="p-2 text-slate-900">{log.moisture}</td>
                  <td className="p-2 text-slate-900">{log.gas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right Side Panels */}
        <div className="space-y-4">
          {/* Classification Box */}
          <div className="bg-white p-4 rounded-2xl shadow">
            <h2 className="text-lg font-semibold text-slate-700 mb-3">
              Waste Classification
            </h2>
            {selectedClassification ? (
              <div
                className="p-4 rounded-lg text-white"
                style={{ backgroundColor: selectedClassification.color }}
              >
                <div className="text-sm opacity-80">Selected log was added to:</div>
                <div className="text-xl font-bold mt-1">
                  {selectedClassification.bin}
                </div>
              </div>
            ) : (
              <p className="text-slate-500">
                Select a log from the table to see its classification.
              </p>
            )}
          </div>

          {/* Total Counts Box */}
          <div className="bg-white p-4 rounded-2xl shadow">
            <h2 className="text-lg font-semibold text-slate-700 mb-3">
              Total Counts
            </h2>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-sm text-slate-900">Waste Type</th>
                  <th className="p-2 text-sm text-slate-900">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-2 font-bold text-amber-700">Metal Waste</td>
                  <td className="p-2 text-slate-700 font-semibold">
                    {wasteCounts.metal}
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2 font-bold text-green-700">Biodegradable</td>
                  <td className="p-2 text-slate-700 font-semibold">
                    {wasteCounts.bio}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-cyan-700">
                    Non-Biodegradable
                  </td>
                  <td className="p-2 text-slate-700 font-semibold">
                    {wasteCounts.nonbio}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
