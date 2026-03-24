/**
 * Website Detection Agent - Background Service Worker
 * Gestiona la comunicación entre el content script y el popup.
 */

// Storage for collected data per tab
const tabData = {};
const scanHistory = [];

// Listen for issues from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_ISSUE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      if (!tabData[tabId]) {
        tabData[tabId] = { issues: [], metrics: {} };
      }
      tabData[tabId].issues.push(message.issue);
      updateBadge(tabId);
    }
  }

  if (message.type === 'GET_TAB_DATA') {
    const tabId = message.tabId;
    sendResponse(tabData[tabId] || { issues: [], metrics: {} });
  }

  if (message.type === 'REQUEST_SCAN') {
    performScan(message.tabId, message.options).then(data => {
      sendResponse(data);
    });
    return true;
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl, timestamp: new Date().toISOString() });
    });
    return true;
  }

  if (message.type === 'GET_SCAN_HISTORY') {
    sendResponse(scanHistory);
  }

  if (message.type === 'CLEAR_DATA') {
    const tabId = message.tabId;
    if (tabId && tabData[tabId]) {
      delete tabData[tabId];
      updateBadge(tabId);
    }
    sendResponse({ success: true });
  }

  return true;
});

// Perform full scan on a tab
async function performScan(tabId, options) {
  try {
    const results = await chrome.tabs.sendMessage(tabId, {
      type: 'RUN_SCAN',
      options
    });

    // Store results
    tabData[tabId] = {
      issues: results.issues || [],
      metrics: results.metrics || {},
      pageInfo: results.pageInfo || {},
      viewport: results.viewport || {},
      connection: results.connection || null,
      scanTimestamp: new Date().toISOString()
    };

    // Generate analysis report
    const report = generateReport(tabData[tabId]);
    tabData[tabId].report = report;

    // Save to history
    scanHistory.unshift({
      url: results.url,
      title: results.title,
      timestamp: new Date().toISOString(),
      issueCount: results.issues.length,
      score: report.overallScore
    });

    // Keep only last 50 scans
    if (scanHistory.length > 50) {
      scanHistory.pop();
    }

    updateBadge(tabId);
    return tabData[tabId];
  } catch (error) {
    return { error: `Error al escanear: ${error.message}` };
  }
}

// Generate analysis report with suggestions
function generateReport(data) {
  const issues = data.issues || [];
  const metrics = data.metrics || {};

  // Calculate scores per category
  const categories = {
    performance: { score: 100, weight: 30 },
    accessibility: { score: 100, weight: 25 },
    seo: { score: 100, weight: 20 },
    security: { score: 100, weight: 15 },
    responsive: { score: 100, weight: 10 }
  };

  const penaltyMap = { critical: 25, warning: 10, info: 3 };

  issues.forEach(issue => {
    const cat = issue.category;
    if (categories[cat]) {
      const penalty = penaltyMap[issue.severity] || 5;
      categories[cat].score = Math.max(0, categories[cat].score - penalty);
    }
  });

  // Overall weighted score
  let totalWeight = 0;
  let weightedScore = 0;
  Object.values(categories).forEach(cat => {
    weightedScore += cat.score * cat.weight;
    totalWeight += cat.weight;
  });
  const overallScore = Math.round(weightedScore / totalWeight);

  // Generate suggestions
  const suggestions = generateSuggestions(issues, metrics);

  return {
    overallScore,
    categories: {
      performance: categories.performance.score,
      accessibility: categories.accessibility.score,
      seo: categories.seo.score,
      security: categories.security.score,
      responsive: categories.responsive.score
    },
    suggestions,
    summary: getSummary(overallScore),
    criticalCount: issues.filter(i => i.severity === 'critical').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    infoCount: issues.filter(i => i.severity === 'info').length
  };
}

