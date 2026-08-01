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

    const fadeElements = document.querySelectorAll('.fade-in-scroll');
    fadeElements.forEach(el => observer.observe(el));
    // 3. Descargar la última versión (.exe) automáticamente desde GitHub
    // REEMPLAZA "tu-usuario/tu-repositorio" con tus datos reales. Ej: "ger/kyba"
    const githubRepo = "kyba-repo/kyba_studio";

    fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`)
        .then(response => response.json())
        .then(data => {
            // Buscar dentro de los assets el archivo que termine en .exe
            const exeAsset = data.assets && data.assets.find(asset => asset.name.endsWith('.exe'));

            if (exeAsset) {
                // Buscar los botones de descarga y actualizar hacia el link del exe
                const downloadBtns = document.querySelectorAll('a[href="#descargar"], a[href="#empezar"]');
                downloadBtns.forEach(btn => {
                    btn.href = exeAsset.browser_download_url;
                    // Opcional: Descomenta la siguiente línea si quieres que el botón diga "Descargar v1.0.0"
                    // btn.textContent = `Descargar ${data.tag_name}`;
                });
            }
        })
        .catch(err => console.error("Error al obtener el release de GitHub:", err));
});
