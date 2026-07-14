const { ipcRenderer } = require('electron');

// Observer to detect and auto-import generated HTML code blocks
let lastExtractedCode = '';

// Function to extract code and send to Kyba
function extractHTML() {
  // Look for code blocks. The structure varies between ChatGPT and Gemini.
  const codeBlocks = document.querySelectorAll('code');
  
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const block = codeBlocks[i];
    
    // Identify if the code block is HTML
    const classList = Array.from(block.classList).join(' ');
    const isHTML = classList.includes('language-html') || 
                   block.className.includes('html') || 
                   (block.parentElement && block.parentElement.textContent.substring(0, 20).toLowerCase().includes('html'));
    
    if (isHTML) {
      const codeContent = block.innerText || block.textContent;
      
      // Send only if it is new code
      if (codeContent && codeContent !== lastExtractedCode && codeContent.includes('<')) {
        lastExtractedCode = codeContent;
        console.log('Detected new AI-generated HTML code. Sending to Kyba...');
        ipcRenderer.send('ai-code-generated', codeContent);
        return true;
      }
    }
  }
  return false;
}

// Inject manual import button as a safe fallback method
function injectImportButtons() {
  const preElements = document.querySelectorAll('pre');
  
  preElements.forEach(pre => {
    // Avoid duplicates
    if (pre.querySelector('.kyba-import-btn')) return;
    
    // Verify if it is a code block
    const codeBlock = pre.querySelector('code');
    if (!codeBlock) return;
    
    const isHTML = Array.from(codeBlock.classList).some(c => c.includes('html')) || 
                   (pre.textContent && pre.textContent.substring(0, 10).toLowerCase().includes('html'));
    
    if (isHTML) {
      const btn = document.createElement('button');
      btn.className = 'kyba-import-btn';
      btn.textContent = '⬇ Import to Kyba';
      btn.style.cssText = `
        position: absolute;
        top: 5px;
        right: 60px;
        background-color: #10b981;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      
      // Ensure the parent container can position the button
      if (window.getComputedStyle(pre).position === 'static') {
        pre.style.position = 'relative';
      }
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const codeContent = codeBlock.innerText || codeBlock.textContent;
        ipcRenderer.send('ai-code-generated', codeContent);
        
        btn.textContent = '✓ Imported';
        btn.style.backgroundColor = '#059669';
        setTimeout(() => {
          btn.textContent = '⬇ Import to Kyba';
          btn.style.backgroundColor = '#10b981';
        }, 2000);
      });
      
      pre.appendChild(btn);
    }
  });
}

// Continuous observer to inject buttons or capture code
const observer = new MutationObserver((mutations) => {
  // Inject buttons if new code blocks appear
  injectImportButtons();
  
  // We could also execute extractHTML() here if we want it to be 100% automatic,
  // but the manual import button is usually more reliable and less intrusive.
  // extractHTML(); 
});

window.addEventListener('load', () => {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initial execution in case the page was already loaded
  injectImportButtons();
});
