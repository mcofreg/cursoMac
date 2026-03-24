/**
 * Website Detection Agent - Analysis Engine
 * Motor de análisis que procesa los datos recopilados y genera
 * recomendaciones accionables para mejorar sitios web.
 *
 * Puede ejecutarse como script Node.js o integrarse en un backend.
 *
 * Uso: node analysis-agent.js <path-to-report.json>
 */

class WebsiteAnalysisAgent {
  constructor() {
    this.benchmarks = {
      performance: {
        lcp: { good: 2500, moderate: 4000 },
        fid: { good: 100, moderate: 300 },
        cls: { good: 0.1, moderate: 0.25 },
        ttfb: { good: 200, moderate: 600 },
        fullLoad: { good: 3000, moderate: 5000 },
        maxRequests: 80,
        maxTransferMB: 3
      },
      accessibility: {
        minContrastRatio: 4.5,
        minTouchTarget: 44,
        minFontSize: 12
      },
      seo: {
        titleMinLength: 30,
        titleMaxLength: 60,
        descMinLength: 120,
        descMaxLength: 155
      }
    };
  }

  /**
   * Analyze a scan report and generate detailed recommendations
   */
  analyze(scanData) {
    const analysis = {
      timestamp: new Date().toISOString(),
      url: scanData.url,
      title: scanData.title,
      scores: this.calculateScores(scanData),
      criticalIssues: this.getCriticalIssues(scanData),
      improvementPlan: this.generateImprovementPlan(scanData),
      quickWins: this.identifyQuickWins(scanData),
      longTermRecommendations: this.generateLongTermRecommendations(scanData),
      estimatedImpact: this.estimateImpact(scanData)
    };

    return analysis;
  }

  calculateScores(data) {
    const issues = data.issues || [];
    const categories = ['performance', 'accessibility', 'seo', 'security', 'responsive', 'javascript', 'network'];
    const scores = {};

    categories.forEach(cat => {
      const catIssues = issues.filter(i => i.category === cat);
      let score = 100;
      catIssues.forEach(issue => {
        switch (issue.severity) {
          case 'critical': score -= 25; break;
          case 'warning': score -= 10; break;
          case 'info': score -= 3; break;
        }
      });
      scores[cat] = Math.max(0, score);
    });

    // Weighted overall
    const weights = { performance: 30, accessibility: 25, seo: 20, security: 15, responsive: 10 };
    let totalWeight = 0;
    let weightedSum = 0;
    Object.entries(weights).forEach(([cat, weight]) => {
      const s = scores[cat] !== undefined ? scores[cat] : 100;
      weightedSum += s * weight;
      totalWeight += weight;
    });
    scores.overall = Math.round(weightedSum / totalWeight);

    return scores;
  }

  getCriticalIssues(data) {
    return (data.issues || [])
      .filter(i => i.severity === 'critical')
      .map(issue => ({
        category: issue.category,
        title: issue.title,
        description: issue.description,
        impact: this.getImpactDescription(issue),
        fixPriority: 'INMEDIATA'
      }));
  }

  getImpactDescription(issue) {
    const impacts = {
      performance: 'Afecta directamente la velocidad de carga y la experiencia del usuario. Google usa Core Web Vitals como factor de ranking.',
      accessibility: 'Excluye a usuarios con discapacidades y puede violar regulaciones legales (WCAG 2.1 AA).',
      seo: 'Reduce la visibilidad en motores de búsqueda y el tráfico orgánico.',
      security: 'Pone en riesgo los datos de los usuarios y la integridad del sitio.',
      responsive: 'Degrada la experiencia en dispositivos móviles, que representan >50% del tráfico web.',
      javascript: 'Causa errores visibles para el usuario y puede bloquear funcionalidades.',
      network: 'Aumenta tiempos de carga y consume ancho de banda innecesariamente.'
    };
    return impacts[issue.category] || 'Impacta la calidad general del sitio web.';
  }

  generateImprovementPlan(data) {
    const issues = data.issues || [];
    const plan = {
      immediate: [],  // Fix within 1 day
      shortTerm: [],  // Fix within 1 week
      mediumTerm: [], // Fix within 1 month
      longTerm: []    // Ongoing improvements
    };

    // Categorize by urgency
    issues.forEach(issue => {
      const item = {
        category: issue.category,
        title: issue.title,
        steps: this.getFixSteps(issue),
        tools: this.getRecommendedTools(issue)
      };

      if (issue.severity === 'critical') {
        plan.immediate.push(item);
      } else if (issue.severity === 'warning') {
        plan.shortTerm.push(item);
      } else {
        plan.mediumTerm.push(item);
      }
    });

    // Add long-term recommendations
    plan.longTerm = [
      {
        title: 'Monitoreo continuo',
        steps: [
          'Configurar alertas de rendimiento con herramientas como SpeedCurve o WebPageTest',
          'Implementar Real User Monitoring (RUM)',
          'Realizar auditorías de accesibilidad trimestrales',
          'Mantener dependencias actualizadas'
        ]
      },
      {
        title: 'Optimización progresiva',
        steps: [
          'Migrar a formatos de imagen modernos (WebP/AVIF)',
          'Implementar Service Workers para caching offline',
          'Adoptar arquitectura de carga progresiva',
          'Optimizar Critical Rendering Path'
        ]
      }
    ];

    return plan;
  }

