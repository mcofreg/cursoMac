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

/* =========================================================
   Render de controles
   ========================================================= */
function renderDesigns() {
    const wrap = $("#designs");
    wrap.innerHTML = DESIGNS.map((d, i) => `
        <button class="design-swatch ${i === 1 ? "active" : ""}" data-id="${d.id}" title="${d.name}">
            <span class="sw-thumb" style="background-image:${d.pattern("#79853f")};background-size:40px;"></span>
            <span class="sw-name">${d.name}</span>
        </button>`).join("");
    wrap.querySelectorAll(".design-swatch").forEach(btn => {
        btn.addEventListener("click", () => {
            state.design = DESIGNS.find(d => d.id === btn.dataset.id);
            wrap.querySelectorAll(".design-swatch").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            update();
        });
    });
}

function renderColors() {
    const wrap = $("#colors");
    wrap.innerHTML = COLORS.map((c, i) => `
        <button class="color-dot ${i === 0 ? "active" : ""}" data-id="${c.id}"
                style="background:${c.hex}" title="${c.name}"></button>`).join("");
    wrap.querySelectorAll(".color-dot").forEach(btn => {
        btn.addEventListener("click", () => {
            state.color = COLORS.find(c => c.id === btn.dataset.id);
            wrap.querySelectorAll(".color-dot").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            update();
        });
    });
}

function renderFabrics() {
    const wrap = $("#fabrics");
    wrap.innerHTML = FABRICS.map((f, i) => `
        <button class="fabric-opt ${i === 0 ? "active" : ""}" data-id="${f.id}">
            <b>${f.name}</b><small>${f.desc}</small>
        </button>`).join("");
    wrap.querySelectorAll(".fabric-opt").forEach(btn => {
        btn.addEventListener("click", () => {
            state.fabric = FABRICS.find(f => f.id === btn.dataset.id);
            wrap.querySelectorAll(".fabric-opt").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            update();
        });
    });
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

    // Hero
    $("#heroCloth").style.backgroundImage = bg;
    $("#heroCloth").style.backgroundSize = "40px";

    // Vista previa (escalada proporcional dentro de la "mesa")
    const cloth = $("#previewCloth");
    const maxW = 320, maxH = 220;
    const scale = Math.min(maxW / state.largo, maxH / state.ancho);
    cloth.style.width = (state.largo * scale) + "px";
    cloth.style.height = (state.ancho * scale) + "px";
    cloth.style.backgroundImage = bg;
    cloth.style.backgroundSize = "40px";

    // Etiquetas
    $("#largoVal").textContent = state.largo;
    $("#anchoVal").textContent = state.ancho;
    $("#sizeLabel").textContent = `${state.largo} × ${state.ancho} cm`;

    // Resumen
    const area = (state.largo * state.ancho) / 10000; // m²
    $("#sumDesign").textContent = state.design.name;
    $("#sumColor").textContent = state.color.name;
    $("#sumSize").textContent = `${state.largo} × ${state.ancho} cm`;
    $("#sumFabric").textContent = state.fabric.name;
    $("#sumArea").textContent = area.toFixed(2) + " m²";

    // Precio
    const price = area * BASE_PRICE_PER_M2 * state.fabric.mult;
    $("#price").textContent = fmt(price);
}

/* =========================================================
   Contenido: cuidado, decoración, accesorios
   ========================================================= */
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

function renderContent() {
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
    renderDesigns();
    renderColors();
    renderFabrics();
    bindMeasures();
    renderContent();
    update();

    $("#addBtn").addEventListener("click", () =>
        toast(`✓ Mantel ${state.design.name} ${state.largo}×${state.ancho} agregado al carrito`));
}

document.addEventListener("DOMContentLoaded", init);
