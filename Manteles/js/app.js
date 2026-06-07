/* =========================================================
   Telar & Mesa · Configurador de manteles a medida
   Prototipo interactivo (sin dependencias externas)
   ========================================================= */

/* ---------- Catálogo de diseños (patrones SVG) ----------
   Cada diseño es una función que recibe el color base y
   devuelve un data-URI de SVG, usable como background-image. */
const svg = (inner, bg) =>
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='${bg}'/>${inner}</svg>`
    )}")`;

/* Pequeña flor de 4 pétalos con centro, reutilizada en el patrón floral */
const flor = (x, y) =>
    `<g transform='translate(${x} ${y})'>
        <g fill='rgba(255,255,255,.55)'>
            <ellipse cx='0' cy='-6' rx='3' ry='5'/><ellipse cx='0' cy='6' rx='3' ry='5'/>
            <ellipse cx='-6' cy='0' rx='5' ry='3'/><ellipse cx='6' cy='0' rx='5' ry='3'/>
        </g>
        <circle r='3' fill='rgba(0,0,0,.16)'/>
    </g>`;
/* Ramita botánica (estilo olivo del logo) */
const ramita = (x, y) =>
    `<g transform='translate(${x} ${y})'>
        <path d='M2 28 Q10 14 16 2' fill='none' stroke='rgba(255,255,255,.5)' stroke-width='1.6'/>
        <g fill='rgba(255,255,255,.42)'>
            <ellipse cx='5' cy='22' rx='4.5' ry='2.1' transform='rotate(-40 5 22)'/>
            <ellipse cx='12' cy='21' rx='4.5' ry='2.1' transform='rotate(40 12 21)'/>
            <ellipse cx='8' cy='13' rx='4.3' ry='2' transform='rotate(-40 8 13)'/>
            <ellipse cx='15' cy='12' rx='4.3' ry='2' transform='rotate(40 15 12)'/>
            <ellipse cx='13' cy='5' rx='3.8' ry='1.8' transform='rotate(-35 13 5)'/>
        </g>
    </g>`;

const DESIGNS = [
    {
        id: "liso", name: "Liso",
        pattern: (c) => svg("", c)
    },
    {
        id: "cuadros", name: "Vichy",
        /* gingham: dos bandas translúcidas superpuestas → 3 tonos */
        pattern: (c) => svg(
            `<g fill='rgba(255,255,255,.20)'><rect width='40' height='80'/><rect width='80' height='40'/></g>`, c)
    },
    {
        id: "rayas", name: "Rayas",
        /* ticking stripe: bandas anchas claras + pinstripe fina */
        pattern: (c) => svg(
            `<g fill='rgba(255,255,255,.20)'><rect x='12' width='11' height='80'/><rect x='52' width='11' height='80'/></g>
             <rect x='34' width='2' height='80' fill='rgba(0,0,0,.10)'/>`, c)
    },
    {
        id: "lunares", name: "Lunares",
        /* polka con sutil sombra para dar relieve */
        pattern: (c) => svg(
            `<g><circle cx='20' cy='21' r='6.5' fill='rgba(0,0,0,.07)'/><circle cx='20' cy='20' r='6.5' fill='rgba(255,255,255,.6)'/>
                <circle cx='60' cy='61' r='6.5' fill='rgba(0,0,0,.07)'/><circle cx='60' cy='60' r='6.5' fill='rgba(255,255,255,.6)'/></g>`, c)
    },
    {
        id: "flores", name: "Floral",
        pattern: (c) => svg(flor(20, 20) + flor(60, 60), c)
    },
    {
        id: "rombos", name: "Argyle",
        /* rombo relleno + líneas diagonales punteadas */
        pattern: (c) => svg(
            `<path d='M40 0L80 40L40 80L0 40Z' fill='rgba(255,255,255,.14)'/>
             <path d='M40 0L80 40M40 0L0 40M40 80L80 40M40 80L0 40' stroke='rgba(0,0,0,.10)' stroke-width='1.5' fill='none'/>
             <path d='M0 0L80 80M80 0L0 80' stroke='rgba(255,255,255,.20)' stroke-width='1' stroke-dasharray='3 4'/>`, c)
    },
    {
        id: "espiga", name: "Espiga",
        /* herringbone a dos tonos para dar volumen */
        pattern: (c) => svg(
            `<g fill='none' stroke-width='3' stroke-linecap='square'>
                <path d='M0 20L20 0L40 20L60 0L80 20' stroke='rgba(255,255,255,.30)'/>
                <path d='M0 60L20 40L40 60L60 40L80 60' stroke='rgba(255,255,255,.30)'/>
                <path d='M0 40L20 20L40 40L60 20L80 40' stroke='rgba(0,0,0,.08)'/>
                <path d='M0 80L20 60L40 80L60 60L80 80' stroke='rgba(0,0,0,.08)'/>
             </g>`, c)
    },
    {
        id: "botanico", name: "Botánico",
        pattern: (c) => svg(ramita(6, 8) + ramita(46, 48), c)
    },
    {
        id: "geometrico", name: "Nórdico",
        /* cruces escandinavas + puntos */
        pattern: (c) => svg(
            `<g stroke='rgba(255,255,255,.4)' stroke-width='2.5' stroke-linecap='round'>
                <path d='M20 12V28M12 20H28'/><path d='M60 52V68M52 60H68'/></g>
             <g fill='rgba(0,0,0,.10)'><circle cx='60' cy='20' r='3'/><circle cx='20' cy='60' r='3'/></g>`, c)
    }
];