  getFixSteps(issue) {
    const fixMap = {
      'LCP alto': [
        'Identificar el elemento LCP con Chrome DevTools > Performance',
        'Si es imagen: comprimir, convertir a WebP, agregar loading="lazy"',
        'Si es texto: asegurar fuentes con font-display: swap',
        'Agregar <link rel="preload"> para recursos críticos',
        'Verificar que el servidor responda en <200ms (TTFB)'
      ],
      'CLS alto': [
        'Agregar width y height a todas las imágenes y videos',
        'Reservar espacio CSS para anuncios con min-height',
        'Evitar insertar contenido sobre contenido visible',
        'Usar CSS contain para limitar recálculos de layout'
      ],
      'sin atributo alt': [
        'Auditar todas las imágenes del sitio',
        'Agregar alt descriptivo a imágenes informativas',
        'Usar alt="" solo para imágenes decorativas',
        'Verificar con un lector de pantalla (NVDA, VoiceOver)'
      ],
      'Sin etiqueta <title>': [
        'Agregar <title> único a cada página',
        'Incluir keyword principal al inicio',
        'Mantener entre 30-60 caracteres',
        'Evitar duplicar títulos entre páginas'
      ],
      'sin HTTPS': [
        'Obtener certificado SSL (Let\'s Encrypt es gratuito)',
        'Configurar redirección 301 de HTTP a HTTPS',
        'Actualizar todas las URLs internas a HTTPS',
        'Verificar que no quede contenido mixto'
      ]
    };

    for (const [key, steps] of Object.entries(fixMap)) {
      if (issue.title.toLowerCase().includes(key.toLowerCase())) {
        return steps;
      }
    }

    return [
      `Investigar: ${issue.title}`,
      `Referencia: ${issue.description}`,
      'Verificar corrección en múltiples navegadores'
    ];
  }

  getRecommendedTools(issue) {
    const toolMap = {
      performance: ['Chrome DevTools Performance', 'Lighthouse', 'WebPageTest', 'PageSpeed Insights'],
      accessibility: ['axe DevTools', 'WAVE', 'Lighthouse Accessibility', 'NVDA/VoiceOver'],
      seo: ['Google Search Console', 'Screaming Frog', 'Lighthouse SEO'],
      security: ['Mozilla Observatory', 'Security Headers', 'SSL Labs'],
      responsive: ['Chrome DevTools Device Mode', 'BrowserStack', 'Responsively'],
      network: ['Chrome DevTools Network', 'WebPageTest', 'GTmetrix'],
      javascript: ['Chrome DevTools Console', 'Sentry', 'LogRocket']
    };

    return toolMap[issue.category] || ['Chrome DevTools'];
  }

  identifyQuickWins(data) {
    const quickWins = [];
    const issues = data.issues || [];

    // Quick wins are low-effort, high-impact fixes
    const quickFixPatterns = [
      { pattern: /alt/i, fix: 'Agregar atributos alt a imágenes', effort: 'Bajo', impact: 'Alto' },
      { pattern: /lang/i, fix: 'Agregar atributo lang="es" al HTML', effort: 'Muy bajo', impact: 'Medio' },
      { pattern: /noopener/i, fix: 'Agregar rel="noopener noreferrer" a enlaces externos', effort: 'Bajo', impact: 'Medio' },
      { pattern: /viewport/i, fix: 'Agregar meta viewport', effort: 'Muy bajo', impact: 'Alto' },
      { pattern: /meta description/i, fix: 'Agregar meta description', effort: 'Bajo', impact: 'Alto' },
      { pattern: /canonical/i, fix: 'Agregar link canonical', effort: 'Bajo', impact: 'Medio' },
      { pattern: /async|defer/i, fix: 'Agregar async/defer a scripts', effort: 'Bajo', impact: 'Alto' },
      { pattern: /compresión|gzip/i, fix: 'Habilitar compresión gzip/brotli en servidor', effort: 'Bajo', impact: 'Alto' }
    ];

    issues.forEach(issue => {
      quickFixPatterns.forEach(qf => {
        if (qf.pattern.test(issue.title) || qf.pattern.test(issue.description)) {
          if (!quickWins.find(q => q.fix === qf.fix)) {
            quickWins.push(qf);
          }
        }
      });
    });

    return quickWins;
  }

