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

const DESIGNS = [
    {
        id: "liso", name: "Liso",
        pattern: (c) => svg("", c)
    },
    {
        id: "cuadros", name: "Cuadros",
        pattern: (c) => svg(
            `<path d='M0 0h40v40H0z M40 40h40v40H40z' fill='rgba(255,255,255,.45)'/>`, c)
    },
    {
        id: "rayas", name: "Rayas",
        pattern: (c) => svg(
            `<path d='M0 0h20v80H0z M40 0h20v80H40z' fill='rgba(255,255,255,.4)'/>`, c)
    },
    {
        id: "lunares", name: "Lunares",
        pattern: (c) => svg(
            `<circle cx='20' cy='20' r='9' fill='rgba(255,255,255,.55)'/><circle cx='60' cy='60' r='9' fill='rgba(255,255,255,.55)'/>`, c)
    },
    {
        id: "flores", name: "Floral",
        pattern: (c) => svg(
            `<g fill='rgba(255,255,255,.6)'><circle cx='20' cy='20' r='5'/><circle cx='14' cy='14' r='5'/><circle cx='26' cy='14' r='5'/><circle cx='14' cy='26' r='5'/><circle cx='26' cy='26' r='5'/></g>
             <g fill='rgba(255,255,255,.6)'><circle cx='60' cy='60' r='5'/><circle cx='54' cy='54' r='5'/><circle cx='66' cy='54' r='5'/><circle cx='54' cy='66' r='5'/><circle cx='66' cy='66' r='5'/></g>`, c)
    },
    {
        id: "rombos", name: "Rombos",
        pattern: (c) => svg(
            `<path d='M40 0L80 40L40 80L0 40Z' fill='none' stroke='rgba(255,255,255,.5)' stroke-width='6'/>`, c)
    },
    {
        id: "espiga", name: "Espiga",
        pattern: (c) => svg(
            `<path d='M0 40L20 20L40 40L60 20L80 40' fill='none' stroke='rgba(255,255,255,.45)' stroke-width='6'/>
             <path d='M0 80L20 60L40 80L60 60L80 80' fill='none' stroke='rgba(255,255,255,.45)' stroke-width='6'/>`, c)
    },
    {
        id: "navidad", name: "Festivo",
        pattern: (c) => svg(
            `<g fill='rgba(255,255,255,.6)'><path d='M20 8l6 14H14z M20 18l8 18H12z'/><path d='M60 48l6 14H54z M60 58l8 18H52z'/></g>`, c)
    },
    {
        id: "geometrico", name: "Geométrico",
        pattern: (c) => svg(
            `<g fill='none' stroke='rgba(255,255,255,.5)' stroke-width='4'><rect x='10' y='10' width='24' height='24'/><circle cx='60' cy='60' r='14'/></g>`, c)
    }
];

/* ---------- Paleta de colores base (tomada del logo) ---------- */
const COLORS = [
    { id: "oliva", name: "Verde oliva", hex: "#79853f" },
    { id: "marino", name: "Azul marino", hex: "#2b3a52" },
    { id: "mostaza", name: "Mostaza", hex: "#c2933a" },
    { id: "lino", name: "Lino", hex: "#efe7d6" },
    { id: "arena", name: "Arena", hex: "#d9c2a3" },
    { id: "vino", name: "Vino", hex: "#7a3340" },
    { id: "bosque", name: "Verde bosque", hex: "#3f6b53" },
    { id: "azul", name: "Azul noche", hex: "#3c5a73" },
    { id: "rosa", name: "Rosa palo", hex: "#cf9aa0" }
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
const EL_IDS = ["heroCloth", "previewCloth", "largoVal", "anchoVal", "sizeLabel",
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

    // Mantel del hero y de la vista previa (background-size va en el CSS)
    el.heroCloth.style.backgroundImage = bg;
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
    { emoji: "🍂", bg: "#e7d3bf", t: "Mesa de otoño", d: "Combina tonos terracota y mostaza con hojas secas y velas bajas.", tags: ["Cálido", "Velas", "Centros bajos"] },
    { emoji: "🎄", bg: "#cfe0d2", t: "Cena festiva", d: "Mantel verde o festivo, vajilla blanca y detalles dorados para las fiestas.", tags: ["Festivo", "Dorado", "Familiar"] },
    { emoji: "🌿", bg: "#dde6d4", t: "Almuerzo al aire libre", d: "Lino claro, flores frescas y servilletas de tela para un brunch luminoso.", tags: ["Fresco", "Flores", "Brunch"] },
    { emoji: "🕯️", bg: "#d8ccdf", t: "Cena romántica", d: "Tonos vino o azul noche, luz tenue y un camino de mesa contrastante.", tags: ["Íntimo", "Luz tenue", "Pareja"] },
    { emoji: "☕", bg: "#e9dcc7", t: "Desayuno minimalista", d: "Mantel liso arena, cerámica artesanal y una sola flor de adorno.", tags: ["Sencillo", "Neutro", "Diario"] },
    { emoji: "🎉", bg: "#f0d9c4", t: "Cumpleaños en casa", d: "Lunares o geométrico alegre con servilletas de colores y globos.", tags: ["Divertido", "Color", "Niños"] }
];

const ACCESSORIES = [
    { ico: "🧻", t: "Servilletas de tela", d: "Juego de 6 a tono con tu mantel.", price: 12990 },
    { ico: "🪡", t: "Camino de mesa", d: "Contraste perfecto para el centro.", price: 9990 },
    { ico: "🍽️", t: "Individuales", d: "Set de 4 que combinan con el diseño.", price: 11990 },
    { ico: "🕯️", t: "Portavelas", d: "Cerámica artesanal en tonos cálidos.", price: 7990 },
    { ico: "🌸", t: "Florero de mesa", d: "Pieza central minimalista.", price: 14990 },
    { ico: "🧷", t: "Argollas servilleteras", d: "Detalle dorado o natural.", price: 6990 }
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

    $("#careTips").innerHTML = CARE_TIPS.map(x => `
        <article class="tip-card">
            <div class="tip-ico">${x.ico}</div>
            <h4>${x.t}</h4>
            <p>${x.d}</p>
        </article>`).join("");

    $("#decoIdeas").innerHTML = DECO_IDEAS.map(x => `
        <article class="deco-card">
            <div class="deco-img" style="background:${x.bg}">${x.emoji}</div>
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
}

document.addEventListener("DOMContentLoaded", init);
