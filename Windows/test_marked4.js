const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

let text = `| Tipo | Fórmula |
|---|---|
| Integral de $x^n e^{ax}$ | $\\displaystyle \\int ... =
e^{ax}\\sum ... $ |

16. Integrales de Dirichlet y Fresnel
- Integral de Dirichlet
$$
\\int_{0}^{\\infty}\\frac{\\sin x}{x},dx=\\frac{\\pi}{2}
$$

Ejemplo:
$$
\\int \\frac{dx}{x^{4}+1}
=...
$$`;

// 1. Force blank lines around $$ blocks
text = text.replace(/([^\n])\n\s*\$\$/g, '$1\n\n$$');
text = text.replace(/\$\$\s*\n([^\n])/g, '$$\n\n$1');

// 2. Remove newlines inside inline $...$ blocks (useful for tables)
text = text.replace(/\$([\s\S]+?)\$/g, (match, p1) => {
    // Only if it doesn't start with $$
    if (match.startsWith('$$')) return match;
    return '$' + p1.replace(/\n/g, ' ') + '$';
});

console.log(marked.parse(text));
