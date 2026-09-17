import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { test } from "vitest";

const dialogSource = readFileSync("apps/desktop/src/components/import/TableImportDialog.vue", "utf8");
const globalsCss = readFileSync("apps/desktop/src/styles/globals.css", "utf8");
const paginationSource = readFileSync("apps/desktop/src/components/grid/DataGridPagination.vue", "utf8");

test("table import dialog keeps a bounded flex viewport with a scrolling middle region", () => {
  assert.match(dialogSource, /class="dbx-table-import-dialog flex min-h-0 min-w-0 flex-col/);
  assert.match(dialogSource, /class="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto/);
  assert.match(dialogSource, /<DialogFooter class="shrink-0 flex-wrap">/);
  assert.match(dialogSource, /height: 760px;/);
  assert.match(dialogSource, /max-height: calc\(var\(--dbx-viewport-height\) - 2rem\);/);
});

test("table import grids collapse for narrow embedded panels", () => {
  assert.match(dialogSource, /@media \(max-width: 800px\)/);
  assert.match(dialogSource, /\.table-import-mapping-grid--create,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(dialogSource, /@media \(max-width: 520px\)/);
  assert.match(dialogSource, /\.table-import-target-row,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
});

test("legacy Servo rendering overrides the generic small dialog fallback", () => {
  assert.match(globalsCss, /html\.dbx-legacy-webview \[data-slot="dialog-content"\]\.dbx-table-import-dialog \{/);
  assert.match(globalsCss, /max-width: 980px !important;/);
  assert.match(globalsCss, /\.dbx-table-import-dialog--fullscreen \{[\s\S]*?height: var\(--dbx-viewport-height\) !important;/);
});

test("footer page number is vertically aligned without inherited input padding", () => {
  assert.match(paginationSource, /class="h-5 w-14 shrink-0 self-center px-1 !py-0 text-center text-xs leading-5 tabular-nums/);
});
