#!/usr/bin/env node
/**
 * Builds the printable user manual from src/help/helpContent.ts, the same source the
 * in-app guide reads, so the two always say the same thing.
 *
 *   node scripts/build-manual.js
 *
 * Writes docs/<Product>_User_Manual_v<version>.html. Open it in a browser and print to
 * PDF, or convert it with any HTML-to-PDF tool.
 */
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const PRODUCT = 'SNFolio';
const WHERE = 'tap <strong>⚙</strong>, then <strong>📖 Guide</strong>';
const sourcePath = path.join(root, 'src/help/helpContent.ts');

// helpContent.ts has no imports, so transpiling it on its own is enough.
const {outputText} = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
});
const loaded = new Module(sourcePath);
loaded.filename = sourcePath;
loaded._compile(outputText, sourcePath);
const {HELP_TOPICS, HELP_VERSION, splitLabel} = loaded.exports;

const escape = text =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const item = text => {
  const parts = splitLabel(text);
  return parts
    ? `<strong>${escape(parts.label)}</strong> — ${escape(parts.text)}`
    : escape(text);
};

const renderBlock = block => {
  switch (block.kind) {
    case 'para':
      return `<p>${escape(block.text)}</p>`;
    case 'steps':
      return `<ol>${block.items.map(i => `<li>${item(i)}</li>`).join('')}</ol>`;
    case 'bullets':
      return `<ul>${block.items.map(i => `<li>${item(i)}</li>`).join('')}</ul>`;
    case 'note':
      return `<div class="note"><strong>${escape(block.label)}</strong> ${escape(
        block.text,
      )}</div>`;
    case 'table':
      return `<table><thead><tr>${block.headers
        .map(h => `<th>${escape(h)}</th>`)
        .join('')}</tr></thead><tbody>${block.rows
        .map(
          ([a, b]) =>
            `<tr><td><strong>${escape(a)}</strong></td><td>${escape(b)}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    default:
      throw new Error(`Unknown block kind: ${block.kind}`);
  }
};

const renderTopic = (topic, number) => {
  const pages = topic.pages
    .map(page => {
      const heading = page.heading ? `<h3>${escape(page.heading)}</h3>` : '';
      return heading + page.blocks.map(renderBlock).join('\n');
    })
    .join('\n');
  return `<section id="${topic.id}"><h2>${number}. ${escape(
    topic.title,
  )}</h2>\n${pages}</section>`;
};

const contents = HELP_TOPICS.map(
  topic => `<li><a href="#${topic.id}">${escape(topic.title)}</a></li>`,
).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${PRODUCT} User Manual ${escape(HELP_VERSION)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.45; color: #111; max-width: 40em; margin: 2em auto; padding: 0 1em; }
  h1 { font-size: 22pt; margin: 0; }
  .subtitle { font-size: 12pt; margin: 0.2em 0 1.5em; }
  h2 { font-size: 15pt; border-bottom: 1.5pt solid #111; padding-bottom: 2pt; margin-top: 1.6em; break-after: avoid; }
  section { break-before: page; }
  h3 { font-size: 12pt; margin: 1.2em 0 0.4em; break-after: avoid; }
  ol, ul { padding-left: 1.4em; }
  li { margin-bottom: 0.3em; }
  .note { border: 1.5pt solid #111; border-radius: 4pt; padding: 6pt 9pt; margin: 0.8em 0; break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; break-inside: avoid; }
  th, td { text-align: left; vertical-align: top; border-bottom: 0.75pt solid #666; padding: 4pt 6pt 4pt 0; }
  th { border-bottom: 1.5pt solid #111; }
  td:first-child { width: 38%; }
  .contents a { color: inherit; text-decoration: none; }
  .footer { margin-top: 2em; font-size: 9pt; }
</style>
</head>
<body>
<h1>${PRODUCT} for Supernote</h1>
<p class="subtitle">User Manual — v${escape(HELP_VERSION)}</p>
<p>The same guide is built into the plugin: ${WHERE}.</p>
<h2>Contents</h2>
<ol class="contents">${contents}</ol>
${HELP_TOPICS.map((topic, index) => renderTopic(topic, index + 1)).join('\n')}
<p class="footer">Generated from src/help/helpContent.ts.</p>
</body>
</html>
`;

const outPath = path.join(root, 'docs', `${PRODUCT}_User_Manual_v${HELP_VERSION}.html`);
fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, html);
console.log(`Wrote ${path.relative(root, outPath)}`);
