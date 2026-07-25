const text = `
Orphaned dollar $ 

| Integral | Reduccion |
|---|---|
| $\\int$ | $x$ |
`;

let s = text.replace(/\$((?:(?!\n\n)[^\$])+)\$/g, (match, p1) => {
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
});

console.log(s);
