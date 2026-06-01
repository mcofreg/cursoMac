/* ============================================================
   DATOS DEL JUEGO KIKKI
   Ciudades chilenas, dificultades, datos educativos y tienda.
   ============================================================ */

// Las 5 ciudades de Chile que Kikki debe cruzar de norte a sur.
// Cada una tiene su paleta retro y su "sabor" de tráfico.
const CITIES = [
    {
        name: "Arica",
        subtitle: "La ciudad de la eterna primavera",
        sky: "#ff9e5e",        // atardecer del norte
        road: "#3a3a4a",
        grass: "#caa15a",      // tierra/desierto
        accent: "#ffce54",
        lanes: 4,
        carColors: ["#ff5b5b", "#4fc3f7", "#ffd23f"],
        intro: "Kikki despierta en el desierto más árido del mundo. Debe cruzar Arica para empezar su largo viaje al sur en busca de su familia."
    },
    {
        name: "La Serena",
        subtitle: "Playas y faros",
        sky: "#5ec8ff",
        road: "#33384a",
        grass: "#3ad967",
        accent: "#2ce8f5",
        lanes: 5,
        carColors: ["#ff7043", "#26c6da", "#ab47bc"],
        intro: "El olor del mar guía a Kikki por La Serena. Las micros pasan rápido cerca del faro: ¡atención a los semáforos!"
    },
    {
        name: "Valparaíso",
        subtitle: "Cerros y ascensores",
        sky: "#ffd23f",
        road: "#2b2233",
        grass: "#8e44ad",
        accent: "#ff4070",
        lanes: 6,
        carColors: ["#ff4070", "#3ad967", "#2ce8f5", "#ffd23f"],
        intro: "Valparaíso es un laberinto de cerros coloridos. El tráfico sube y baja sin parar. Kikki necesita toda su astucia callejera."
    },
    {
        name: "Santiago",
        subtitle: "La gran capital",
        sky: "#9aa0b5",        // smog
        road: "#23252e",
        grass: "#4a5568",
        accent: "#ff4070",
        lanes: 7,
        carColors: ["#e53935", "#1e88e5", "#fdd835", "#43a047"],
        intro: "La capital ruge con autopistas y bocinas. Es el cruce más peligroso del viaje. ¡Kikki ya casi llega, no te rindas!"
    },
    {
        name: "Punta Arenas",
        subtitle: "El fin del mundo",
        sky: "#7ec8e3",
        road: "#2e3440",
        grass: "#e0e6ed",      // nieve
        accent: "#88c0d0",
        lanes: 7,
        carColors: ["#bf616a", "#5e81ac", "#ebcb8b", "#a3be8c"],
        intro: "El viento patagónico es feroz y el frío cala los huesos. Tras esta última ciudad, al otro lado de la calle... está su hogar."
    }
];

// Tres niveles de dificultad. Afectan velocidad de autos, vidas y duración de semáforo.
const DIFFICULTIES = {
    facil: {
        label: "FÁCIL",
        tag: "Para cachorros",
        lives: 5,
        carSpeedMul: 0.7,
        carDensity: 0.7,
        greenTime: 220,   // cuadros que dura la luz verde para Kikki (autos detenidos)
        redTime: 180
    },
    normal: {
        label: "NORMAL",
        tag: "Perro callejero",
        lives: 3,
        carSpeedMul: 1.0,
        carDensity: 1.0,
        greenTime: 160,
        redTime: 220
    },
    dificil: {
        label: "DIFÍCIL",
        tag: "Sobreviviente",
        lives: 3,
        carSpeedMul: 1.45,
        carDensity: 1.35,
        greenTime: 110,
        redTime: 260
    }
};

// Servicios de cuidado de mascotas (entre ciudades). Educan mientras juegas.
// "bones" = costo en huesos recolectados.
const CARE_SERVICES = [
    {
        id: "comida",
        icon: "🍖",
        title: "Alimentar a Kikki",
        cost: 3,
        tip: "Un perro necesita comida balanceada y agua fresca SIEMPRE disponible. Nunca le des chocolate, cebolla, uvas ni huesos cocidos: ¡son tóxicos o peligrosos para ellos!",
        reward: { heal: true }
    },
    {
        id: "vet",
        icon: "💉",
        title: "Llevar al veterinario",
        cost: 5,
        tip: "Las visitas al veterinario y las vacunas previenen enfermedades. Desparasitar y revisar a tu mascota una vez al año la mantiene sana y feliz.",
        reward: { extraLife: true }
    },
    {
        id: "peluquero",
        icon: "✂️",
        title: "Ir al peluquero",
        cost: 4,
        tip: "El cepillado y los baños evitan nudos, pulgas y problemas de piel. Cada raza tiene necesidades distintas: ¡infórmate sobre el pelaje de tu perro!",
        reward: { speedBoost: true }
    },
    {
        id: "ropa",
        icon: "🧥",
        title: "Comprar ropa de abrigo",
        cost: 4,
        tip: "En zonas frías como la Patagonia, un abrigo ayuda a perros pequeños o de pelo corto. Pero ojo: muchos perros regulan bien su temperatura y no la necesitan.",
        reward: { shield: true }
    }
];

// Datos curiosos sobre el lenguaje y cuidado canino (se muestran en pantallas).
const DOG_FACTS = [
    "Cuando un perro mueve la cola hacia la DERECHA suele estar contento; hacia la izquierda, inseguro.",
    "Bostezar o lamerse el hocico puede ser señal de que tu perro está estresado, no aburrido.",
    "Esterilizar a tu mascota evita camadas no deseadas y reduce el abandono de animales.",
    "Un perro callejero adoptado puede ser el compañero más leal: ¡adopta, no compres!",
    "El paseo diario no es un lujo: es ejercicio y salud mental para tu perro.",
    "Si un perro se agacha con el lomo bajo y las orejas atrás, tiene miedo. Dale espacio.",
    "Nunca dejes a un perro dentro de un auto cerrado: el calor puede ser mortal en minutos.",
    "El microchip y la placa con tu teléfono ayudan a reencontrar a una mascota perdida."
];

// Frases motivacionales al avanzar de ciudad.
const PROGRESS_LINES = [
    "¡Una ciudad menos! Kikki está más cerca de casa.",
    "El olfato de Kikki reconoce un aroma familiar... ¡sigamos!",
    "Sus patitas están cansadas, pero su corazón no se rinde.",
    "Cada calle cruzada es una historia de valentía."
];
