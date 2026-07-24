// Source file for bundling marked + highlight.js into a single browser-ready script
// Run: npx esbuild renderer/markdown_bundle_src.js --bundle --outfile=renderer/markdown_bundle.js --format=iife --global-name=MarkdownBundle

const { marked } = require('marked');
const hljs = require('highlight.js/lib/common');
const markedKatex = require('marked-katex-extension');
require('katex/dist/contrib/mhchem.js'); // Enable chemical formula support (\ce{...})

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

// Configure marked to use highlight.js for code blocks
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) { }
    }
    // Auto-detect if no language specified
    try {
      return hljs.highlightAuto(code).value;
    } catch (e) { }
    return code; // fallback: no highlighting
  },
  breaks: true,       // Convert \n to <br> (like GFM)
  gfm: true,          // GitHub Flavored Markdown
  pedantic: false,
  smartypants: false
});

// Export to window
window.marked = marked;
window.hljs = hljs;
