const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const text = `$$
\\vert Integral \\vert Reducción \\vert
\\vert -----------\\vert -----------\\vert
\\vert \\int \\sin^n x dx \\vert -\\frac{\\sin^{n-1} x \\cos x}{n} \\vert
$$`;

console.log(marked.parse(text));
