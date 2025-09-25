const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

const DATA_FILE = 'production_data.json';
let productionData = { requests: [], histories: {} };

// ✅ Aqui estão os nomes reais das linhas:
const productionLines = [
  { id: 'line1', name: 'LINHA1' },
  { id: 'line2', name: 'LINHA2' },
  { id: 'line3', name: 'LINHA3' },
  { id: 'line4', name: 'LINHA4' },
  { id: 'line5', name: 'LINHA5' },
  { id: 'line6', name: 'LINHA6' },
  { id: 'line7', name: 'LINHA7' },
  { id: 'line8', name: 'LINHA8' },
  { id: 'line9', name: 'LINHA9' },
  { id: 'line10', name: 'LINHA10' },
  { id: 'line11', name: 'LINHA11' },
  { id: 'line12', name: 'LINHA12' },
  { id: 'line13', name: 'LINHA13' },
  { id: 'line14', name: 'LINHA14' },
];

function formatSecondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function cleanRequests(data) {
  const seen = new Set();
  return (data.requests || []).filter(r => {
    const key = `${r.name}-${r.timestamp}`;
    if (!r.name || !r.timestamp || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(rawData);
      productionData.requests = cleanRequests(parsed);
      productionData.histories = parsed.histories || {};
    }
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    productionData = { requests: [], histories: {} };
  }
}

function saveData() {
  try {
    const cleaned = {
      requests: cleanRequests(productionData),
      histories: productionData.histories || {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleaned, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar dados:', err);
  }
}

loadData();

// 🔁 Nova requisição
app.post('/request-component', (req, res) => {
  const { lineId, embalagem } = req.body;
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return res.status(404).json({ error: 'Linha não encontrada' });

  const timestamp = Date.now();
  const date = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const request = { id: line.id, name: line.name, embalagem, timestamp, date };
  productionData.requests.push(request);
  saveData();

  io.emit('componentRequested', request);
  res.status(200).json({ message: `Requisição recebida da ${line.name}`, timestamp, date });
});

// 🔁 Painéis HTML
app.get('/expedition-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/expedition.html'));
});

app.get('/production-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/production.html'));
});

// 🔁 Limpar histórico
app.post('/clear-history', (req, res) => {
  const { lineName } = req.body;
  if (!productionData.histories[lineName]) return res.status(404).json({ error: 'Histórico não encontrado' });
  productionData.histories[lineName] = [];
  saveData();
  io.emit('historyCleared', { lineName });
  res.status(200).json({ message: 'Histórico limpo com sucesso' });
});

// 🔁 Obter histórico
app.get('/get-history', (req, res) => {
  const { lineName } = req.query;
  res.json(productionData.histories[lineName] || []);
});

// 🔁 Obter requisições pendentes
app.get('/get-pending-requests', (req, res) => {
  res.json(cleanRequests(productionData));
});

// 🔁 WebSocket
io.on('connection', (socket) => {
  const safeRequests = cleanRequests(productionData);
  
const embalagensPorLinha = {
  "line1": ["Bandeja Plástica", "Caixa de Papelão", "Rack A"],
  "line2": ["Rack B", "Rack C"],
  "line3": ["Embalagem Especial"],
  "line4": ["Rack de Ferro", "Rack de Plástico"],
  "line5": ["Bandeja 1", "Bandeja 2"],
  "line6": ["Caixa X", "Caixa Y"],
  "line7": ["Suporte Individual"],
  "line8": ["Plataforma A", "Plataforma B"],
  "line9": ["Kit Alto", "Kit Baixo"],
  "line10": ["Rack com Divisória"],
  "line11": ["Rack Simples"],
  "line12": ["Pacote Envolto"],
  "line13": ["Unidade DRL"],
  "line14": ["Unidade HL"]
};

  socket.emit('initialData', { embalagensPorLinha,
    productionLines,
    pendingRequests: safeRequests
  });

  socket.on('attendRequest', ({ lineName, timestamp }) => {
    const index = productionData.requests.findIndex(r => r.timestamp === timestamp);
    if (index === -1) return;

    const request = productionData.requests[index];
    const timeTaken = formatSecondsToHHMMSS(Math.floor((Date.now() - request.timestamp) / 1000));
    const attendedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    productionData.requests.splice(index, 1);
    productionData.requests = cleanRequests(productionData);

    if (!productionData.histories[lineName]) productionData.histories[lineName] = [];
    productionData.histories[lineName].push({
      requestDate: request.date,
      date: attendedAt,
      timeTaken
    });

    saveData();
    io.emit('requestAttended', { lineName, timestamp });
  });
});
// Painéis filtrados para cada operador
app.get('/painel-operador1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/expedition_operador1.html'));
});

app.get('/painel-operador2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/expedition_operador2.html'));
});

app.get('/painel-operador3', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/expedition_operador3.html'));
});

app.get('/painel-operador4', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/expedition_operador4.html'));
});

// Início do servidor
server.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});

