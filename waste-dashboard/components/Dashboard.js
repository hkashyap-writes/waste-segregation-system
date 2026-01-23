import React, { useEffect, useState } from "react";
import Link from 'next/link';
import { useBins } from '../context/BinsContext';

export default function WasteSegDashboard() {

const { bins, sensorHistory, collectionsToday, loading, fetchData } = useBins();
const [selectedBin, setSelectedBin] = useState(null);
const [isChartExpanded, setIsChartExpanded] = useState(false);
const [lastUpdateTime, setLastUpdateTime] = useState('');

const [detectionResult, setDetectionResult] = useState(null); 
  const [detectionError, setDetectionError] = useState(''); 
  const [isProcessing, setIsProcessing] = useState(false); 

  const [cameraStream, setCameraStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [showCameraView, setShowCameraView] = useState(false);
  const videoRef = React.useRef(null); 
  const canvasRef = React.useRef(null);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraStream]); 

  const processImageWithBackend = async (base64ImageData) => {
    setIsProcessing(true);
    setDetectionResult(null);
    setDetectionError('');

    try {
      const flaskResponse = await fetch('http://localhost:5000/process-image', { // Ensure Flask URL is correct
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64ImageData }),
      });

      if (!flaskResponse.ok) {
        const errorData = await flaskResponse.json();
        throw new Error(errorData.error || `Flask Server error: ${flaskResponse.status}`);
      }

      const flaskResult = await flaskResponse.json();
      setDetectionResult(flaskResult.waste_type);
      console.log("Flask Detection Result:", flaskResult);


    } catch (err) {
      console.error("Error processing image or logging:", err);
      setDetectionError(err.message || "Failed to process image or log data.");
    } finally {
      setIsProcessing(false);
      fetchData();
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setShowCameraView(true);
      if (videoRef.current) {
        
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access the camera. Please ensure permissions are granted.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      console.log("Captured image data URL:", dataUrl); 
      processImageWithBackend(dataUrl);
      stopCamera(); 
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setShowCameraView(false);
    setCapturedImage(null); 
  };


  useEffect(() => {
    setLastUpdateTime(new Date().toLocaleString());
  }, []);

  
async function handleExportData() {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  try {
    const logsRes = await fetch('http://localhost:3001/api/logs');
    const logs = await logsRes.json();

    if (logs.length === 0) {
      alert("No log data to export!");
      return;
    }

    const MOISTURE_THRESHOLD = 2000;
    const totalCounts = logs.reduce((acc, log) => {
      acc.total++;
      if (log.metal) {
        acc.metal++;
      } else if (log.moisture > MOISTURE_THRESHOLD) {
        acc.bio++;
      } else {
        acc.nonbio++;
      }
      return acc;
    }, { total: 0, metal: 0, bio: 0, nonbio: 0 });


    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Waste Log Summary", 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Log Entries: ${totalCounts.total}`, 14, 22);
    doc.text(`- Metal Waste Count: ${totalCounts.metal}`, 14, 28);
    doc.text(`- Biodegradable Count: ${totalCounts.bio}`, 14, 34);
    doc.text(`- Non-Biodegradable Count: ${totalCounts.nonbio}`, 14, 40);

    const tableColumn = ["Timestamp", "Bin ID", "Metal", "Moisture", "Gas"];
    const tableRows = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.binId, log.metal ? 'Yes' : 'No', log.moisture, log.gas
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
    });
    
    doc.save('waste_log_report.pdf');

  } catch (err) {
    console.error("Failed to export PDF:", err);
    alert("Error exporting PDF. Please check the console.");
  }
}
  