/* ---------- Paleta de colores: tonos vivos + base de marca ---------- */
const COLORS = [
    { id: "terracota", name: "Terracota", hex: "#e06a3b" },
    { id: "mostaza", name: "Mostaza", hex: "#eab026" },
    { id: "oliva", name: "Verde oliva", hex: "#8aa32f" },
    { id: "esmeralda", name: "Esmeralda", hex: "#1f9e6b" },
    { id: "teal", name: "Turquesa", hex: "#1aa3a3" },
    { id: "royal", name: "Azul rey", hex: "#2f5fd0" },
    { id: "marino", name: "Azul marino", hex: "#2b3a52" },
    { id: "vino", name: "Vino", hex: "#a32844" },
    { id: "coral", name: "Coral", hex: "#f0607e" },
    { id: "uva", name: "Berenjena", hex: "#7a3fb0" },
    { id: "arena", name: "Arena", hex: "#e2c79b" },
    { id: "lino", name: "Lino", hex: "#f1e8d6" }
];

/* ---------- Tipos de tela (afectan precio) ---------- */
const FABRICS = [
    { id: "algodon", name: "Algodón", desc: "Suave y lavable", mult: 1.0 },
    { id: "lino", name: "Lino", desc: "Elegante y fresco", mult: 1.6 },
    { id: "resinado", name: "Antimanchas", desc: "Repele líquidos", mult: 1.9 }
];

const BASE_PRICE_PER_M2 = 14000; // CLP referencial

/* ---------- Estado actual ---------- */
const state = {
    design: DESIGNS[1],
    color: COLORS[0],
    fabric: FABRICS[0],
    largo: 180,
    ancho: 120
};

/* ---------- Utilidades ---------- */
const $ = (s) => document.querySelector(s);
const fmt = (n) => "$" + Math.round(n).toLocaleString("es-CL");
const clothBg = () => state.design.pattern(state.color.hex);

/* Referencias del DOM que se actualizan en vivo (se cachean en init) */
const EL_IDS = ["previewCloth", "largoVal", "anchoVal", "sizeLabel",
                "sumDesign", "sumColor", "sumSize", "sumFabric", "sumArea", "price"];
const el = {};

/* =========================================================
   Render de controles
   ========================================================= */
/* Maneja la selección de un grupo de botones (mueve la clase .active
   y avisa con el id elegido). Delegación + sin re-escanear todo el grupo. */
function bindPicker(wrap, cssClass, onPick) {
    wrap.addEventListener("click", (e) => {
        const btn = e.target.closest("." + cssClass);
        if (!btn || !wrap.contains(btn)) return;
        wrap.querySelector("." + cssClass + ".active")?.classList.remove("active");
        btn.classList.add("active");
        onPick(btn.dataset.id);
    });
}

function renderDesigns() {
    const wrap = $("#designs");
    wrap.innerHTML = DESIGNS.map(d => `
        <button class="design-swatch ${d.id === state.design.id ? "active" : ""}" data-id="${d.id}" title="${d.name}">
            <span class="sw-thumb" style="background-image:${d.pattern(COLORS[0].hex)}"></span>
            <span class="sw-name">${d.name}</span>
        </button>`).join("");
    bindPicker(wrap, "design-swatch", id => { state.design = DESIGNS.find(d => d.id === id); update(); });
}

