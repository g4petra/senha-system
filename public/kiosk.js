async function createTicket(type) {
  const btnNormal = document.getElementById('btn-normal');
  const btnPreferencial = document.getElementById('btn-preferencial');
  const ticketCodeEl = document.getElementById('ticket-code');
  const ticketHelperEl = document.getElementById('ticket-helper');

  btnNormal.disabled = true;
  btnPreferencial.disabled = true;

  try {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) {
      throw new Error('Erro ao gerar senha');
    }

    const { ticket } = await response.json();

    ticketCodeEl.textContent = ticket.code;
    ticketHelperEl.textContent =
      'Sua senha foi gerada e enviada para impressão. Aguarde ser chamado.';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    ticketHelperEl.textContent = 'Não foi possível gerar a senha. Tente novamente.';
  } finally {
    btnNormal.disabled = false;
    btnPreferencial.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnNormal = document.getElementById('btn-normal');
  const btnPreferencial = document.getElementById('btn-preferencial');

  btnNormal.addEventListener('click', () => createTicket('normal'));
  btnPreferencial.addEventListener('click', () => createTicket('preferencial'));
});

