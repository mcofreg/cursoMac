// Marca que hay JavaScript: así el contenido nunca queda oculto si el script falla.
document.documentElement.classList.add('js');

// ---------- Menú móvil ----------
const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');

menuBtn.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menuBtn.querySelector('i').className = open ? 'ph ph-x' : 'ph ph-list';
});

menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        if (menu.classList.contains('is-open')) menuBtn.click();
    });
});

// ---------- Carrito ----------
const cartBtn = document.getElementById('cartBtn');
const cartCount = document.getElementById('cartCount');
const toast = document.getElementById('toast');
let items = 0;
let toastTimer;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => {
        items += 1;
        cartCount.hidden = false;
        cartCount.textContent = items;
        cartBtn.setAttribute('aria-label', `Carrito, ${items} ${items === 1 ? 'producto' : 'productos'}`);

        // Reinicia la animación del contador
        cartCount.classList.remove('bump');
        void cartCount.offsetWidth;
        cartCount.classList.add('bump');

        const label = button.innerHTML;
        button.classList.add('is-added');
        button.innerHTML = 'Agregado <i class="ph ph-check" aria-hidden="true"></i>';
        setTimeout(() => {
            button.classList.remove('is-added');
            button.innerHTML = label;
        }, 1400);

        showToast(`${button.dataset.add} se agregó al carro`);
    });
});

cartBtn.addEventListener('click', () => {
    showToast(items === 0
        ? 'Tu carro está vacío. Agrega algo desde Destacados.'
        : `Tienes ${items} ${items === 1 ? 'producto' : 'productos'} en el carro`);
});

// ---------- Carrusel de destacados ----------
const rail = document.getElementById('rail');
const prev = document.querySelector('[data-rail="prev"]');
const next = document.querySelector('[data-rail="next"]');

function step() {
    const card = rail.querySelector('.product');
    return card.offsetWidth + 20;
}

function updateArrows() {
    prev.disabled = rail.scrollLeft <= 4;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
}

prev.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
next.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));
rail.addEventListener('scroll', () => requestAnimationFrame(updateArrows), { passive: true });
window.addEventListener('resize', updateArrows);
updateArrows();

// ---------- Newsletter con validación ----------
const form = document.getElementById('newsForm');
const email = document.getElementById('email');
const error = document.getElementById('emailError');
const ok = document.getElementById('newsOk');

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());

    error.hidden = valid;
    email.setAttribute('aria-invalid', String(!valid));

    if (!valid) {
        email.focus();
        return;
    }
    ok.hidden = false;
    form.querySelector('button').disabled = true;
    email.disabled = true;
});

email.addEventListener('input', () => {
    if (!error.hidden) {
        error.hidden = true;
        email.removeAttribute('aria-invalid');
    }
});

// ---------- Aparición al entrar en pantalla ----------
const reveals = document.querySelectorAll('.reveal');

// Escalonado dentro de cada grupo (bento, beneficios)
document.querySelectorAll('.bento, .perks').forEach((group) => {
    group.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
});

if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });
    reveals.forEach((el) => observer.observe(el));
} else {
    reveals.forEach((el) => el.classList.add('is-in'));
}