function generateSuggestions(issues, metrics) {
  const suggestions = [];

  // Performance suggestions
  if (metrics.lcp > 2500) {
    suggestions.push({
      priority: 'high',
      category: 'performance',
      title: 'Optimizar Largest Contentful Paint',
      actions: [
        'Optimizar y comprimir imágenes hero/banner',
        'Implementar lazy loading para imágenes below-the-fold',
        'Usar formatos modernos (WebP, AVIF)',
        'Precargar recursos críticos con <link rel="preload">',
        'Implementar CDN para assets estáticos'
      ]
    });
  }

  if (metrics.cls > 0.1) {
    suggestions.push({
      priority: 'high',
      category: 'performance',
      title: 'Reducir Cumulative Layout Shift',
      actions: [
        'Definir width y height en todas las imágenes',
        'Reservar espacio para anuncios y contenido dinámico',
        'Evitar insertar contenido dinámico sobre contenido existente',
        'Usar transform para animaciones en lugar de propiedades que causan layout'
      ]
    });
  }

  if (metrics.totalResources > 80) {
    suggestions.push({
      priority: 'medium',
      category: 'performance',
      title: 'Reducir número de peticiones HTTP',
      actions: [
        'Combinar archivos CSS y JavaScript',
        'Usar CSS sprites o icon fonts',
        'Implementar HTTP/2 para multiplexing',
        'Eliminar recursos no utilizados'
      ]
    });
  }

  // Accessibility suggestions
  const accessIssues = issues.filter(i => i.category === 'accessibility');
  if (accessIssues.length > 0) {
    suggestions.push({
      priority: accessIssues.some(i => i.severity === 'critical') ? 'high' : 'medium',
      category: 'accessibility',
      title: 'Mejorar accesibilidad WCAG',
      actions: [
        'Agregar alt text descriptivo a todas las imágenes',
        'Asociar labels a todos los campos de formulario',
        'Mantener una jerarquía de encabezados correcta (h1>h2>h3)',
        'Asegurar ratios de contraste mínimos de 4.5:1',
        'Implementar navegación por teclado completa',
        'Agregar atributo lang al elemento <html>'
      ]
    });
  }

  // SEO suggestions
  const seoIssues = issues.filter(i => i.category === 'seo');
  if (seoIssues.length > 0) {
    suggestions.push({
      priority: seoIssues.some(i => i.severity === 'critical') ? 'high' : 'medium',
      category: 'seo',
      title: 'Optimizar SEO on-page',
      actions: [
        'Asegurar título único y descriptivo (30-60 chars)',
        'Agregar meta description relevante (120-155 chars)',
        'Usar un solo H1 por página',
        'Implementar URL canónica',
        'Agregar datos estructurados JSON-LD',
        'Configurar Open Graph para redes sociales'
      ]
    });
  }

  // Security suggestions
  const securityIssues = issues.filter(i => i.category === 'security');
  if (securityIssues.length > 0) {
    suggestions.push({
      priority: 'high',
      category: 'security',
      title: 'Mejorar seguridad del sitio',
      actions: [
        'Migrar completamente a HTTPS',
        'Eliminar contenido mixto HTTP/HTTPS',
        'Agregar rel="noopener noreferrer" a enlaces externos',
        'Evitar event handlers inline',
        'Implementar Content Security Policy (CSP)',
        'Configurar headers de seguridad (X-Frame-Options, etc.)'
      ]
    });
  }

  // Responsive suggestions
  const respIssues = issues.filter(i => i.category === 'responsive');
  if (respIssues.length > 0) {
    suggestions.push({
      priority: respIssues.some(i => i.severity === 'critical') ? 'high' : 'medium',
      category: 'responsive',
      title: 'Mejorar diseño responsivo',
      actions: [
        'Corregir desbordamiento horizontal',
        'Usar unidades relativas (%, vw, rem) en lugar de px fijos',
        'Aumentar tamaño de objetivos táctiles a 44x44px mínimo',
        'Implementar srcset/sizes en imágenes',
        'Usar fuentes de al menos 16px para texto body',
        'Probar en múltiples dispositivos y resoluciones'
      ]
    });
  }

  return suggestions;
}

function getSummary(score) {
  if (score >= 90) return 'Excelente: El sitio cumple con la mayoría de estándares web.';
  if (score >= 70) return 'Bueno: El sitio tiene algunas áreas de mejora moderadas.';
  if (score >= 50) return 'Regular: Se necesitan mejoras significativas en varias áreas.';
  return 'Necesita atención urgente: Múltiples problemas críticos detectados.';
}

// Update extension badge with issue count
function updateBadge(tabId) {
  const data = tabData[tabId];
  if (!data) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const criticalCount = data.issues.filter(i => i.severity === 'critical').length;
  const totalCount = data.issues.length;

  if (criticalCount > 0) {
    chrome.action.setBadgeText({ tabId, text: String(criticalCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#f44336' });
  } else if (totalCount > 0) {
    chrome.action.setBadgeText({ tabId, text: String(totalCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff9800' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Clean up data when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabData[tabId];
});

// Re-initialize on tab navigation
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) {
    if (tabData[details.tabId]) {
      delete tabData[details.tabId];
      updateBadge(details.tabId);
    }
  }
});
