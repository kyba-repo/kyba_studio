const translations = {
    es: {
        "title": "Kyba Software",
        "meta_desc": "Transformando la forma de trabajar con IA",
        "nav_home": "Inicio",
        "nav_how": "Cómo funciona",
        "nav_features": "Características",
        "nav_req": "Requisitos",
        "hero_title": "Ejecuta modelos de IA en tu PC",
        "hero_subtitle": "Una herramienta diseñada para cambiar la forma en que trabajas diariamente con IA. Fácil, segura y privada.",
        "btn_download": "Descargar",
        "btn_github": "Ver en GitHub",
        "license_text": "Kyba Studio es gratuito para uso personal y educativo",
        "how_title": "Cómo funciona",
        "step1_title": "Paso 1",
        "step1_desc": "Selecciona un modelo en la barra inferior.",
        "step2_title": "Paso 2",
        "step2_desc": "Hace una consulta y el modelo comenzará a descargarse. Listo! ya tenes tu modelo listo para trabajar",
        "step3_title": "Bonus Track",
        "step3_desc": "Podes crear tu modelo personalizado utilizando tus propios parámetros, instrucciones y bases de conocimiento.",
        "feat_title": "Características",
        "feat1_title": "Rendimiento increíble",
        "feat1_desc": "Optimizado para funcionar en tarjetas gráficas dedicadas de Nvidia y AMD, así como tambien en gráficos integrados que soporten la tecnología Vulkan.",
        "feat2_title": "Privacidad Total",
        "feat2_desc": "La privacidad es nuestra prioridad. Todos los modelos y datos se procesan localmente en tu máquina, sin enviar información sensible a internet.",
        "feat3_title": "Elegí tu modelo",
        "feat3_desc": "Ya sea que elijas GPT-OSS, Qwen, Gemma o Llama, con Kyba Studio podes usar el modelo que más se ajuste a tus necesidades.",
        "req_title": "Requisitos",
        "req_min_title": "Mínimos",
        "req_min_cpu": "CPU: Intel o AMD compatible con instrucciones AVX2 / FP16",
        "req_min_gpu": "GPU: Nvidia, AMD o gráficos integrados Intel compatibles con Vulkan",
        "req_min_ram": "RAM: 8 GB ",
        "req_min_vram": "VRAM: 3 GB ",
        "req_rec_title": "Recomendados",
        "req_rec_cpu": "CPU: Ryzen series 2000 o superior, Intel core i5 de 11ª generación o superior",
        "req_rec_gpu": "GPU: Nvidia series RTX 2000 o superior; AMD Radeon RX series 7000 o superior",
        "req_rec_ram": "RAM: 16 GB o superior",
        "req_rec_vram": "VRAM: 10 GB o superior",
        "footer_text": "&copy; 2026 KYBA. Todos los derechos reservados."
    },
    en: {
        "title": "Kyba Software",
        "meta_desc": "Transforming how we work with AI",
        "nav_home": "Home",
        "nav_how": "How it works",
        "nav_features": "Features",
        "nav_req": "Requirements",
        "hero_title": "Run AI models on your PC",
        "hero_subtitle": "A tool designed to change the way you work daily with AI. Easy, secure, and private.",
        "btn_download": "Download",
        "btn_github": "View on GitHub",
        "license_text": "Kyba Studio is free for personal and educational use",
        "how_title": "How it works",
        "step1_title": "Step 1",
        "step1_desc": "Select a model from the bottom bar.",
        "step2_title": "Step 2",
        "step2_desc": "Make a query and the model will start downloading. Done! Your model is ready to work.",
        "step3_title": "Bonus Track",
        "step3_desc": "You can create your custom model using your own parameters, instructions, and knowledge bases.",
        "feat_title": "Features",
        "feat1_title": "Incredible performance",
        "feat1_desc": "Optimized to run on dedicated Nvidia and AMD graphics cards, as well as integrated graphics supporting Vulkan technology.",
        "feat2_title": "Total Privacy",
        "feat2_desc": "Privacy is our priority. All models and data are processed locally on your machine, without sending sensitive information to the internet.",
        "feat3_title": "Choose your model",
        "feat3_desc": "Whether you choose GPT-OSS, Qwen, Gemma, or Llama, with Kyba Studio you can use the model that best fits your needs.",
        "req_title": "Requirements",
        "req_min_title": "Minimum",
        "req_min_cpu": "CPU: Intel or AMD compatible with AVX2 / FP16 instructions",
        "req_min_gpu": "GPU: Nvidia, AMD or Intel integrated graphics compatible with Vulkan",
        "req_min_ram": "RAM: 8 GB ",
        "req_min_vram": "VRAM: 3 GB ",
        "req_rec_title": "Recommended",
        "req_rec_cpu": "CPU: Ryzen 2000 series or higher, Intel Core i5 11th Gen or higher",
        "req_rec_gpu": "GPU: Nvidia RTX 2000 series or higher; AMD Radeon RX 7000 series or higher",
        "req_rec_ram": "RAM: 16 GB or higher",
        "req_rec_vram": "VRAM: 10 GB or higher",
        "footer_text": "&copy; 2026 KYBA. All rights reserved."
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const langSelect = document.getElementById('lang-select');
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');
    const metaDesc = document.querySelector('meta[name="description"]');
    
    // Check saved language or default to 'en'
    const currentLang = localStorage.getItem('appLang') || 'en';
    if (langSelect) {
        langSelect.value = currentLang;
    }
    setLanguage(currentLang);

    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            const newLang = e.target.value;
            setLanguage(newLang);
            localStorage.setItem('appLang', newLang);
        });
    }

    function setLanguage(lang) {
        document.documentElement.lang = lang;
        if (translations[lang]) {
            // Update document title
            if (translations[lang]["title"]) {
                document.title = translations[lang]["title"];
            }
            // Update meta description
            if (translations[lang]["meta_desc"] && metaDesc) {
                metaDesc.setAttribute("content", translations[lang]["meta_desc"]);
            }
            // Update HTML elements
            elementsToTranslate.forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (translations[lang][key]) {
                    if (key === "footer_text") {
                        el.innerHTML = translations[lang][key];
                    } else {
                        el.textContent = translations[lang][key];
                    }
                }
            });
            
            // Update images
            const imgHero = document.getElementById('img-hero');
            const imgDownload = document.getElementById('img-download');
            const imgTuning = document.getElementById('img-tuning');
            
            if (lang === 'en') {
                if (imgHero) imgHero.src = "python-en.png";
                if (imgDownload) imgDownload.src = "kyba_download_eng.png";
                if (imgTuning) imgTuning.src = "kyba-prompt_eng.png";
            } else {
                if (imgHero) imgHero.src = "main-screenshot.png";
                if (imgDownload) imgDownload.src = "descarga_completa.png";
                if (imgTuning) imgTuning.src = "tuning.png";
            }
        }
    }
});