const totals = (bins || []).filter(b => b).reduce((acc, b) => ({ ...acc, totalLevel: (acc.totalLevel || 0) + (b.level || 0) }), {});
  const handleDispatch = async (bin) => {
    if (!bin) {
      alert("Please select a bin first from the list on the left.");
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
const safeBins = (bins || []).filter(b => b);


  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Waste Segregation System Dashboard</h1>
            <p className="text-sm text-slate-500">Real-time bin levels, collection scheduling and analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">Last update: <strong className="ml-2">{lastUpdateTime}</strong></div>
            <button 
  onClick={fetchData} 
  className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm"
>
  Refresh
</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items start">
          {/* Left column: Bins + actions */}
          <aside className="lg:col-span-1">
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-200 shadow">
                <h3 className="text-sm font-medium text-slate-900 mb-2">Quick Actions</h3>
                <div className="flex flex-col gap-2">
                  <Link href="/schedule" passHref>
                  <button className="w-full py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transform transition hover:scale-105">Schedule Pickup</button>
                  </Link>
                  <Link href="/schedule" passHref>
                  <button className="w-full py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transform transition hover:scale-105">Mark Bin Serviced</button>
                  </Link>
                  <button 
                    onClick={handleExportData}
                    className="w-full py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transform transition hover:scale-105"
                  >
                    Export Data
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-200 shadow">
                <h3 className="text-sm font-medium text-slate-900 mb-3">Bins</h3>
                <div className="space-y-3">
                  {safeBins.map((bin) => (
                    <div
                      key={bin.id}
                      onClick={() => setSelectedBin(bin)}
                      className={`
                        cursor-pointer p-3 rounded-lg border flex items-center justify-between
                        transform transition hover:scale-105
                        ${selectedBin?.id === bin.id ? 'border-indigo-300 shadow' : 'border-slate-100'}
                        ${
                          bin.name === 'Biodegradable Waste' ? 'bg-green-500' :
                          bin.name === 'Non-Biodegradable Waste' ? 'bg-blue-500' :
                          bin.name === 'Metal Waste' ? 'bg-yellow-500' :
                          'bg-slate-700'
                        }
                      `}
                    >
                      <div>
                        <div className="text-sm font-medium">{bin.name}</div>
                        <div className="text-xs opacity-100">{bin.status} • Last emptied {new Date(bin.lastEmpty).toLocaleDateString()}</div>
                      </div>
                      <div className="w-28 text-right">
                        <div className="text-sm font-semibold">{bin.level}%</div>
                        <div className="text-xs opacity-80">fill</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white shadow text-sm text-slate-600">
                <div className="mb-2 font-medium">Note</div>
                <div className="text-xs">For bins over 80% fill. "Schedule Pickup" quick action can be used to assign a collection agent.</div>
              </div>
            </div>
          </aside>

          {/* Main area */}
          <main className="lg:col-span-3 space-y-6">
{/* Top metrics */}
<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-200 shadow border border-slate-200">
    <h3 className="text-sm font-medium text-slate-900 mb-3">Waste Detection</h3>
    <div className="grid grid-cols-2 gap-4">
    {/* Capture Image Button */}
    <div>
      <button 
        onClick={startCamera}
        className="w-full h-full px-4 py-3 rounded-lg bg-cyan-400 text-white shadow flex items-center justify-center font-semibold text-sm hover:bg-cyan-500 transition cursor-pointer"
      >
        Capture Image
      </button>
    </div>

    {/* NEW: Camera View Model */}
    {showCameraView && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4">
        <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh] rounded-lg mb-4"></video>
        <canvas ref={canvasRef} className="hidden"></canvas> 
        <div className="flex gap-4">
          <button 
            onClick={capturePhoto} 
            className="px-6 py-2 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600"
          >
            Take Photo
          </button>
          <button 
            onClick={stopCamera} 
            className="px-6 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600"
          >
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* Upload Image Button */}
    <div>
      <label 
        htmlFor="upload-input" 
        className="w-full h-full px-4 py-3 rounded-lg bg-red-500 text-white shadow flex items-center justify-center font-semibold text-sm hover:bg-red-600 transition cursor-pointer"
      >
        Upload Image
      </label>
      <input 
        id="upload-input" 
        type="file" 
        accept="image/*" 
        className="hidden"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              processImageWithBackend(reader.result); 
            }
            reader.readAsDataURL(file);
          }
          e.target.value = null; 
        }} 
      />
    </div>
    </div>
    {/* NEW: Result Display Area */}
    <div className="mt-4 pt-4 border-t border-slate-200 text-center">
      {isProcessing && (
        <p className="text-blue-600 font-semibold">Processing image...</p>
      )}
      {detectionError && (
        <p className="text-red-600 font-semibold">Error: {detectionError}</p>
      )}
      {detectionResult && (
        <div>
          <p className="text-lg font-bold text-black font-semibold">Detected Waste:</p>
          <p className={`text-2xl font-bold ${
            detectionResult === 'M' ? 'text-amber-600' :
            detectionResult === 'B' ? 'text-green-600' :
            detectionResult === 'N' ? 'text-cyan-600' : ''
          }`}>
            {detectionResult === 'M' ? 'Metal' :
             detectionResult === 'B' ? 'Biodegradable' :
             detectionResult === 'N' ? 'Non-Biodegradable' : 'Unknown'}
          </p>
        </div>
      )}
    </div>
  </div>
  
  {(() => {
    const fullBin = safeBins.find(b => b.level >= 80);
    const scheduleLink = fullBin ? `/schedule?bin=${fullBin.id}` : '/schedule';
    
    return (
      <Link href={scheduleLink} passHref legacyBehavior>
        <a>
          <MetricCard 
            title="Bins >= 80%" 
            value={safeBins.filter(b => b.level >= 80).length} 
            bgColor="bg-red-100" 
            hasHoverEffect={true} 
          />
        </a>
      </Link>
    );
  })()}

  <Link href="/logs" passHref legacyBehavior>
  <a>
    <MetricCard 
  title="Collections Today" 
  value={collectionsToday.total} 
  bgColor="bg-orange-100" 
  hasHoverEffect={true} 
