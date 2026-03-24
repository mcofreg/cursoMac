/**
 * Website Detection Agent - Content Script
 * Se inyecta en cada página para detectar problemas en tiempo real.
 */

(function () {
  'use strict';

  const WebsiteDetectionAgent = {
    issues: [],
    metrics: {},
    startTime: performance.now(),

    init() {
      this.collectPerformanceMetrics();
      this.detectJSErrors();
      this.detectAccessibilityIssues();
      this.detectSEOIssues();
      this.detectNetworkIssues();
      this.detectSecurityIssues();
      this.detectResponsiveIssues();
      this.listenForMessages();
    },

    // ==========================================
    // 1. RENDIMIENTO - Core Web Vitals
    // ==========================================
    collectPerformanceMetrics() {
      const metrics = this.metrics;

      // Largest Contentful Paint (LCP)
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            metrics.lcp = lastEntry.startTime;
            if (metrics.lcp > 2500) {
              this.addIssue('performance', 'critical',
                `LCP alto: ${(metrics.lcp / 1000).toFixed(2)}s (objetivo: <2.5s)`,
                'El contenido principal tarda demasiado en renderizarse. Optimiza imágenes, usa lazy loading y prioriza recursos críticos.');
            } else if (metrics.lcp > 1800) {
              this.addIssue('performance', 'warning',
                `LCP moderado: ${(metrics.lcp / 1000).toFixed(2)}s`,
                'Considere optimizar el renderizado del contenido principal.');
            }
          });
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) { /* Observer not supported */ }

        // First Input Delay (FID) / Interaction to Next Paint (INP)
        try {
          const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
              metrics.fid = entry.processingStart - entry.startTime;
              if (metrics.fid > 100) {
                this.addIssue('performance', 'critical',
                  `FID alto: ${metrics.fid.toFixed(0)}ms (objetivo: <100ms)`,
                  'La página tarda en responder a la primera interacción. Reduce el JavaScript del hilo principal.');
              }
            });
          });
          fidObserver.observe({ type: 'first-input', buffered: true });
        } catch (e) { /* Observer not supported */ }

        // Cumulative Layout Shift (CLS)
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            metrics.cls = clsValue;
            if (clsValue > 0.25) {
              this.addIssue('performance', 'critical',
                `CLS alto: ${clsValue.toFixed(3)} (objetivo: <0.1)`,
                'Los elementos cambian de posición inesperadamente. Define dimensiones explícitas en imágenes y anuncios.');
            } else if (clsValue > 0.1) {
              this.addIssue('performance', 'warning',
                `CLS moderado: ${clsValue.toFixed(3)}`,
                'Hay cambios de layout menores. Revise que todas las imágenes tengan width/height.');
            }
          });
          clsObserver.observe({ type: 'layout-shift', buffered: true });
        } catch (e) { /* Observer not supported */ }
      }

      // Navigation Timing
      window.addEventListener('load', () => {
        setTimeout(() => {
          const timing = performance.getEntriesByType('navigation')[0];
          if (timing) {
            metrics.ttfb = timing.responseStart - timing.requestStart;
            metrics.domLoad = timing.domContentLoadedEventEnd - timing.startTime;
            metrics.fullLoad = timing.loadEventEnd - timing.startTime;
            metrics.dnsLookup = timing.domainLookupEnd - timing.domainLookupStart;
            metrics.tcpConnect = timing.connectEnd - timing.connectStart;

            if (metrics.ttfb > 600) {
              this.addIssue('performance', 'warning',
                `TTFB alto: ${metrics.ttfb.toFixed(0)}ms`,
                'El servidor tarda en responder. Considere usar CDN, optimizar backend o implementar caché.');
            }

            if (metrics.fullLoad > 5000) {
              this.addIssue('performance', 'critical',
                `Carga completa lenta: ${(metrics.fullLoad / 1000).toFixed(2)}s`,
                'La página tarda más de 5 segundos en cargar completamente.');
            }
          }

          // Resource analysis
          const resources = performance.getEntriesByType('resource');
          let totalSize = 0;
          let largeResources = [];

          resources.forEach(r => {
            totalSize += r.transferSize || 0;
            if (r.transferSize > 500000) {
              largeResources.push({
                name: r.name.split('/').pop().split('?')[0],
                size: (r.transferSize / 1024).toFixed(0),
                type: r.initiatorType
              });
            }
          });

          metrics.totalResources = resources.length;
          metrics.totalTransferSize = totalSize;

          if (largeResources.length > 0) {
            this.addIssue('performance', 'warning',
              `${largeResources.length} recurso(s) grande(s) detectado(s)`,
              `Recursos >500KB: ${largeResources.map(r => `${r.name} (${r.size}KB)`).join(', ')}`);
          }

          if (resources.length > 100) {
            this.addIssue('performance', 'warning',
              `Demasiadas peticiones HTTP: ${resources.length}`,
              'Combine archivos CSS/JS, use sprites para imágenes y elimine recursos innecesarios.');
          }
        }, 1000);
      });
    },

    // ==========================================
    // 2. ERRORES JAVASCRIPT
    // ==========================================
    detectJSErrors() {
      const agent = this;

      window.addEventListener('error', function (event) {
        agent.addIssue('javascript', 'critical',
          `Error JS: ${event.message}`,
          `Archivo: ${event.filename || 'desconocido'}, Línea: ${event.lineno}, Columna: ${event.colno}`);
      });

      window.addEventListener('unhandledrejection', function (event) {
        agent.addIssue('javascript', 'critical',
          `Promise rechazada sin manejar`,
          `Razón: ${event.reason}`);
      });

      // Detect deprecated APIs
      const deprecatedAPIs = [
        { obj: document, method: 'write', name: 'document.write()' },
      ];

      deprecatedAPIs.forEach(api => {
        if (api.obj && api.obj[api.method]) {
          const original = api.obj[api.method];
          api.obj[api.method] = function (...args) {
            agent.addIssue('javascript', 'warning',
              `API obsoleta detectada: ${api.name}`,
              'El uso de APIs obsoletas puede causar problemas de rendimiento y compatibilidad.');
            return original.apply(this, args);
          };
        }
      });

      // Check console errors count after load
      window.addEventListener('load', () => {
        setTimeout(() => {
          const entries = performance.getEntriesByType('resource');
          const failedResources = entries.filter(e => e.transferSize === 0 && e.decodedBodySize === 0);
          if (failedResources.length > 0) {
            agent.addIssue('javascript', 'warning',
              `${failedResources.length} recurso(s) posiblemente fallidos`,
              'Algunos recursos no se cargaron correctamente. Verifique las URLs de los recursos.');
          }
        }, 2000);
      });
    },

    // ==========================================
    // 3. ACCESIBILIDAD (WCAG)
    // ==========================================
    detectAccessibilityIssues() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          // Images without alt
          const imgsNoAlt = document.querySelectorAll('img:not([alt])');
          if (imgsNoAlt.length > 0) {
            this.addIssue('accessibility', 'critical',
              `${imgsNoAlt.length} imagen(es) sin atributo alt`,
              'Todas las imágenes deben tener texto alternativo para lectores de pantalla.');
            imgsNoAlt.forEach(img => img.classList.add('wda-issue-highlight'));
          }

          // Empty alt on non-decorative images
          const imgsEmptyAlt = document.querySelectorAll('img[alt=""]');
          if (imgsEmptyAlt.length > 3) {
            this.addIssue('accessibility', 'warning',
              `${imgsEmptyAlt.length} imágenes con alt vacío`,
              'Verifique que las imágenes con alt="" son realmente decorativas.');
          }

          // Form inputs without labels
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
          let inputsWithoutLabel = 0;
          inputs.forEach(input => {
            const id = input.id;
            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
            const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            const wrappedInLabel = input.closest('label');
            if (!hasLabel && !hasAriaLabel && !wrappedInLabel) {
              inputsWithoutLabel++;
              input.classList.add('wda-warning-highlight');
            }
          });
          if (inputsWithoutLabel > 0) {
            this.addIssue('accessibility', 'critical',
              `${inputsWithoutLabel} campo(s) sin etiqueta asociada`,
              'Los campos de formulario deben tener labels o aria-labels para accesibilidad.');
          }

          // Color contrast (basic check)
          this.checkColorContrast();

          // Heading hierarchy
          const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          let prevLevel = 0;
          let hierarchyIssues = 0;
          headings.forEach(h => {
            const level = parseInt(h.tagName[1]);
            if (level > prevLevel + 1 && prevLevel > 0) {
              hierarchyIssues++;
            }
            prevLevel = level;
          });
          if (hierarchyIssues > 0) {
            this.addIssue('accessibility', 'warning',
              `Jerarquía de encabezados incorrecta (${hierarchyIssues} salto(s))`,
              'Los encabezados deben seguir un orden secuencial (h1 > h2 > h3) sin saltos.');
          }

          // Missing language attribute
          if (!document.documentElement.lang) {
            this.addIssue('accessibility', 'warning',
              'Atributo lang ausente en <html>',
              'Agregue lang="es" (o el idioma correspondiente) al elemento <html>.');
          }

          // Links without text
          const emptyLinks = document.querySelectorAll('a:not([aria-label])');
          let linksWithoutText = 0;
          emptyLinks.forEach(a => {
            if (!a.textContent.trim() && !a.querySelector('img[alt]')) {
              linksWithoutText++;
              a.classList.add('wda-issue-highlight');
            }
          });
          if (linksWithoutText > 0) {
            this.addIssue('accessibility', 'critical',
              `${linksWithoutText} enlace(s) sin texto descriptivo`,
              'Los enlaces deben tener texto visible o aria-label para describir su destino.');
          }

          // Tab index issues
          const negativeTabs = document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])');
          if (negativeTabs.length > 0) {
            this.addIssue('accessibility', 'warning',
              `${negativeTabs.length} elemento(s) con tabindex positivo`,
              'Evite tabindex positivos. Use tabindex="0" para agregar elementos al flujo de tabulación.');
          }
        }, 1500);
      });
    },

    checkColorContrast() {
      const textElements = document.querySelectorAll('p, span, a, li, h1, h2, h3, h4, h5, h6, td, th, label');
      let lowContrastCount = 0;

      const sampleSize = Math.min(textElements.length, 50);
      for (let i = 0; i < sampleSize; i++) {
        const el = textElements[Math.floor(i * textElements.length / sampleSize)];
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = this.getEffectiveBackgroundColor(el);

        if (color && bgColor) {
          const ratio = this.getContrastRatio(
            this.parseColor(color),
            this.parseColor(bgColor)
          );
          if (ratio < 4.5 && ratio > 0) {
            lowContrastCount++;
          }
        }
      }

      if (lowContrastCount > 5) {
        this.addIssue('accessibility', 'warning',
          `${lowContrastCount} elementos con posible contraste bajo`,
          'El ratio de contraste mínimo recomendado es 4.5:1 para texto normal (WCAG AA).');
      }
    },

    getEffectiveBackgroundColor(el) {
      let current = el;
      while (current && current !== document.body) {
        const bg = window.getComputedStyle(current).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          return bg;
        }
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    },

    parseColor(colorStr) {
      const match = colorStr.match(/\d+/g);
      return match ? match.map(Number) : null;
    },

    getContrastRatio(rgb1, rgb2) {
      if (!rgb1 || !rgb2) return 0;
      const l1 = this.relativeLuminance(rgb1);
      const l2 = this.relativeLuminance(rgb2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    },

    relativeLuminance(rgb) {
      const [r, g, b] = rgb.map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },

    // ==========================================
    // 4. SEO
    // ==========================================
    detectSEOIssues() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          // Title tag
          const title = document.title;
          if (!title) {
            this.addIssue('seo', 'critical', 'Sin etiqueta <title>', 'Cada página debe tener un título único y descriptivo.');
          } else if (title.length < 10) {
            this.addIssue('seo', 'warning', `Título muy corto: "${title}"`, 'El título debería tener entre 30-60 caracteres.');
          } else if (title.length > 60) {
            this.addIssue('seo', 'warning', `Título muy largo (${title.length} chars)`, 'Los títulos >60 caracteres se truncan en resultados de búsqueda.');
          }

          // Meta description
          const metaDesc = document.querySelector('meta[name="description"]');
          if (!metaDesc) {
            this.addIssue('seo', 'critical', 'Sin meta description', 'Agregue una meta description de 120-155 caracteres.');
          } else if (metaDesc.content.length < 50) {
            this.addIssue('seo', 'warning', 'Meta description muy corta', 'La meta description debería tener entre 120-155 caracteres.');
          }

          // H1 tags
          const h1s = document.querySelectorAll('h1');
          if (h1s.length === 0) {
            this.addIssue('seo', 'critical', 'Sin etiqueta H1', 'Cada página debe tener exactamente un H1.');
          } else if (h1s.length > 1) {
            this.addIssue('seo', 'warning', `Múltiples H1 detectados (${h1s.length})`, 'Se recomienda usar solo un H1 por página.');
          }

          // Canonical URL
          if (!document.querySelector('link[rel="canonical"]')) {
            this.addIssue('seo', 'warning', 'Sin URL canónica', 'Agregue <link rel="canonical"> para evitar contenido duplicado.');
          }

          // Open Graph tags
          const ogTitle = document.querySelector('meta[property="og:title"]');
          const ogDesc = document.querySelector('meta[property="og:description"]');
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (!ogTitle || !ogDesc || !ogImage) {
            this.addIssue('seo', 'info',
              'Open Graph incompleto',
              'Faltan meta tags de Open Graph para compartir en redes sociales.');
          }

          // Viewport meta
          if (!document.querySelector('meta[name="viewport"]')) {
            this.addIssue('seo', 'critical', 'Sin meta viewport', 'Necesario para la indexación mobile-first de Google.');
          }

          // Robots meta
          const robotsMeta = document.querySelector('meta[name="robots"]');
          if (robotsMeta && robotsMeta.content.includes('noindex')) {
            this.addIssue('seo', 'info', 'Página con noindex', 'Esta página no será indexada por motores de búsqueda.');
          }

          // Structured data
          const jsonLD = document.querySelectorAll('script[type="application/ld+json"]');
          if (jsonLD.length === 0) {
            this.addIssue('seo', 'info', 'Sin datos estructurados', 'Considere agregar JSON-LD para rich snippets en resultados de búsqueda.');
          }
        }, 1000);
      });
    },

    // ==========================================
    // 5. RED / NETWORK
    // ==========================================
    detectNetworkIssues() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const resources = performance.getEntriesByType('resource');

          // Uncompressed resources
          let uncompressed = 0;
          resources.forEach(r => {
            if (r.transferSize > 0 && r.decodedBodySize > 0) {
              const ratio = r.transferSize / r.decodedBodySize;
              if (ratio > 0.9 && r.decodedBodySize > 10000) {
                uncompressed++;
              }
            }
          });
          if (uncompressed > 3) {
            this.addIssue('network', 'warning',
              `${uncompressed} recurso(s) sin compresión`,
              'Habilite gzip/brotli en el servidor para reducir tamaños de transferencia.');
          }

          // Render-blocking resources
          const blockingCSS = document.querySelectorAll('link[rel="stylesheet"]:not([media="print"]):not([disabled])');
          const blockingJS = document.querySelectorAll('script:not([async]):not([defer]):not([type="module"])');
          const headBlockingJS = Array.from(blockingJS).filter(s => s.closest('head') && s.src);

          if (headBlockingJS.length > 2) {
            this.addIssue('network', 'warning',
              `${headBlockingJS.length} scripts bloqueantes en <head>`,
              'Mueva scripts al final del body o use async/defer para mejorar el tiempo de carga.');
          }

          // Mixed content
          if (location.protocol === 'https:') {
            const httpResources = resources.filter(r => r.name.startsWith('http://'));
            if (httpResources.length > 0) {
              this.addIssue('security', 'critical',
                `Contenido mixto: ${httpResources.length} recurso(s) HTTP`,
                'Recursos cargados por HTTP en página HTTPS. Esto puede bloquear contenido o mostrar advertencias.');
            }
          }

          // Slow resources
          const slowResources = resources.filter(r => r.duration > 3000);
          if (slowResources.length > 0) {
            this.addIssue('network', 'warning',
              `${slowResources.length} recurso(s) lentos (>3s)`,
              `Recursos lentos: ${slowResources.map(r => r.name.split('/').pop().split('?')[0]).slice(0, 5).join(', ')}`);
          }

          // Third-party resources
          const thirdParty = resources.filter(r => {
            try {
              return new URL(r.name).hostname !== location.hostname;
            } catch { return false; }
          });
          if (thirdParty.length > 20) {
            this.addIssue('network', 'info',
              `${thirdParty.length} recursos de terceros`,
              'Muchos recursos externos pueden afectar el rendimiento. Considere usar dns-prefetch o preconnect.');
          }
        }, 2000);
      });
    },

    // ==========================================
    // 6. SEGURIDAD
    // ==========================================
    detectSecurityIssues() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          // HTTPS check
          if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            this.addIssue('security', 'critical',
              'Sitio sin HTTPS',
              'El sitio no usa HTTPS. Esto es crítico para la seguridad y el SEO.');
          }

          // Inline scripts (potential XSS vectors)
          const inlineScripts = document.querySelectorAll('script:not([src])');
          const onHandlers = document.querySelectorAll('[onclick], [onload], [onerror], [onmouseover]');
          if (onHandlers.length > 5) {
            this.addIssue('security', 'info',
              `${onHandlers.length} manejadores de eventos inline`,
              'Los event handlers inline pueden ser vectores de XSS. Prefiera addEventListener.');
          }

          // Password fields in HTTP forms
          if (location.protocol === 'http:') {
            const passwordFields = document.querySelectorAll('input[type="password"]');
            if (passwordFields.length > 0) {
              this.addIssue('security', 'critical',
                'Formulario de contraseña sin HTTPS',
                'Las contraseñas se envían en texto plano. Migre inmediatamente a HTTPS.');
            }
          }

          // Forms without action or with HTTP action
          const forms = document.querySelectorAll('form[action^="http://"]');
          if (forms.length > 0 && location.protocol === 'https:') {
            this.addIssue('security', 'critical',
              `${forms.length} formulario(s) enviando a HTTP`,
              'Los formularios deben enviar datos sobre HTTPS.');
          }

          // External links without rel="noopener"
          const externalLinks = document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])');
          if (externalLinks.length > 0) {
            this.addIssue('security', 'warning',
              `${externalLinks.length} enlace(s) sin rel="noopener"`,
              'Los enlaces con target="_blank" deben incluir rel="noopener noreferrer" por seguridad.');
          }
        }, 1000);
      });
    },

    // ==========================================
    // 7. DISEÑO RESPONSIVO
    // ==========================================
    detectResponsiveIssues() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          // Viewport overflow
          const docWidth = document.documentElement.scrollWidth;
          const viewWidth = window.innerWidth;
          if (docWidth > viewWidth + 5) {
            this.addIssue('responsive', 'critical',
              `Desbordamiento horizontal: ${docWidth - viewWidth}px`,
              'El contenido se desborda horizontalmente. Revise elementos con ancho fijo o sin overflow:hidden.');
          }

          // Fixed width elements
          const allElements = document.querySelectorAll('*');
          let fixedWidthCount = 0;
          const sampleSize = Math.min(allElements.length, 200);
          for (let i = 0; i < sampleSize; i++) {
            const el = allElements[Math.floor(i * allElements.length / sampleSize)];
            const style = window.getComputedStyle(el);
            const width = parseInt(style.width);
            if (width > viewWidth && style.position === 'static') {
              fixedWidthCount++;
            }
          }
          if (fixedWidthCount > 0) {
            this.addIssue('responsive', 'warning',
              `${fixedWidthCount} elemento(s) más anchos que el viewport`,
              'Use max-width: 100% y unidades relativas en lugar de anchos fijos.');
          }

          // Small touch targets
          const clickables = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
          let smallTargets = 0;
          clickables.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
              smallTargets++;
            }
          });
          if (smallTargets > 5) {
            this.addIssue('responsive', 'warning',
              `${smallTargets} elementos táctiles pequeños (<44px)`,
              'Los objetivos táctiles deben tener al menos 44x44px para buena usabilidad móvil.');
          }

          // Font size too small
          const textEls = document.querySelectorAll('p, span, a, li, td, label');
          let smallFontCount = 0;
          const textSample = Math.min(textEls.length, 100);
          for (let i = 0; i < textSample; i++) {
            const el = textEls[Math.floor(i * textEls.length / textSample)];
            const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
            if (fontSize < 12 && el.textContent.trim().length > 0) {
              smallFontCount++;
            }
          }
          if (smallFontCount > 5) {
            this.addIssue('responsive', 'warning',
              `${smallFontCount} elementos con fuente <12px`,
              'Use fuentes de al menos 16px para buena legibilidad en móviles.');
          }

          // Images without responsive attributes
          const images = document.querySelectorAll('img:not([srcset]):not([sizes])');
          const nonSVGImages = Array.from(images).filter(img => !img.src.endsWith('.svg'));
          if (nonSVGImages.length > 5) {
            this.addIssue('responsive', 'info',
              `${nonSVGImages.length} imágenes sin srcset/sizes`,
              'Use srcset y sizes para servir imágenes optimizadas según el dispositivo.');
          }
        }, 1500);
      });
    },

    // ==========================================
    // UTILIDADES
    // ==========================================
    addIssue(category, severity, title, description) {
      const issue = {
        id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category,
        severity,
        title,
        description,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
      this.issues.push(issue);

      // Notify background script
      try {
        chrome.runtime.sendMessage({ type: 'NEW_ISSUE', issue });
      } catch (e) { /* Extension context invalidated */ }
    },

    getAllData() {
      return {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        issues: this.issues,
        metrics: this.metrics,
        pageInfo: {
          doctype: document.doctype ? document.doctype.name : 'none',
          charset: document.characterSet,
          language: document.documentElement.lang || 'not set',
          totalElements: document.querySelectorAll('*').length,
          totalImages: document.images.length,
          totalLinks: document.links.length,
          totalForms: document.forms.length,
          totalScripts: document.scripts.length,
          totalStylesheets: document.styleSheets.length
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight
        },
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt
        } : null
      };
    },

    listenForMessages() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_SCAN_DATA') {
          sendResponse(this.getAllData());
        } else if (message.type === 'RUN_SCAN') {
          this.issues = [];
          this.metrics = {};
          this.collectPerformanceMetrics();
          this.detectAccessibilityIssues();
          this.detectSEOIssues();
          this.detectNetworkIssues();
          this.detectSecurityIssues();
          this.detectResponsiveIssues();
          setTimeout(() => {
            sendResponse(this.getAllData());
          }, 3000);
          return true; // Keep message channel open for async response
        } else if (message.type === 'HIGHLIGHT_ISSUES') {
          this.highlightIssuesOnPage();
          sendResponse({ success: true });
        }
        return true;
      });
    },

    highlightIssuesOnPage() {
      // Visual feedback on the page for detected issues
      document.querySelectorAll('.wda-issue-highlight, .wda-warning-highlight').forEach(el => {
        el.classList.remove('wda-issue-highlight', 'wda-warning-highlight');
      });

      document.querySelectorAll('img:not([alt])').forEach(img => {
        img.classList.add('wda-issue-highlight');
        img.setAttribute('data-wda-issue', 'Sin alt text');
      });

      document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])').forEach(a => {
        a.classList.add('wda-warning-highlight');
      });
    }
  };

  // Initialize agent
  WebsiteDetectionAgent.init();
})();
