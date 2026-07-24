window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<button id="readyBtn" class="btn">Kyba Ready</button>';
  }
  if (window.electronAPI && typeof window.electronAPI.contentReady === 'function') {
    window.electronAPI.contentReady();
  }
});
