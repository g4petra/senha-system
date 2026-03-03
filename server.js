const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');
const { EscPosPrinter } = require('node-escpos');
const { pool, initDatabase, withTransaction } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const ESC_POS_ENABLED = process.env.ESC_POS_ENABLED === '1';
const ESC_POS_PORT = process.env.ESC_POS_PORT || 'COM3';
const ESC_POS_BAUD = Number.parseInt(process.env.ESC_POS_BAUD || '9600', 10);

const defaultPrinterConfig = {
  enabled: ESC_POS_ENABLED,
  port: ESC_POS_PORT,
  baudRate: ESC_POS_BAUD,
};

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ticketFromRow(row) {
  return {
    id: Number(row.id),
    code: row.code,
    type: row.type,
    status: row.status,
    desk: row.desk,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseTicketId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function getPrinterConfig() {
  const result = await pool.query(
    'SELECT enabled, port, baud_rate FROM printer_config WHERE id = 1 LIMIT 1'
  );

  const row = result.rows[0];
  return {
    enabled: Boolean(row.enabled),
    port: row.port,
    baudRate: Number(row.baud_rate),
  };
}

async function createTicket(type) {
  return withTransaction(async (client) => {
    const stateResult = await client.query(
      'SELECT next_ticket_number FROM app_state WHERE id = 1 FOR UPDATE'
    );

    const nextTicketNumber = Number(stateResult.rows[0].next_ticket_number);
    const prefix = type === 'preferencial' ? 'P' : 'N';
    const code = `${prefix}${String(nextTicketNumber).padStart(3, '0')}`;

    await client.query('UPDATE app_state SET next_ticket_number = $1 WHERE id = 1', [
      nextTicketNumber + 1,
    ]);

    const insertResult = await client.query(
      `
      INSERT INTO tickets (code, type, status)
      VALUES ($1, $2, 'waiting')
      RETURNING id, code, type, status, desk, created_at
      `,
      [code, type]
    );

    return ticketFromRow(insertResult.rows[0]);
  });
}

async function getWaitingTickets() {
  const result = await pool.query(
    `
    SELECT id, code, type, status, desk, created_at
    FROM tickets
    WHERE status = 'waiting'
    ORDER BY CASE WHEN type = 'preferencial' THEN 0 ELSE 1 END, created_at ASC
    `
  );

  return result.rows.map(ticketFromRow);
}

async function getCurrentTicket() {
  const result = await pool.query(
    `
    SELECT id, code, type, status, desk, created_at
    FROM tickets
    WHERE status = 'called'
    ORDER BY called_at DESC NULLS LAST
    LIMIT 1
    `
  );

  if (!result.rows.length) return null;
  return ticketFromRow(result.rows[0]);
}

async function getLastCalledTickets() {
  const result = await pool.query(
    `
    SELECT id, code, type, status, desk, created_at
    FROM tickets
    WHERE status = 'called'
    ORDER BY called_at DESC NULLS LAST
    LIMIT 5
    `
  );

  return result.rows.map(ticketFromRow);
}

async function getCurrentVideoUrl() {
  const result = await pool.query('SELECT current_video_url FROM app_state WHERE id = 1');
  return result.rows[0].current_video_url;
}

async function getCurrentState() {
  const [currentTicket, currentVideoUrl, waitingTickets, lastCalledTickets] = await Promise.all([
    getCurrentTicket(),
    getCurrentVideoUrl(),
    getWaitingTickets(),
    getLastCalledTickets(),
  ]);

  return {
    currentTicket,
    currentVideoUrl,
    waitingTickets,
    lastCalledTickets,
  };
}

function printTicketEscPos(ticket, printerConfig) {
  if (!printerConfig.enabled) return;

  try {
    const printer = new EscPosPrinter(printerConfig.port, {
      baudRate: printerConfig.baudRate,
      autoOpen: true,
    });

    printer.on('ready', () => {
      try {
        printer.printCentered('CLINICA');
        printer.printLine('');
        printer.printCentered(ticket.code);
        printer.printCentered(
          ticket.type === 'preferencial' ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'
        );
        printer.printLine('');
        printer.printCentered('Aguarde ser chamado');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Erro ao imprimir ticket:', err);
      }
    });

    printer.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Erro na impressora ESC/POS:', err);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Falha ao inicializar impressora ESC/POS:', err);
  }
}

app.get('/api/printer-config', async (_req, res) => {
  try {
    const config = await getPrinterConfig();
    return res.json(config);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao carregar configuracao da impressora' });
  }
});

app.post('/api/printer-config', async (req, res) => {
  const { enabled, port, baudRate } = req.body || {};

  try {
    const current = await getPrinterConfig();

    const nextConfig = { ...current };

    if (typeof enabled === 'boolean') {
      nextConfig.enabled = enabled;
    }

    if (typeof port === 'string' && port.trim()) {
      nextConfig.port = port.trim();
    }

    const baudNumber = Number.parseInt(baudRate, 10);
    if (!Number.isNaN(baudNumber) && baudNumber > 0) {
      nextConfig.baudRate = baudNumber;
    }

    await pool.query(
      'UPDATE printer_config SET enabled = $1, port = $2, baud_rate = $3 WHERE id = 1',
      [nextConfig.enabled, nextConfig.port, nextConfig.baudRate]
    );

    return res.json(nextConfig);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao salvar configuracao da impressora' });
  }
});

app.post('/api/tickets', async (req, res) => {
  const { type } = req.body || {};

  if (type !== 'normal' && type !== 'preferencial') {
    return res.status(400).json({ error: 'Tipo de senha invalido' });
  }

  try {
    const ticket = await createTicket(type);
    io.emit('ticket-created', { ticket });

    const printerConfig = await getPrinterConfig();
    printTicketEscPos(ticket, printerConfig);

    return res.status(201).json({ ticket });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao criar senha' });
  }
});

app.get('/api/tickets', async (req, res) => {
  const { status } = req.query;

  try {
    if (!status) {
      const result = await pool.query(
        'SELECT id, code, type, status, desk, created_at FROM tickets ORDER BY created_at ASC'
      );
      return res.json({ tickets: result.rows.map(ticketFromRow) });
    }

    if (status !== 'waiting' && status !== 'called') {
      return res.status(400).json({ error: 'Status invalido' });
    }

    const result = await pool.query(
      'SELECT id, code, type, status, desk, created_at FROM tickets WHERE status = $1 ORDER BY created_at ASC',
      [status]
    );

    return res.json({ tickets: result.rows.map(ticketFromRow) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao buscar senhas' });
  }
});

app.post('/api/call-ticket', async (req, res) => {
  const { ticketId, desk } = req.body || {};
  const parsedTicketId = parseTicketId(ticketId);

  if (!parsedTicketId) {
    return res.status(400).json({ error: 'ticketId invalido' });
  }

  try {
    const updateResult = await pool.query(
      `
      UPDATE tickets
      SET status = 'called', desk = $2, called_at = NOW()
      WHERE id = $1 AND status = 'waiting'
      RETURNING id, code, type, status, desk, created_at
      `,
      [parsedTicketId, desk || null]
    );

    if (!updateResult.rows.length) {
      const existsResult = await pool.query('SELECT id, status FROM tickets WHERE id = $1', [
        parsedTicketId,
      ]);

      if (!existsResult.rows.length) {
        return res.status(404).json({ error: 'Senha nao encontrada' });
      }

      return res.status(409).json({ error: 'Senha ja chamada' });
    }

    const ticket = ticketFromRow(updateResult.rows[0]);
    io.emit('ticket-called', { ticket });

    return res.json({ ticket });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao chamar senha' });
  }
});

app.post('/api/next-ticket', async (req, res) => {
  const { desk } = req.body || {};

  try {
    const ticket = await withTransaction(async (client) => {
      const nextResult = await client.query(
        `
        SELECT id
        FROM tickets
        WHERE status = 'waiting'
        ORDER BY CASE WHEN type = 'preferencial' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        `
      );

      if (!nextResult.rows.length) {
        return null;
      }

      const ticketId = Number(nextResult.rows[0].id);
      const updateResult = await client.query(
        `
        UPDATE tickets
        SET status = 'called', desk = $2, called_at = NOW()
        WHERE id = $1
        RETURNING id, code, type, status, desk, created_at
        `,
        [ticketId, desk || null]
      );

      return ticketFromRow(updateResult.rows[0]);
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Nenhuma senha em espera' });
    }

    io.emit('ticket-called', { ticket });

    return res.json({ ticket });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao chamar proxima senha' });
  }
});

app.post('/api/video', async (req, res) => {
  const { videoUrl } = req.body || {};

  if (typeof videoUrl !== 'string') {
    return res.status(400).json({ error: 'URL de video invalida' });
  }

  try {
    await pool.query('UPDATE app_state SET current_video_url = $1 WHERE id = 1', [videoUrl]);
    io.emit('video-changed', { videoUrl });

    return res.json({ videoUrl });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao atualizar video' });
  }
});

app.post('/api/video-upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo de video nao enviado' });
  }

  try {
    const publicPath = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE app_state SET current_video_url = $1 WHERE id = 1', [publicPath]);
    io.emit('video-changed', { videoUrl: publicPath });

    return res.json({ videoUrl: publicPath });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao salvar video' });
  }
});

app.get('/api/current-state', async (_req, res) => {
  try {
    const state = await getCurrentState();
    return res.json(state);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: 'Falha ao buscar estado atual' });
  }
});

io.on('connection', async (socket) => {
  try {
    const state = await getCurrentState();
    socket.emit('state-init', state);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Erro ao inicializar socket:', error);
  }
});

async function start() {
  try {
    await initDatabase(defaultPrinterConfig);

    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Servidor de senhas rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Falha ao inicializar banco de dados:', error.message);
    process.exit(1);
  }
}

start();
