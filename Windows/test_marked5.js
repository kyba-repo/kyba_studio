const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
console.log(marked.parse('\n\n$$\n\\int dx = x\n$$\n\n'));
