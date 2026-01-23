require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 3001;

const fs = require('fs/promises');
const LOG_FILE_PATH = './data/logs.json';

async function readLogs() {
  try {
    const data = await fs.readFile(LOG_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLogs(logs) {
  await fs.writeFile(LOG_FILE_PATH, JSON.stringify(logs, null, 2));
}

app.use(cors());
app.use(express.json());


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS
  }
});

async function dispatchAlertToAllAgents(bin) {
  console.log(`Dispatching alerts for ${bin.name} to ${AGENT_EMAILS.length} agents.`);

  for (const agentEmail of AGENT_EMAILS) {
    const serviceLink = `https://bailey-interpulmonary-resistlessly.ngrok-free.dev/api/service?binId=${bin.id}&agent=${agentEmail}`;
    const mailOptions = {
      from: '"Mr. Bean" <wss.mrbean001@gmail.com>',
      to: agentEmail,
      subject: `Waste Pickup Request: ${bin.name}`,
      html: `
        <h1>Pickup Request</h1>
        <p>A dispatch request has been made for the bin: <strong>${bin.name}</strong> (Level: ${bin.level}%)</p>
        <p>After completing the pickup, please click the button below.</p>
        <br>
        <a href="${serviceLink}" style="background-color: #16a34a; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">
           Mark as Serviced
        </a>
      `
    };
    transporter.sendMail(mailOptions).catch(err => console.error(`Failed to send email to ${agentEmail}:`, err));
  }
}

// --- In-Memory Data Store ---
let bins = [
  // Initialize with base structure but perhaps 0 level
  { id: "metal", name: "Metal Waste", level: 0, status: "OK", lastEmpty: new Date().toISOString(), autoDispatchEnabled: false },
  { id: "bio", name: "Biodegradable Waste", level: 0, status: "OK", lastEmpty: new Date().toISOString(), autoDispatchEnabled: false },
  { id: "nonbio", name: "Non-Biodegradable Waste", level: 0, status: "OK", lastEmpty: new Date().toISOString(), autoDispatchEnabled: false },
];
let sensorHistory = []; 
let pickupHistory = []; 

const AGENT_EMAILS = ['praterkverma112233@gmail.com', 'hkashyap0578@gmail.com', 'supratim1252004@gmail.com'];

app.get('/api/bins', (req, res) => res.json(bins));

app.get('/api/logs', async (req, res) => {
  const allLogs = await readLogs();
  const sortedLogs = allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latest10Logs = sortedLogs.slice(0, 10);
  res.json(latest10Logs);
});

app.get('/api/history', (req, res) => res.json([...pickupHistory].reverse()));

app.get('/api/collections/today', async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0); 

  try {
    const allLogs = await readLogs(); 

    const todaysLogs = allLogs.filter(log => new Date(log.timestamp) >= startOfDay);

    const counts = todaysLogs.reduce((acc, log) => {
      acc.total++;
      if (log.binId) {
         if (log.binId === 'metal') acc.metal++;
         else if (log.binId === 'bio') acc.bio++;
         else if (log.binId === 'nonbio') acc.nonbio++;
      }
      return acc;
    }, { total: 0, metal: 0, bio: 0, nonbio: 0 });

    res.json(counts); 

  } catch (err) {
    console.error("Error reading logs for today's collections:", err);
    res.status(500).json({ total: 0, metal: 0, bio: 0, nonbio: 0 });
  }
});

app.get('/api/service', (req, res) => {
  const { binId, agent } = req.query; 

  if (!binId) {
    return res.status(400).send('<h1>Error</h1><p>No bin ID provided.</p>');
  }

  const binToService = bins.find(b => b && b.id === binId);
  if (binToService && binToService.level < 10) {
    return res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1 style="color: #f59e0b;">Action Not Needed</h1>
        <p>The <strong>${binToService.name}</strong> has already been serviced recently.</p>
        <p>No further action is required. Thank you!</p>
      </div>
    `);
  }
  
  let binFound = false;
  bins = bins.map(bin => {
    if (bin && bin.id === binId) {
      binFound = true;
      return { ...bin, level: 0, status: 'OK', lastEmpty: new Date().toISOString() };
    }
    return bin;
  });

  if (binFound) {
    const newPickup = {
      id: `pickup-${Date.now()}`,
      binId: binId,
      timestamp: new Date().toISOString(),
      servicedBy: agent || 'Unknown Agent'
    };
    pickupHistory.push(newPickup);
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1 style="color: #16a34a;">Success!</h1>
        <p>The <strong>${binId}</strong> bin has been marked as serviced.</p>
        <p>Thank you!</p>
      </div>
    `);
  } else {
    res.status(404).send(`<h1>Error</h1><p>Bin with ID "${binId}" not found.</p>`);
  }
});