function renderColors() {
    const wrap = $("#colors");
    wrap.innerHTML = COLORS.map(c => `
        <button class="color-dot ${c.id === state.color.id ? "active" : ""}" data-id="${c.id}"
                style="background:${c.hex}" title="${c.name}"></button>`).join("");
    bindPicker(wrap, "color-dot", id => { state.color = COLORS.find(c => c.id === id); update(); });
}

function renderFabrics() {
    const wrap = $("#fabrics");
    wrap.innerHTML = FABRICS.map(f => `
        <button class="fabric-opt ${f.id === state.fabric.id ? "active" : ""}" data-id="${f.id}">
            <b>${f.name}</b><small>${f.desc}</small>
        </button>`).join("");
    bindPicker(wrap, "fabric-opt", id => { state.fabric = FABRICS.find(f => f.id === id); update(); });
}

/* ---------- Medidas (sliders + presets) ---------- */
function bindMeasures() {
    const largo = $("#largo"), ancho = $("#ancho");
    largo.addEventListener("input", () => { state.largo = +largo.value; update(); });
    ancho.addEventListener("input", () => { state.ancho = +ancho.value; update(); });
    document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            state.largo = +chip.dataset.l;
            state.ancho = +chip.dataset.a;
            largo.value = state.largo;
            ancho.value = state.ancho;
            update();
        });
    });
}

/* =========================================================
   Actualización de vista previa, resumen y precio
   ========================================================= */
function update() {
    const bg = clothBg();
    const size = `${state.largo} × ${state.ancho} cm`;

    // Mantel de la vista previa (background-size va en el CSS)
    el.previewCloth.style.backgroundImage = bg;

    // Vista previa: escalada proporcional dentro de la "mesa"
    const maxW = 320, maxH = 220;
    const scale = Math.min(maxW / state.largo, maxH / state.ancho);
    el.previewCloth.style.width = (state.largo * scale) + "px";
    el.previewCloth.style.height = (state.ancho * scale) + "px";

    // Etiquetas
    el.largoVal.textContent = state.largo;
    el.anchoVal.textContent = state.ancho;
    el.sizeLabel.textContent = size;

    // Resumen
    const area = (state.largo * state.ancho) / 10000; // m²
    el.sumDesign.textContent = state.design.name;
    el.sumColor.textContent = state.color.name;
    el.sumSize.textContent = size;
    el.sumFabric.textContent = state.fabric.name;
    el.sumArea.textContent = area.toFixed(2) + " m²";

    // Precio
    const price = area * BASE_PRICE_PER_M2 * state.fabric.mult;
    el.price.textContent = fmt(price);
}

/* =========================================================
   Contenido: beneficios, cuidado, decoración, accesorios
   ========================================================= */
const BENEFITS = [
    { ico: "✂️", t: "100% a medida", d: "Las dimensiones exactas de tu mesa" },
    { ico: "🧵", t: "Telas premium", d: "Algodón, lino y antimanchas" },
    { ico: "🚚", t: "Envío a todo Chile", d: "Despacho en 5 a 7 días hábiles" },
    { ico: "💚", t: "Hecho a mano", d: "Confección local y responsable" }
];

const CARE_TIPS = [
    { ico: "🌡️", t: "Lava en frío", d: "Usa agua fría o tibia (máx. 30°C) para conservar colores e impedir que el género encoja." },
    { ico: "🧺", t: "Ciclo suave", d: "Programa delicado y bolsa de lavado para los manteles de lino o con bordados." },
    { ico: "☀️", t: "Seca a la sombra", d: "Evita el sol directo prolongado: previene la decoloración del estampado." },
    { ico: "🔥", t: "Plancha húmedo", d: "Plancha aún levemente húmedo, del revés, para un acabado impecable sin brillos." },
    { ico: "🍷", t: "Mancha fresca", d: "Actúa rápido: absorbe sin frotar y aplica agua con jabón neutro antes de lavar." },
    { ico: "📦", t: "Guarda enrollado", d: "Enróllalo en vez de doblarlo para evitar marcas permanentes de pliegue." }
];

