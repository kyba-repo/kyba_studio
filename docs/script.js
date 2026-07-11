document.addEventListener('DOMContentLoaded', () => {
    // 1. Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Intersection Observer for Scroll Animations
    // This gives the page a dynamic, alive feel as elements appear
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Unobserve after showing so it only animates once
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach((card, index) => {
        // Add staggered delay to feature cards
        card.style.transitionDelay = `${index * 0.1}s`;
        observer.observe(card);
    });

    // 3. Micro-interaction: Change text in the hero card after loading
    setTimeout(() => {
        const title = document.getElementById('terminal-title');
        const text = document.getElementById('terminal-text');
        if (title && text) {
            title.textContent = 'Sistema Listo';
            title.style.color = '#27c93f';
            text.textContent = 'Todos los módulos operativos.';
        }
    }, 2500); // Matches the CSS animation duration
});