app.post('/api/log-entry', async (req, res) => {
  console.log(`DEBUG NODE: /api/log-entry hit at ${new Date().toISOString()}`);
  const logData = req.body; 
  logData.id = `log-${Date.now()}`; 

  let allLogs = await readLogs();
  allLogs.push(logData);
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const prunedLogs = allLogs.slice(0, 100);
  await writeLogs(prunedLogs);
  console.log("Received log entry from Flask:", logData);

  let updatedBinForDispatch = null; 
  if (logData.binId) {
    const increment = Math.floor(Math.random() * (25 - 15 + 1)) + 15; 
    bins = bins.map(bin => {
      if (bin && bin.id === logData.binId) {
        const newLevel = Math.min(100, (bin.level || 0) + increment); 
        let newStatus = "OK";
        if (newLevel >= 80) newStatus = "Full";
        else if (newLevel >= 60) newStatus = "Collect Soon";
        console.log(`Updating bin ${bin.id}: Level ${bin.level} -> ${newLevel} (+${increment}%)`);
        const updatedBin = { ...bin, level: newLevel, status: newStatus };
        updatedBinForDispatch = updatedBin; 
        return updatedBin;
      }
      return bin;
    });

    if (updatedBinForDispatch && updatedBinForDispatch.level >= 80 && updatedBinForDispatch.autoDispatchEnabled) {
      await dispatchAlertToAllAgents(updatedBinForDispatch);
    }
  }

  res.status(201).json({ message: "Log entry received and bin level updated" }); 
});

app.post('/api/schedule/:binId', (req, res) => {
  const { binId } = req.params;
  bins = bins.map(bin => {
  if (bin && bin.id === binId) {
    return { ...bin, level: 0, status: 'OK', lastEmpty: new Date().toISOString() };
  }
  return bin;
});

  const newPickup = {
    id: `pickup-${Date.now()}`,
    binId: binId,
    timestamp: new Date().toISOString(),
    servicedBy: 'Manual (Dashboard)'
  };
  pickupHistory.push(newPickup);

  res.json({ message: `Pickup scheduled for ${binId}. Bin level reset.` });
});

app.post('/api/dispatch', async (req, res) => {
  const { binName, binLevel, binId } = req.body;

  if (!binId || !binName || binLevel === undefined) {
    return res.status(400).send({ message: 'Bin ID, name, and level are required.' });
  }

  console.log(`Dispatching email for ${binName} to ${AGENT_EMAILS.length} agents.`);
  for (const agentEmail of AGENT_EMAILS) {
    const serviceLink = `https://bailey-interpulmonary-resistlessly.ngrok-free.dev/api/service?binId=${binId}&agent=${agentEmail}`;

    const mailOptions = {
      from: '"Mr. Bean" <wss.mrbean001@gmail.com>',
      to: agentEmail,
      subject: `Waste Pickup Request: ${binName}`,
      html: `
        <h1>Pickup Request</h1>
        <p>A dispatch request has been made for the bin: <strong>${binName}</strong> (Level: ${binLevel}%)</p>
        <p>After completing the pickup, please click the button below to mark the bin as serviced.</p>
        <br>
        <a href="${serviceLink}" 
           style="background-color: #16a34a; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-family: sans-serif;">
           Mark as Serviced
        </a>
        <br>
        <p><small>If you cannot click the button, please copy and paste this link into your browser: ${serviceLink}</small></p>
      `
    };

    transporter.sendMail(mailOptions).catch(err => console.error(`Failed to send email to ${agentEmail}:`, err));
  }

  res.status(200).send({ message: 'Dispatch emails sent to all agents.' });
});

app.post('/api/bins/:binId/toggle-autodispatch', (req, res) => {
  const { binId } = req.params;
  let toggledBin;
  bins = bins.map(bin => {
    if (bin && bin.id === binId) {
      toggledBin = { ...bin, autoDispatchEnabled: !bin.autoDispatchEnabled };
      return toggledBin;
    }
    return bin;
  });

  if (toggledBin) {
    console.log(`Auto-dispatch for ${toggledBin.name} is now ${toggledBin.autoDispatchEnabled ? 'ON' : 'OFF'}`);
    
    if (toggledBin.autoDispatchEnabled && toggledBin.level >= 80) {
      console.log(`Bin is already full. Triggering dispatch for ${toggledBin.name}`);
      dispatchAlertToAllAgents(toggledBin);
    }

    res.json(toggledBin);
  } else {
    res.status(404).json({ message: 'Bin not found' });
  }
});

app.post('/api/increment-bin/:binId', async (req, res) => {
  const { binId } = req.params;

  if (!binId || !['metal', 'bio', 'nonbio'].includes(binId)) {
    return res.status(400).json({ message: 'Valid bin ID is required.' });
  }

  const increment = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
  let updatedBinForDispatch = null; 

  bins = bins.map(bin => {
    if (bin && bin.id === binId) {
      const newLevel = Math.min(100, (bin.level || 0) + increment); 
      let newStatus = "OK";
      if (newLevel >= 80) newStatus = "Full";
      else if (newLevel >= 60) newStatus = "Collect Soon";

      console.log(`Incrementing bin ${bin.id}: Level ${bin.level} -> ${newLevel} (+${increment}%)`);

      const updatedBin = { ...bin, level: newLevel, status: newStatus };
      updatedBinForDispatch = updatedBin; 
      return updatedBin;
    }
    return bin;
  });

  if (updatedBinForDispatch && updatedBinForDispatch.level >= 80 && updatedBinForDispatch.autoDispatchEnabled) {
    console.log(`Triggering auto-dispatch for ${updatedBinForDispatch.name} after level increment.`);
    await dispatchAlertToAllAgents(updatedBinForDispatch);
  }

  broadcast({
    type: 'BINS_UPDATE',
    payload: bins 
  });

  res.status(200).json({ message: `Bin ${binId} level incremented by ${increment}%.` });
});


app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
