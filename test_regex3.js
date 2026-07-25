const text = `
= \\iint_{\\partial V} \\mathbf{F} \\cdot d\\mathbf{S}$

3. Integrales trigonométricas y sus reducciones

| Integral | Reducción |
| -------- | --------- |
| $\\int \\sin^n x dx$ | $-\\frac{\\sin^{n-1} x \\cos x}{n} + \\frac{n-1}{n} \\int \\sin^{n-2} x dx$ |
`;

let s = text;

s = s.replace(/\$([^\s](?:(?!\n\n)[\s\S])*?[^\s])\$/g, (match, p1) => {
    // If it looks like it swallowed a markdown table separator, skip it
    if (/\n\s*\|?[\s-:]+\|[\s-:]+\|?/.test(p1)) return match;
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
});

console.log(s);