/>
  </a>
</Link>
</section>

  {/* main 2-column container */}
  <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
    
    {/* --- Left Column Wrapper (for Chart + Details) --- */}
    <div className="lg:col-span-2 space-y-6">
    
      {/* 1. Occupancy Overview */}
<div 
  className={`
    rounded-2xl shadow border border-slate-200 transition-all duration-700 ease-in-out
    ${isChartExpanded 
      ? 'fixed inset-4 z-50 bg-white p-6 flex flex-col' 
      : 'bg-slate-100 p-4 cursor-pointer hover:shadow-lg transition-all duration-300'
    }
  `}
  onClick={() => !isChartExpanded && setIsChartExpanded(true)}
>
  <div className="flex justify-between items-center w-full flex-shrink-0 mb-4">
    <h3 className="text-lg font-semibold text-slate-800">Occupancy Overview</h3>
    {isChartExpanded && (
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setIsChartExpanded(false);
        }}
        className="px-3 py-1 rounded-lg bg-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-300"
      >
        Minimize
      </button>
    )}
  </div>

  <div className="w-full flex-grow bg-slate-50 rounded-lg p-4 border">
    <BarChartSimple data={loading ? [] : safeBins} />
  </div>
  
  
</div>

      {/* 2. Bin Details  */}
      <div 
        className={`p-4 rounded-2xl shadow transition-colors duration-300 ${
          !selectedBin && 'bg-slate-100'
        }`} 
        style={selectedBin ? { backgroundColor: getColorForBin(selectedBin.id) } : {}}
      >
        <h3 className={`text-sm font-medium mb-3 ${selectedBin ? 'text-white' : 'text-slate-700'}`}>
          Bin Details
        </h3>
        {selectedBin ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={selectedBin ? 'text-white' : ''}>
              <div className={`text-xs ${selectedBin ? 'opacity-80' : 'text-slate-500'}`}>Name</div>
              <div className="font-medium">{selectedBin.name}</div>
              <div className={`mt-3 text-xs ${selectedBin ? 'opacity-80' : 'text-slate-500'}`}>Fill Level</div>
              <div className="text-lg font-semibold">{selectedBin.level}%</div>
              <div className={`mt-3 text-xs ${selectedBin ? 'opacity-80' : 'text-slate-500'}`}>Status</div>
              <div className="text-sm">{selectedBin.status}</div>
            </div>
            <div className={`${selectedBin ? 'text-white' : ''} sm:text-right`}>
              <div className={`text-xs ${selectedBin ? 'opacity-80' : 'text-slate-500'}`}>Last emptied</div>
              <div className="font-medium">{new Date(selectedBin.lastEmpty).toLocaleString()}</div>
              <div className={`mt-3 text-xs ${selectedBin ? 'opacity-80' : 'text-slate-500'}`}>Actions</div>
              <div className="flex gap-2 mt-2 sm:justify-end">
                <button onClick={() => handleDispatch(selectedBin)} className="px-3 py-1 rounded bg-white/20 text-white text-sm hover:bg-white/30">Dispatch</button>
                <Link href={`/schedule?bin=${selectedBin.id}`} passHref>
                <button className="px-3 py-1 rounded border border-white/50 text-white text-sm hover:bg-white/10">Schedule</button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">Select a bin from the left to view details and management actions.</div>
        )}
      </div>
    </div>

    {/* --- Right Column (Live Feed) --- */}
    <Link href="/logs" passHref legacyBehavior>
  
    <div className="p-4 rounded-2xl bg-slate-100 shadow transition-all duration-300 hover:shadow-xl hover:scale-105 border border-slate-300">
      <h3 className="text-sm font-medium text-slate-700 mb-3">Live Feed</h3>
      <ul className="space-y-4 text-sm">
  {sensorHistory.slice(0, 10).map(event => (
    <li key={event.id} className="flex items-start gap-3 p-2 rounded-lg">
      <div 
        className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" 
        style={{ background: getColorForBin(event.binId) }} 
      />
      <div>
        <div className="font-medium text-slate-800">{event.binId.charAt(0).toUpperCase() + event.binId.slice(1)} waste was processed</div>
        <div className="text-xs text-slate-600">
          Added: {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </li>
  ))}
</ul>
    </div>
    
    </Link>
  </section>
</main>
        </div>

        <footer className="mt-8 text-xs text-slate-500 text-center"> </footer>
      </div>
    </div>
  );
}

