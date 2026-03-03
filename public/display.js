/* global io */

function updateDisplay(ticket) {
  const codeEl = document.getElementById('display-code');
  const typeEl = document.getElementById('display-type');
  const deskEl = document.getElementById('display-desk');

  if (!ticket) {
    codeEl.textContent = '---';
    typeEl.textContent = 'Aguardando chamada';
    if (deskEl) deskEl.textContent = '';
    return;
  }

  codeEl.textContent = ticket.code;
  typeEl.textContent =
    ticket.type === 'preferencial' ? 'Atendimento preferencial' : 'Atendimento normal';
  if (deskEl) {
    deskEl.textContent = ticket.desk ? ticket.desk : '';
  }
}

function updateVideo(videoUrl) {
  const videoEl = document.getElementById('display-video');
  const emptyEl = document.getElementById('display-video-empty');

  if (!videoUrl) {
    videoEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    videoEl.pause();
    return;
  }

  videoEl.src = videoUrl;
  emptyEl.style.display = 'none';
  videoEl.style.display = 'block';

  videoEl
    .play()
    .catch(() => {
      // Ignora erros de autoplay
    });
}

function updateHistory(tickets) {
  const container = document.getElementById('history-list');
  if (!container) return;

  container.innerHTML = '';

  if (!tickets || !tickets.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhuma senha chamada ainda.';
    container.appendChild(empty);
    return;
  }

  tickets.slice(0, 5).forEach((ticket) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const code = document.createElement('div');
    code.className = 'history-item-code';
    code.textContent = ticket.code;

    const desk = document.createElement('div');
    desk.className = 'history-item-desk';
    desk.textContent = ticket.desk ? ticket.desk : '';

    item.appendChild(code);
    item.appendChild(desk);
    container.appendChild(item);
  });
}

function speakTicket(ticket) {
  if (!('speechSynthesis' in window) || !ticket) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const spacedCode = ticket.code.split('').join(' ');
  const typeText = ticket.type === 'preferencial' ? 'preferencial' : 'normal';
  const deskText = ticket.desk ? ` no ${ticket.desk}` : '';

  const utterance = new SpeechSynthesisUtterance(
    `Atenção. Senha ${spacedCode}. Atendimento ${typeText}${deskText}.`
  );
  utterance.lang = 'pt-BR';
  utterance.rate = 0.95;

  const voices = synth.getVoices();
  const femalePtVoices = voices.filter(
    (v) =>
      v.lang &&
      v.lang.toLowerCase().startsWith('pt') &&
      /maria|feminina|female|helena|leticia|luciana/i.test(v.name)
  );
  const ptVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('pt'));

  if (femalePtVoices.length > 0) {
    utterance.voice = femalePtVoices[0];
  } else if (ptVoices.length > 0) {
    utterance.voice = ptVoices[0];
  }

  synth.speak(utterance);
}

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let lastCalledTickets = [];
  socket.on('state-init', (state) => {
    updateDisplay(state.currentTicket || null);
    updateVideo(state.currentVideoUrl || '');
    lastCalledTickets = state.lastCalledTickets || [];
    updateHistory(lastCalledTickets);
  });

  socket.on('ticket-called', ({ ticket }) => {
    updateDisplay(ticket);
    speakTicket(ticket);
    lastCalledTickets = [ticket, ...lastCalledTickets.filter((t) => t.id !== ticket.id)].slice(
      0,
      5
    );
    updateHistory(lastCalledTickets);
  });

  socket.on('video-changed', ({ videoUrl }) => {
    updateVideo(videoUrl || '');
  });
});

