const { marked } = require('marked');

function prepareMath(text) {
  if (!text) return '';
  
  const hasTableSeparator = (str) => /\n\s*\|?[\s-:]+\|[\s-:]+\|?/.test(str);

  // 1. Convert \[ ... \] and \( ... \) to $$ and $ while escaping |
  let s = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => {
    if (hasTableSeparator(p1)) return match;
    return '$$' + p1.replace(/\|/g, '\\vert ') + '$$';
  });
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (match, p1) => {
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match;
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
  });

  // 2. Also escape | inside native $$...$$ blocks
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
    if (hasTableSeparator(p1)) return match;
    return '$$' + p1.replace(/\|/g, '\\vert ') + '$$';
  });
  
  // 3. And inside native $...$ blocks (heuristic: no space after opening $)
  s = s.replace(/\$([^\s][\s\S]*?[^\s])\$/g, (match, p1) => {
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match;
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
  });

  // 4. Force blank lines around $$ blocks so marked parses them as block tokens.
  s = s.replace(/([^\n])\n\s*\$\$/g, '$1\n\n$$');
  s = s.replace(/\$\$\s*\n([^\n])/g, '$$\n\n$1');

  // 5. Remove newlines inside inline $...$ blocks
  s = s.replace(/\$([\s\S]+?)\$/g, (match, p1) => {
    if (match.startsWith('$$')) return match;
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match; // skip swallowed tables
    return '$' + p1.replace(/\n/g, ' ') + '$';
  });

  return s;
}

const text2 = `
| Function | Abs |
| -------- | --- |
| $f(x)$ | $|x|$ |
`;

console.log(prepareMath(text2));
