/**
 * Website Detection Agent - Popup Controller
 * Controla la interfaz del popup y coordina escaneos.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Scan buttons
  document.getElementById('btnScan').addEventListener('click', () => startScan(false));
  document.getElementById('btnQuickScan').addEventListener('click', () => startScan(true));

  // Evidence actions
  document.getElementById('btnScreenshot').addEventListener('click', captureScreenshot);
  document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
  document.getElementById('btnClearEvidence').addEventListener('click', clearEvidence);

  // Load existing data for current tab
  loadCurrentTabData();
});

let currentScanData = null;

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadCurrentTabData() {
  const tab = await getCurrentTab();
  try {
    const data = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SCAN_DATA' });
    if (data && data.issues && data.issues.length > 0) {
      currentScanData = data;
      renderEvidence(data.issues);
      renderReport(data);
      updateStatus('Datos previos cargados', 'ready');
    }
  } catch (e) {
    // Content script not ready yet
  }
}

async function startScan(quick) {
  const tab = await getCurrentTab();
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  // Get scan options
  const options = {
    performance: document.getElementById('chkPerformance').checked,
    errors: document.getElementById('chkErrors').checked,
    accessibility: document.getElementById('chkAccessibility').checked,
    seo: document.getElementById('chkSEO').checked,
    network: document.getElementById('chkNetwork').checked,
    security: document.getElementById('chkSecurity').checked,
    responsive: document.getElementById('chkResponsive').checked,
    quick
  };

  // Update UI
  statusIndicator.className = 'status-indicator scanning';
  statusText.textContent = 'Escaneando...';
  progressContainer.style.display = 'block';

  // Animate progress
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
  }, 300);

  try {
    // Request scan from background
    const data = await chrome.runtime.sendMessage({
      type: 'REQUEST_SCAN',
      tabId: tab.id,
      options
    });

    clearInterval(progressInterval);
    progressFill.style.width = '100%';
    progressText.textContent = '100%';

    if (data.error) {
      updateStatus(`Error: ${data.error}`, 'error');
      return;
    }

    currentScanData = data;

    // Render results
    renderEvidence(data.issues || []);
    if (data.report) {
      renderReport(data);
    }

    const issueCount = (data.issues || []).length;
    const criticals = (data.issues || []).filter(i => i.severity === 'critical').length;
    updateStatus(`Escaneo completo: ${issueCount} problemas (${criticals} críticos)`, criticals > 0 ? 'error' : 'ready');

    // Switch to evidence tab
    setTimeout(() => {
      document.querySelector('.tab[data-tab="evidence"]').click();
    }, 500);
  } catch (error) {
    clearInterval(progressInterval);
    updateStatus('Error al comunicarse con la página', 'error');
  }

  setTimeout(() => {
    progressContainer.style.display = 'none';
  }, 2000);
}

function updateStatus(text, state) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  indicator.className = `status-indicator ${state === 'error' ? 'error' : state === 'scanning' ? 'scanning' : ''}`;
  statusText.textContent = text;
}

function renderEvidence(issues) {
  const list = document.getElementById('evidenceList');

  if (!issues || issues.length === 0) {
    list.innerHTML = '<p class="empty-message">No se encontraron problemas. El sitio se ve bien.</p>';
    return;
  }

  // Sort: critical first, then warning, then info
  const sorted = [...issues].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2, success: 3 };
    return (order[a.severity] || 3) - (order[b.severity] || 3);
  });

  list.innerHTML = sorted.map(issue => `
    <div class="evidence-item ${issue.severity}">
      <h4>[${issue.category.toUpperCase()}] ${issue.title}</h4>
      <p>${issue.description}</p>
      <span class="severity ${issue.severity}">${issue.severity.toUpperCase()}</span>
    </div>
  `).join('');
}

function renderReport(data) {
  const container = document.getElementById('reportSummary');
  const report = data.report;

  if (!report) {
    container.innerHTML = '<p class="empty-message">No hay reporte disponible.</p>';
    return;
  }

  const scoreClass = report.overallScore >= 70 ? 'good' : report.overallScore >= 50 ? 'average' : 'poor';

  let html = `
    <div class="report-section">
      <div class="score-card">
        <div class="score-item">
          <div class="score-value ${scoreClass}">${report.overallScore}</div>
          <div class="score-label">General</div>
        </div>
        <div class="score-item">
          <div class="score-value ${report.categories.performance >= 70 ? 'good' : report.categories.performance >= 50 ? 'average' : 'poor'}">${report.categories.performance}</div>
          <div class="score-label">Rendimiento</div>
        </div>
        <div class="score-item">
          <div class="score-value ${report.categories.accessibility >= 70 ? 'good' : report.categories.accessibility >= 50 ? 'average' : 'poor'}">${report.categories.accessibility}</div>
          <div class="score-label">Accesibilidad</div>
        </div>
        <div class="score-item">
          <div class="score-value ${report.categories.seo >= 70 ? 'good' : report.categories.seo >= 50 ? 'average' : 'poor'}">${report.categories.seo}</div>
          <div class="score-label">SEO</div>
        </div>
        <div class="score-item">
          <div class="score-value ${report.categories.security >= 70 ? 'good' : report.categories.security >= 50 ? 'average' : 'poor'}">${report.categories.security}</div>
          <div class="score-label">Seguridad</div>
        </div>
      </div>
      <p style="text-align:center; font-size:12px; color:#aaa; margin-bottom:12px;">${report.summary}</p>
    </div>

    <div class="report-section">
      <h3>Resumen de Problemas</h3>
      <div style="display:flex; gap:12px; margin-bottom:12px;">
        <span class="severity critical">${report.criticalCount} Críticos</span>
        <span class="severity warning">${report.warningCount} Advertencias</span>
        <span class="severity info">${report.infoCount} Info</span>
      </div>
    </div>
  `;

  if (report.suggestions && report.suggestions.length > 0) {
    html += `<div class="report-section"><h3>Sugerencias de Mejora</h3>`;
    report.suggestions.forEach(suggestion => {
      html += `
        <div class="suggestion-item">
          <span class="priority ${suggestion.priority}">[${suggestion.priority.toUpperCase()}]</span>
          <strong>${suggestion.title}</strong>
          <ul style="margin-top:6px; padding-left:16px;">
            ${suggestion.actions.map(a => `<li style="margin-bottom:3px; color:#aaa; font-size:11px;">${a}</li>`).join('')}
          </ul>
        </div>
      `;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

async function captureScreenshot() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
    if (response.screenshot) {
      // Create download link
      const link = document.createElement('a');
      link.download = `wda-screenshot-${Date.now()}.png`;
      link.href = response.screenshot;
      link.click();
      updateStatus('Captura guardada', 'ready');
    }
  } catch (error) {
    updateStatus('Error al capturar pantalla', 'error');
  }
}

function exportJSON() {
  if (!currentScanData) {
    updateStatus('No hay datos para exportar', 'error');
    return;
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    agentVersion: '1.0.0',
    ...currentScanData
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `wda-report-${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  updateStatus('Reporte JSON exportado', 'ready');
}

async function clearEvidence() {
  const tab = await getCurrentTab();
  await chrome.runtime.sendMessage({ type: 'CLEAR_DATA', tabId: tab.id });
  currentScanData = null;
  document.getElementById('evidenceList').innerHTML = '<p class="empty-message">Evidencias limpiadas.</p>';
  document.getElementById('reportSummary').innerHTML = '<p class="empty-message">Ejecuta un escaneo para generar el reporte.</p>';
  updateStatus('Listo para analizar', 'ready');
}
