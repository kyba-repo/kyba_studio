const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const text = `Ejemplo:
$$
\\int \\frac{dx}{x^{4}+1}
=...
$$`;
console.log(marked.parse(text));
