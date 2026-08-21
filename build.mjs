import fs from 'fs';

const src = fs.readFileSync(new URL('./bookmarklet.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('./index.template.html', import.meta.url), 'utf8');
const html = template.replace('__BOOKMARKLET_JSON__', JSON.stringify(src));
fs.writeFileSync(new URL('./index.html', import.meta.url), html);
console.log('Wrote index.html (' + html.length + ' bytes)');