const DECO_IDEAS = [
    { img: "img/fotos/deco-romantica.jpg", t: "Cena romántica", d: "Mantel claro impecable, copas, una flor y luz tenue para una noche especial.", tags: ["Íntimo", "Elegante", "Pareja"] },
    { img: "img/fotos/deco-aire.jpg", t: "Almuerzo al aire libre", d: "Mesa de madera vestida, platos compartidos y vino blanco para un día soleado.", tags: ["Fresco", "Brunch", "Jardín"] },
    { img: "img/fotos/deco-familiar.jpg", t: "Comida familiar", d: "Un buen mantel resiste el ajetreo de una mesa llena: práctico y lindo.", tags: ["Familiar", "Abundante", "Día a día"] },
    { img: "img/fotos/deco-brunch.jpg", t: "Desayuno de fin de semana", d: "Colores vivos y mucha fruta sobre un mantel alegre para empezar el día.", tags: ["Colorido", "Brunch", "Luminoso"] },
    { img: "img/fotos/deco-fiesta.jpg", t: "Celebración en casa", d: "Tonos festivos, vajilla con estampado y un dulce protagonista al centro.", tags: ["Divertido", "Cumpleaños", "Color"] },
    { img: "img/fotos/deco-terraza.jpg", t: "Eventos y terraza", d: "Manteles blancos y vista abierta: ideal para celebraciones y exteriores.", tags: ["Eventos", "Exterior", "Elegante"] }
];

const ACCESSORIES = [
    { ico: "🧻", t: "Servilletas de tela", d: "Juego de 6 a tono con tu mantel.", price: 12990 },
    { ico: "🪡", t: "Camino de mesa", d: "Contraste perfecto para el centro.", price: 9990 },
    { ico: "🍽️", t: "Individuales", d: "Set de 4 que combinan con el diseño.", price: 11990 },
    { ico: "🕯️", t: "Portavelas", d: "Cerámica artesanal en tonos cálidos.", price: 7990 },
    { ico: "🌸", t: "Florero de mesa", d: "Pieza central minimalista.", price: 14990 },
    { ico: "🧷", t: "Argollas servilleteras", d: "Detalle dorado o natural.", price: 6990 }
];

/* ---------- Estadísticas (banda de cifras) ---------- */
const STATS = [
    { n: "+500", l: "mesas vestidas" },
    { n: "4,9★", l: "valoración promedio" },
    { n: "12", l: "diseños exclusivos" },
    { n: "100%", l: "hecho a medida" }
];

/* ---------- Catálogo destacado (combinaciones diseño + color) ---------- */
const PRODUCTS = [
    { design: "cuadros",    color: "terracota", name: "Mantel Vichy",     sub: "Terracota · 180×120", price: 30240 },
    { design: "botanico",   color: "esmeralda", name: "Mantel Botánico",  sub: "Esmeralda · 240×140", price: 47040 },
    { design: "rombos",     color: "royal",     name: "Mantel Argyle",    sub: "Azul rey · 180×120",  price: 30240 },
    { design: "lunares",    color: "coral",     name: "Mantel Lunares",   sub: "Coral · 150×150",     price: 31500 },
    { design: "rayas",      color: "marino",    name: "Mantel Rayas",     sub: "Azul marino · 200×140", price: 39200 },
    { design: "flores",     color: "uva",       name: "Mantel Floral",    sub: "Berenjena · 180×120", price: 30240 },
    { design: "espiga",     color: "teal",      name: "Mantel Espiga",    sub: "Turquesa · 240×140",  price: 47040 },
    { design: "geometrico", color: "mostaza",   name: "Mantel Nórdico",   sub: "Mostaza · 180×120",   price: 30240 }
];

/* ---------- Opiniones (contenido de muestra para la demo) ---------- */
const REVIEWS = [
    { ini: "CM", name: "Carolina M.", city: "Providencia", text: "Pedí un mantel para mi mesa irregular y calzó perfecto. La tela es preciosa y el color tal cual lo vi en pantalla." },
    { ini: "JR", name: "Javier R.", city: "Concepción", text: "El configurador es entretenido y rápido. Llegó antes de lo prometido y la terminación a mano se nota." },
    { ini: "PD", name: "Paula D.", city: "La Serena", text: "Compré el antimanchas para la mesa de los niños. Funciona increíble y combiné con las servilletas." }
];

/* ---------- Preguntas frecuentes ---------- */
const FAQS = [
    { q: "¿Cómo sé qué medidas pedir?", a: "Mide el largo y ancho de tu mesa y suma la caída que prefieras a cada lado (15–30 cm es lo habitual). El configurador te muestra el resultado en tiempo real." },
    { q: "¿Cuánto demora la confección y el envío?", a: "Cada mantel se confecciona a pedido. El tiempo estimado es de 5 a 7 días hábiles más el despacho a tu ciudad." },
    { q: "¿Qué telas puedo elegir?", a: "Algodón (suave y lavable), lino (elegante y fresco) y una tela antimanchas que repele líquidos, ideal para el día a día." },
    { q: "¿Puedo lavar el mantel en casa?", a: "Sí. Recomendamos lavado en frío y plancha del revés. En la sección de Cuidado encontrarás todos los tips." },
    { q: "¿Hacen medidas y formas especiales?", a: "Sí, trabajamos medidas a pedido. Para mesas redondas u ovaladas escríbenos y lo cotizamos a tu necesidad." }
];

