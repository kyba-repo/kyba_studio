const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const text = `- Item 1
$$
\\int dx = x
$$
`;
console.log(marked.parse(text));
