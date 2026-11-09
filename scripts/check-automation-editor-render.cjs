const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const panelPath = path.join(__dirname, "..", "components", "automation", "AutomationPanel.tsx");
const pagePath = path.join(__dirname, "..", "app", "automation", "page.tsx");
const panelText = fs.readFileSync(panelPath, "utf8");
const pageText = fs.readFileSync(pagePath, "utf8");
const panel = ts.createSourceFile(panelPath, panelText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findFunction(source, name) {
  return source.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
}

function jsxTags(node, tagName, found = []) {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === tagName) found.push(node);
  ts.forEachChild(node, (child) => {
    jsxTags(child, tagName, found);
  });
  return found;
}

const panelFunction = findFunction(panel, "AutomationPanel");
assert.ok(panelFunction, "AutomationPanel component exists");
assert.equal(jsxTags(panelFunction, "AutomationPanelEditor").length, 1, "AutomationPanel has one editor mount site");
assert.equal((panelText.match(/\{editorView\}/g) ?? []).length, 1, "the single editor element is inserted once");
assert.match(panelText, /const editorView = addingAnother[\s\S]*?: editor;/, "the one editor moves between the page and dialog");
assert.equal((pageText.match(/<AutomationPanel\s/g) ?? []).length, 1, "the automation route mounts one AutomationPanel");

const editorFunction = findFunction(panel, "AutomationPanelEditor");
assert.ok(editorFunction, "AutomationPanelEditor component exists");
assert.match(panelText, /if \(!settings\) return;\s*void refreshStatus\(\);\s*void refreshSchedule\(\);/, "new sheet setup skips existing-sheet data loading");
assert.match(panelText, /if \(!automationId\) return \{ configured: false \};/, "new sheet requests cannot fall through to the API's first-workflow default");
assert.match(panelText, /if \(!configured \|\| !automationId\) return;/, "background ticks only run for a selected workflow");
assert.match(panelText, /setStats\(data\.stats\)/, "loaded sheet stats update the editor's own state");
assert.match(panelText, /stats\?\.total/, "the editor displays stats from that same state");

console.log("PASS: one automation editor mount site; one route panel; loaded stats update that editor instance.");
