/*
 * Lógica da aplicação web para buscar logs do servidor e exibi‑los na interface.
 * Atualize a constante API_URL com a URL do backend implantado no Render.
 */

const API_URL = 'http://SEU_SERVICO.onrender.com/api/logs';

const deviceForm = document.getElementById('device-form');
const deviceInput = document.getElementById('deviceId');
const resultsSection = document.getElementById('results-section');
const logsTableBody = document.querySelector('#logs-table tbody');
const downloadButton = document.getElementById('download-csv');

let currentLogs = [];

// Registra o service worker se suportado
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.error('Falha ao registrar o service worker:', err);
    });
  });
}

// Manipulador de envio do formulário
deviceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const deviceId = deviceInput.value.trim();
  if (deviceId) {
    buscarLogs(deviceId);
  }
});

// Botão para exportar em CSV
downloadButton.addEventListener('click', () => {
  if (currentLogs.length > 0) {
    exportarCSV(currentLogs);
  }
});

// Função para buscar logs do backend
function buscarLogs(deviceId) {
  // Limpa resultados anteriores
  logsTableBody.innerHTML = '';
  resultsSection.style.display = 'none';
  downloadButton.disabled = true;
  currentLogs = [];

  fetch(`${API_URL}/${encodeURIComponent(deviceId)}`)
    .then((response) => response.json())
    .then((data) => {
      currentLogs = data;
      atualizarTabela(data);
    })
    .catch((err) => {
      console.error('Erro ao buscar logs:', err);
      alert('Erro ao buscar logs. Verifique a URL da API e tente novamente.');
    });
}

// Atualiza a tabela com os dados recebidos
function atualizarTabela(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    alert('Nenhum log encontrado para este dispositivo.');
    return;
  }
  resultsSection.style.display = 'block';
  downloadButton.disabled = false;
  logsTableBody.innerHTML = '';
  // Ordena por timestamp crescente
  logs.sort((a, b) => a.timestamp - b.timestamp);
  logs.forEach((log) => {
    const tr = document.createElement('tr');
    const date = new Date(log.timestamp * 1000);
    const dateCell = document.createElement('td');
    dateCell.textContent = date.toLocaleString();
    const tsCell = document.createElement('td');
    tsCell.textContent = log.timestamp;
    tr.appendChild(dateCell);
    tr.appendChild(tsCell);
    logsTableBody.appendChild(tr);
  });
}

// Exporta o array de logs para um arquivo CSV e inicia o download
function exportarCSV(logs) {
  const header = 'timestamp,data_hora\n';
  const rows = logs
    .map((log) => {
      const date = new Date(log.timestamp * 1000);
      return `${log.timestamp},"${date.toLocaleString()}"`;
    })
    .join('\n');
  const csvContent = header + rows;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${deviceInput.value.trim()}_logs.csv`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}