/* ---------- Small helper components ---------- */
function MetricCard({ title, value, showArrow = true, bgColor = 'bg-slate-100', hasHoverEffect = false }){
  return (
    <div className={`px-4 py-0.25 rounded-2xl ${bgColor} shadow flex items-center gap-1 border border-slate-300 ${hasHoverEffect ? 'transition-transform duration-300 hover:scale-105 hover:shadow-lg' : ''}`}>
      <div>
        <div className="text-xs text-slate-900">{title}</div>
        <div className="text-xl font-semibold text-slate-800">{value}</div>
      </div>
      {showArrow && <div className="text-sm text-slate-900">▶</div>}
    </div>
  );
}

function BarChartSimple({ data }){
  const max = 100;
  const yAxisLabels = [0, 25, 50, 75, 100];
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = 600;
  const chartHeight = 200;

  const xScale = (index) => padding.left + index * ((chartWidth - padding.left - padding.right) / data.length);
  const yScale = (value) => chartHeight - padding.bottom - ((value / max) * (chartHeight - padding.top - padding.bottom));

  const barWidth = ((chartWidth - padding.left - padding.right) / data.length) * 0.6;

  return (
    <div className="w-full h-full">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
        {/* Y-Axis Grid Lines and Labels */}
        <g className="y-axis text-xs" fill="#94a3b8">
          {yAxisLabels.map(label => (
            <g key={label}>
              <line 
                x1={padding.left} 
                y1={yScale(label)} 
                x2={chartWidth - padding.right} 
                y2={yScale(label)} 
                stroke="#e2e8f0" 
              />
              <text x={padding.left - 8} y={yScale(label) + 4} textAnchor="end">
                {label}%
              </text>
            </g>
          ))}
        </g>
        
        {/* X-Axis Line */}
        <line 
          x1={padding.left} 
          y1={chartHeight - padding.bottom} 
          x2={chartWidth - padding.right} 
          y2={chartHeight - padding.bottom} 
          stroke="#cbd5e1" 
        />

        {/* Chart Bars and Labels */}
        {data.filter(d => d).map((d, i) => {
          const x = xScale(i) + (((chartWidth - padding.left - padding.right) / data.length) - barWidth) / 2;
          const y = yScale(d.level);
          const height = chartHeight - padding.bottom - y;
          
          return (
            <g key={d.id} className="cursor-pointer">
              <rect x={x} y={y} width={barWidth} height={height} rx={4} ry={4} style={{fill: getColorForBin(d.id)}} />
              <text x={x + barWidth/2} y={chartHeight - padding.bottom + 15} fontSize={11} textAnchor="middle" fill="#334155">{d.name}</text>
              <text x={x + barWidth/2} y={y - 6} fontSize={12} textAnchor="middle" fill="#0f172a" fontWeight="bold">{d.level}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getColorForBin(id){
  switch(id){
    case 'bio': return '#16a34a';
    case 'metal': return '#f59e0b';
    case 'nonbio': return '#0891b2';
    default: return '#5f6f85ff';
  }
}

