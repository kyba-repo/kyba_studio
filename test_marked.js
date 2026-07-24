const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const text = `$$
\\int \\frac{dx}{x^{4}+1}

=something
$$`;
console.log("Original parse:");
console.log(marked.parse(text));

// test if empty lines break it
