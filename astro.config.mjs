import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';

// ---------------------------------------------------------------------------
// The CloudCannon on-page editor saves what it sees in the browser, so a typed
// "&" comes back as the HTML entity "&amp;". Astro then escapes that a second
// time and the page ends up reading "Jennifer &amp; Natalie".
//
// This runs before the YAML is parsed and turns those entities back into real
// characters, so anyone can type "&" (or quotes) anywhere without it breaking.
// ---------------------------------------------------------------------------
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeYamlEntities() {
  return {
    name: 'decode-yaml-entities',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.ya?ml$/.test(id)) return null;
      const out = code.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  site: 'https://jennifer-schumacher.vercel.app',
  build: { format: 'file' },
  vite: { plugins: [decodeYamlEntities(), yaml()] },
});