  generateLongTermRecommendations(data) {
    const recommendations = [];
    const scores = this.calculateScores(data);

    if (scores.performance < 80) {
      recommendations.push({
        area: 'Rendimiento',
        recommendation: 'Implementar estrategia de Performance Budget',
        details: 'Definir límites máximos para tamaño de página, número de requests y tiempos de carga. Integrar en CI/CD.'
      });
    }

    if (scores.accessibility < 80) {
      recommendations.push({
        area: 'Accesibilidad',
        recommendation: 'Auditoría WCAG 2.1 AA completa',
        details: 'Contratar una auditoría profesional de accesibilidad e incluir pruebas con usuarios reales con discapacidades.'
      });
    }

    if (scores.seo < 80) {
      recommendations.push({
        area: 'SEO',
        recommendation: 'Estrategia SEO técnico integral',
        details: 'Implementar sitemap XML, robots.txt optimizado, datos estructurados en todas las páginas y monitoreo con Search Console.'
      });
    }

    recommendations.push({
      area: 'General',
      recommendation: 'Automatización de calidad',
      details: 'Integrar Lighthouse CI en el pipeline de deployment para prevenir regresiones de rendimiento y accesibilidad.'
    });

    return recommendations;
  }

  estimateImpact(data) {
    const scores = this.calculateScores(data);
    const currentScore = scores.overall;

    return {
      currentScore,
      potentialScore: Math.min(100, currentScore + 25),
      expectedImprovements: [
        currentScore < 70 ? 'Reducción significativa en tasa de rebote (-15-30%)' : null,
        scores.performance < 70 ? 'Mejora en tiempo de carga (-1-3 segundos)' : null,
        scores.seo < 70 ? 'Aumento en visibilidad orgánica (+10-25%)' : null,
        scores.accessibility < 70 ? 'Mayor alcance de audiencia y cumplimiento legal' : null,
        scores.responsive < 70 ? 'Mejor experiencia móvil y mayor conversión' : null
      ].filter(Boolean)
    };
  }

  /**
   * Generate a formatted text report
   */
  generateTextReport(analysis) {
    let report = '';
    report += '═══════════════════════════════════════════════════════\n';
    report += '  WEBSITE DETECTION AGENT - REPORTE DE ANÁLISIS\n';
    report += '═══════════════════════════════════════════════════════\n\n';
    report += `URL: ${analysis.url}\n`;
    report += `Fecha: ${analysis.timestamp}\n`;
    report += `Puntuación General: ${analysis.scores.overall}/100\n\n`;

    report += '── PUNTUACIONES POR CATEGORÍA ──\n';
    Object.entries(analysis.scores).forEach(([key, value]) => {
      if (key !== 'overall') {
        const bar = '█'.repeat(Math.round(value / 5)) + '░'.repeat(20 - Math.round(value / 5));
        report += `  ${key.padEnd(15)} ${bar} ${value}/100\n`;
      }
    });

    if (analysis.criticalIssues.length > 0) {
      report += '\n── PROBLEMAS CRÍTICOS ──\n';
      analysis.criticalIssues.forEach((issue, i) => {
        report += `\n  ${i + 1}. [${issue.category.toUpperCase()}] ${issue.title}\n`;
        report += `     Impacto: ${issue.impact}\n`;
        report += `     Prioridad: ${issue.fixPriority}\n`;
      });
    }

    if (analysis.quickWins.length > 0) {
      report += '\n── QUICK WINS (Mejoras rápidas) ──\n';
      analysis.quickWins.forEach((qw, i) => {
        report += `  ${i + 1}. ${qw.fix} [Esfuerzo: ${qw.effort} | Impacto: ${qw.impact}]\n`;
      });
    }

    if (analysis.improvementPlan.immediate.length > 0) {
      report += '\n── PLAN DE MEJORA: INMEDIATO ──\n';
      analysis.improvementPlan.immediate.forEach((item, i) => {
        report += `\n  ${i + 1}. ${item.title}\n`;
        item.steps.forEach(step => {
          report += `     → ${step}\n`;
        });
        report += `     Herramientas: ${item.tools.join(', ')}\n`;
      });
    }

    report += '\n── IMPACTO ESTIMADO ──\n';
    report += `  Puntuación actual: ${analysis.estimatedImpact.currentScore}/100\n`;
    report += `  Puntuación potencial: ${analysis.estimatedImpact.potentialScore}/100\n`;
    if (analysis.estimatedImpact.expectedImprovements.length > 0) {
      report += '  Mejoras esperadas:\n';
      analysis.estimatedImpact.expectedImprovements.forEach(imp => {
        report += `    • ${imp}\n`;
      });
    }

    report += '\n═══════════════════════════════════════════════════════\n';
    report += '  Generado por Website Detection Agent v1.0\n';
    report += '═══════════════════════════════════════════════════════\n';

    return report;
  }
}

// CLI usage
if (typeof process !== 'undefined' && process.argv && process.argv[2]) {
  const fs = require('fs');
  const filePath = process.argv[2];

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const agent = new WebsiteAnalysisAgent();
    const analysis = agent.analyze(data);
    const report = agent.generateTextReport(analysis);
    console.log(report);

    // Save detailed report
    const outputPath = filePath.replace('.json', '-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`\nReporte detallado guardado en: ${outputPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
if (typeof module !== 'undefined') {
  module.exports = WebsiteAnalysisAgent;
}
