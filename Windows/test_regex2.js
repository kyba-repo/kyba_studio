let text = `
= \\iint_{\\partial V} \\mathbf{F} \\cdot d\\mathbf{S}$

3. Integrales trigonométricas y sus reducciones

| Integral | Reducción |
| -------- | --------- |
| $\\int \\sin^n x dx$ | $-\\frac{\\sin^{n-1} x \\cos x}{n} + \\frac{n-1}{n} \\int \\sin^{n-2} x dx$ |
`;

let s = text.replace(/\$([^\s][\s\S]*?[^\s])\$/g, (match, p1) => {
    console.log("MATCHED: ", match);
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
});

console.log(s);
