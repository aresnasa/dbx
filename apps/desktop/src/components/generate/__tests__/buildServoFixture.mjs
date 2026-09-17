// Build the actual Vue dialog/UI/CSS for servo_view's bounded loopback probe.
// Only the connection store/backend are fixtures; no database or relay is used.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const src = path.join(root, "apps/desktop/src");
const outDir = path.join(root, "node_modules/.cache/servo-data-generate");
const apiPath = path.join(src, "lib/backend/api.ts");
const storePath = path.join(src, "stores/connectionStore.ts");
const inputs = ["components/generate/DataGenerateDialog.vue", "components/ui/dialog/DialogContent.vue", "styles/globals.css"];
const fingerprint = createHash("sha256")
  .update(inputs.map((p) => readFileSync(path.join(src, p))).join("\n"))
  .digest("hex");
const names = [...readFileSync(apiPath, "utf8").matchAll(/^export (?:async )?(?:const|function) (\w+)/gm)].map((match) => match[1]);
const table = "table_with_a_very_long_name_".repeat(5);
const apiFixture = `
const table = ${JSON.stringify(table)};
const columns = Array.from({length: 45}, (_, i) => ({name: 'column_with_a_very_long_name_'.repeat(5) + i, data_type: 'varchar', is_nullable: true, column_default: null, extra: '', comment: ''}));
const reads = {
  listSchemas: () => ['public'],
  listTables: () => [{name: table, table_type: 'TABLE'}, ...Array.from({length: 70}, (_, i) => ({name: 'another_table_' + i, table_type: 'TABLE'}))],
  getColumns: () => columns,
};
function call(name) {
  if (reads[name]) return Promise.resolve(reads[name]());
  console.error('DBX_GENERATE_FORBIDDEN_API ' + name);
  throw new Error('Fixture forbids backend call: ' + name);
}
${names.map((name) => `export const ${name} = (...args) => call(${JSON.stringify(name)}, args);`).join("\n")}
`;
const entry = `
import { createApp, h, ref, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { TooltipProvider } from 'reka-ui';
import Dialog from '@/components/generate/DataGenerateDialog.vue';
import i18n from '@/i18n';
import { applyLegacyWebViewClass } from '@/lib/ui/legacyWebView';
import '@/styles/globals.css';
const open = ref(true);
applyLegacyWebViewClass();
const app = createApp({setup: () => () => h(TooltipProvider, {}, {default: () => h(Dialog, {open:open.value, 'onUpdate:open':v=>open.value=v, prefillConnectionId:'fixture', prefillDatabase:'fixture', prefillSchema:'public', prefillTable:${JSON.stringify(table)}})})});
app.use(createPinia()).use(i18n).mount('#root');
let phase = 'normal';
let normalMaxWidth = '';
window.addEventListener('keydown', async e => {
  if ('frnwocsl'.includes(e.key)) e.preventDefault();
  if (e.key === 'f') { phase = 'fullscreen'; document.querySelector('[data-slot="dialog-content"] button.absolute.right-8')?.click(); }
  if (e.key === 'r') phase = 'restored';
  // Reproduce a narrow embedded/modal allocation even with a desktop viewport.
  if (e.key === 'n') { phase='constrained'; const d=document.querySelector('[data-slot="dialog-content"]'); normalMaxWidth=d.style.maxWidth; d.style.setProperty('max-width','384px','important'); }
  if (e.key === 'w') { phase='normal'; document.querySelector('[data-slot="dialog-content"]').style.setProperty('max-width',normalMaxWidth); }
  if (e.key === 'o') { phase = 'reopened'; open.value=true; }
  if (e.key === 'c') { phase = 'closed'; open.value=false; }
  if (e.key === 's') {
    phase = 'scrolled';
    const d = document.querySelector('[data-slot="dialog-content"]');
    d.querySelector('[data-reka-scroll-area-viewport]').scrollTop = 100;
    const panel = d.querySelector('.dbx-generate-config').lastElementChild.firstElementChild;
    const input = panel.querySelector('input');
    panel.scrollTop += input.getBoundingClientRect().y - panel.getBoundingClientRect().y - panel.clientHeight / 2;
    input.focus({preventScroll:true});
  }
  if (e.key === 'l') {
    const tree = document.querySelector('.dbx-generate-tree');
    const row = tree.querySelector('[title]');
    row.querySelector('button').click();
    // Expanding a table loads column metadata asynchronously (fixture reads only).
    for (let i=0; i<50 && !tree.querySelector('span.font-mono'); i++) await new Promise(resolve => setTimeout(resolve,20));
    const column = [...tree.querySelectorAll('span.font-mono')].at(-1);
    if (!column) throw new Error('Fixture column did not load');
    column.click();
    await nextTick();
    phase = 'column';
  }
});
function rect(el) { if(!el) return null; const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }
setInterval(() => {
 const d=document.querySelector('[data-slot="dialog-content"]');
 if(!d) { console.log('DBX_GENERATE '+JSON.stringify({phase,open:false})); return; }
 const config=d.querySelector('.dbx-generate-config');
 if(!config) return;
 const tree=config.firstElementChild, panel=config.lastElementChild;
 const input=panel.querySelector('input');
 if(!input) return;
 const treeScroll=tree?.querySelector('[data-reka-scroll-area-viewport], [data-slot="scroll-area-viewport"]');
 const footer=d.querySelector('[data-slot="dialog-footer"]');
 const cs=getComputedStyle(d);
 console.log('DBX_GENERATE '+JSON.stringify({phase,open:true,fingerprint:${JSON.stringify(fingerprint)},viewport:[innerWidth,innerHeight,devicePixelRatio],legacy:document.documentElement.classList.contains('dbx-legacy-webview'),fullscreen:!!document.fullscreenElement,dialog:rect(d),inline:d.getAttribute('style'),maxWidth:cs.maxWidth,config:rect(config),direction:config&&getComputedStyle(config).flexDirection,tree:rect(tree),panel:rect(panel),input:rect(input),value:input.value,focused:document.activeElement===input,footer:rect(footer),fullscreenButton:rect(d.querySelector('button.absolute.right-8')),rightHandle:rect(d.querySelector('.cursor-e-resize')),bottomHandle:rect(d.querySelector('.cursor-s-resize')),cornerHandle:rect(d.querySelector('.cursor-se-resize')),treeScroll:treeScroll&&[treeScroll.clientHeight,treeScroll.scrollHeight,treeScroll.scrollTop],panelScroll:panel&&[panel.firstElementChild.clientWidth,panel.firstElementChild.scrollWidth,panel.firstElementChild.clientHeight,panel.firstElementChild.scrollHeight,panel.firstElementChild.scrollTop]}));
},100);
`;

await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: path.join(root, "apps/desktop"),
  publicDir: path.join(root, "apps/desktop/public"),
  plugins: [
    {
      name: "servo-data-generate-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:servo-data-generate" || id.endsWith("/virtual:servo-data-generate")) return "\0servo-data-generate";
      },
      load(id) {
        if (id === "\0servo-data-generate") return entry;
        if (id === apiPath) return apiFixture;
        if (id === storePath) return `export function useConnectionStore() { return {getConfig:()=>({id:'fixture',name:'Fixture only',db_type:'postgres'}),ensureConnected:async()=>{},invalidateMetadataCache:()=>{}}; }`;
      },
    },
    vue(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": src } },
  build: { outDir, emptyOutDir: true, minify: false, lib: { entry: "virtual:servo-data-generate", formats: ["es"], fileName: () => "fixture.js", cssFileName: "fixture" } },
});
writeFileSync(path.join(outDir, "index.html"), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
writeFileSync(path.join(outDir, "fingerprint.txt"), fingerprint);
writeFileSync(path.join(outDir, "source-inputs.txt"), inputs.map((p) => readFileSync(path.join(src, p), "utf8")).join("\n"));
console.log(`Servo dialog fixture: ${outDir}\nSource fingerprint: ${fingerprint}`);