function renderContent() {
    $("#benefits").innerHTML = BENEFITS.map(x => `
        <div class="benefit">
            <span class="benefit__ico">${x.ico}</span>
            <div><strong>${x.t}</strong><small>${x.d}</small></div>
        </div>`).join("");

    $("#stats").innerHTML = STATS.map(x => `
        <div class="stat"><span class="stat__n">${x.n}</span><span class="stat__l">${x.l}</span></div>`).join("");

    $("#products").innerHTML = PRODUCTS.map(p => {
        const d = DESIGNS.find(x => x.id === p.design);
        const c = COLORS.find(x => x.id === p.color);
        return `
        <article class="product-card">
            <div class="product-thumb" style="background-image:${d.pattern(c.hex)};background-size:64px"></div>
            <div class="product-body">
                <div class="product-rating">★ 4,9</div>
                <h4>${p.name}</h4>
                <p>${p.sub}</p>
                <div class="product-foot">
                    <span class="product-price">${fmt(p.price)}</span>
                    <a class="btn btn--primary btn--sm" href="#configurador">Personalizar</a>
                </div>
            </div>
        </article>`;
    }).join("");

    $("#careTips").innerHTML = CARE_TIPS.map(x => `
        <article class="tip-card">
            <div class="tip-ico">${x.ico}</div>
            <h4>${x.t}</h4>
            <p>${x.d}</p>
        </article>`).join("");

    $("#decoIdeas").innerHTML = DECO_IDEAS.map(x => `
        <article class="deco-card">
            <div class="deco-img"><img src="${x.img}" alt="${x.t}" loading="lazy"></div>
            <div class="deco-body">
                <h4>${x.t}</h4>
                <p>${x.d}</p>
                <div class="deco-tags">${x.tags.map(t => `<span>${t}</span>`).join("")}</div>
            </div>
        </article>`).join("");

    $("#accessories").innerHTML = ACCESSORIES.map(x => `
        <article class="acc-card">
            <div class="acc-ico">${x.ico}</div>
            <h4>${x.t}</h4>
            <p>${x.d}</p>
            <span class="acc-price">${fmt(x.price)}</span>
            <button class="btn btn--primary btn--block acc-add" data-name="${x.t}">Agregar</button>
        </article>`).join("");

    document.querySelectorAll(".acc-add").forEach(b =>
        b.addEventListener("click", () => toast(`✓ ${b.dataset.name} agregado`)));

    $("#reviews").innerHTML = REVIEWS.map(x => `
        <article class="review-card">
            <div class="review-stars">★★★★★</div>
            <p class="review-text">“${x.text}”</p>
            <div class="review-author">
                <span class="review-avatar">${x.ini}</span>
                <span><b>${x.name}</b><small>${x.city}</small></span>
            </div>
        </article>`).join("");

    $("#faqList").innerHTML = FAQS.map(x => `
        <div class="faq-item">
            <button class="faq-q">${x.q}</button>
            <div class="faq-a"><p>${x.a}</p></div>
        </div>`).join("");

    document.querySelectorAll(".faq-q").forEach(btn =>
        btn.addEventListener("click", () => btn.parentElement.classList.toggle("open")));
}

/* ---------- Revelado al hacer scroll ---------- */
function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* =========================================================
   Init
   ========================================================= */
function init() {
    EL_IDS.forEach(id => { el[id] = document.getElementById(id); });
    renderDesigns();
    renderColors();
    renderFabrics();
    bindMeasures();
    renderContent();
    update();
    initReveal();

    $("#addBtn").addEventListener("click", () =>
        toast(`✓ Mantel ${state.design.name} ${state.largo}×${state.ancho} agregado al carrito`));

    $("#newsletterForm").addEventListener("submit", (e) => {
        e.preventDefault();
        e.target.reset();
        toast("✓ ¡Listo! Te suscribiste a las novedades");
    });
}

document.addEventListener("DOMContentLoaded", init);
