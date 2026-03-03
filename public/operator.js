/* global io */

function formatTime(dateIsoString) {
  const d = new Date(dateIsoString);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderTickets(tickets) {
  const container = document.getElementById('tickets-list');
  container.innerHTML = '';

  if (!tickets.length) {
    container.innerHTML =
      '<div class="display-empty" style="padding: 16px;">Nenhuma senha em espera.</div>';
    return;
  }

  tickets
    .slice()
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'preferencial' ? -1 : 1;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .forEach((ticket) => {
      const pill = document.createElement('button');
      pill.className = 'ticket-pill';
      if (ticket.type === 'preferencial') {
        pill.classList.add('ticket-pill-preferential');
      }
      pill.setAttribute('data-ticket-id', String(ticket.id));

      pill.innerHTML = `
        <span>${ticket.code}</span>
        <span class="ticket-pill-type">
          ${ticket.type === 'preferencial' ? 'PREFERENCIAL' : 'NORMAL'}
        </span>
        <span class="ticket-pill-time">${formatTime(ticket.createdAt)}</span>
      `;

      pill.addEventListener('click', () => {
        const deskSelect = document.getElementById('select-desk');
        const desk = deskSelect ? deskSelect.value : null;
        callTicket(ticket.id, desk);
      });
      container.appendChild(pill);
    });
}

function setCurrentTicketLabel(ticket) {
  const el = document.getElementById('panel-current-ticket');
  if (!ticket) {
    el.textContent = 'Nenhuma senha chamada';
    return;
  }
  const deskText = ticket.desk ? ` - ${ticket.desk}` : '';
  el.textContent = `Última chamada: ${ticket.code}${deskText} (${ticket.type === 'preferencial' ? 'preferencial' : 'normal'})`;
}

function setPreviewVideo(videoUrl) {
  const preview = document.getElementById('preview-video');
  const empty = document.getElementById('preview-video-empty');

  if (!preview || !empty) return;

  if (!videoUrl) {
    preview.removeAttribute('src');
    preview.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  preview.src = videoUrl;
  empty.style.display = 'none';
  preview.style.display = 'block';

  preview
    .play()
    .catch(() => {
      // Ignora erros de autoplay
    });
}

async function fetchState() {
  const response = await fetch('/api/current-state');
  if (!response.ok) return;
  const data = await response.json();
  renderTickets(data.waitingTickets || []);
  setCurrentTicketLabel(data.currentTicket || null);
   if (data.currentVideoUrl) {
    setPreviewVideo(data.currentVideoUrl);
  } else {
    setPreviewVideo('');
  }
}

async function callTicket(ticketId, desk) {
  try {
    const response = await fetch('/api/call-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, desk }),
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('Erro ao chamar senha');
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

async function callNextTicket(desk) {
  try {
    const response = await fetch('/api/next-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desk }),
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('Erro ao chamar próxima senha');
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

async function updateVideo(videoUrl) {
  try {
    const response = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl }),
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('Erro ao atualizar vídeo');
      return;
    }
    setPreviewVideo(videoUrl || '');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

async function fetchPrinterConfig() {
  try {
    const response = await fetch('/api/printer-config');
    if (!response.ok) return;
    const config = await response.json();

    const enabledInput = document.getElementById('printer-enabled');
    const portInput = document.getElementById('printer-port');
    const baudSelect = document.getElementById('printer-baud');

    if (enabledInput) enabledInput.checked = Boolean(config.enabled);
    if (portInput && typeof config.port === 'string') portInput.value = config.port;
    if (baudSelect && config.baudRate) {
      const value = String(config.baudRate);
      if ([...baudSelect.options].some((opt) => opt.value === value)) {
        baudSelect.value = value;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Erro ao buscar configuração da impressora', err);
  }
}

async function savePrinterConfig() {
  try {
    const enabledInput = document.getElementById('printer-enabled');
    const portInput = document.getElementById('printer-port');
    const baudSelect = document.getElementById('printer-baud');

    const body = {
      enabled: enabledInput ? enabledInput.checked : false,
      port: portInput ? portInput.value : undefined,
      baudRate: baudSelect ? baudSelect.value : undefined,
    };

    const response = await fetch('/api/printer-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('Erro ao salvar configuração da impressora');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Erro ao salvar configuração da impressora', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  const btnRefresh = document.getElementById('btn-refresh');
  const selectVideo = document.getElementById('select-video');
  const inputCustomVideo = document.getElementById('input-custom-video');
  const btnApplyVideo = document.getElementById('btn-apply-video');
  const inputLocalVideo = document.getElementById('input-local-video');
  const btnUploadVideo = document.getElementById('btn-upload-video');
  const btnNextTicket = document.getElementById('btn-next-ticket');
  const selectDesk = document.getElementById('select-desk');
  const printerSave = document.getElementById('printer-save');

  btnRefresh.addEventListener('click', () => {
    fetchState();
  });

  btnNextTicket.addEventListener('click', () => {
    const desk = selectDesk ? selectDesk.value : null;
    callNextTicket(desk);
  });

  if (printerSave) {
    printerSave.addEventListener('click', () => {
      savePrinterConfig();
    });
  }

  selectVideo.addEventListener('change', () => {
    const url = selectVideo.value;
    if (url) {
      inputCustomVideo.value = '';
      updateVideo(url);
    } else {
      updateVideo('');
    }
  });

  btnApplyVideo.addEventListener('click', () => {
    const url = inputCustomVideo.value.trim();
    if (url) {
      selectVideo.value = '';
      updateVideo(url);
    }
  });

  if (btnUploadVideo && inputLocalVideo) {
    btnUploadVideo.addEventListener('click', async () => {
      const file = inputLocalVideo.files && inputLocalVideo.files[0];
      if (!file) {
        // eslint-disable-next-line no-console
        console.error('Nenhum arquivo de vídeo selecionado');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('video', file);

        const response = await fetch('/api/video-upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.error('Erro ao enviar vídeo local');
          return;
        }

        const result = await response.json();
        if (result && result.videoUrl) {
          setPreviewVideo(result.videoUrl);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Erro ao enviar vídeo local', err);
      }
    });
  }

  socket.on('state-init', (state) => {
    renderTickets(state.waitingTickets || []);
    setCurrentTicketLabel(state.currentTicket || null);
  });

  socket.on('ticket-created', () => {
    // Atualiza lista automaticamente quando uma nova senha é gerada
    fetchState();
  });

  socket.on('ticket-called', ({ ticket }) => {
    setCurrentTicketLabel(ticket);
    // Atualiza lista automaticamente quando uma senha é chamada
    fetchState();
  });

  socket.on('video-changed', ({ videoUrl }) => {
    setPreviewVideo(videoUrl || '');
  });

  fetchState();
  fetchPrinterConfig();
  // Atualização periódica como reforço, caso algum evento em tempo real se perca
  setInterval(fetchState, 5000);
});

