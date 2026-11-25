import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parse } from "parse5";
import * as cssTree from "css-tree";

const files = ["index.html", "settings.html", "operation.html"];
let failures = 0;

function fail(message) {
  console.error("ERROR:", message);
  failures++;
}
function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const parseErrors = [];
  const document = parse(html, { onParseError: error => parseErrors.push(error) });
  if (parseErrors.length) {
    for (const error of parseErrors) fail(`${file}: HTML ${error.code} at ${error.startLine}:${error.startCol}`);
  } else {
    console.log("HTML OK:", file);
  }

  const ids = new Set();
  const duplicateIds = new Set();
  const scripts = [];
  const styles = [];
  walk(document, node => {
    if (!node.tagName) return;
    const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
    if (attrs.id) {
      if (ids.has(attrs.id)) duplicateIds.add(attrs.id);
      ids.add(attrs.id);
    }
    if (node.tagName === "script" && !attrs.src) {
      const type = (attrs.type || "text/javascript").toLowerCase();
      if (["text/javascript", "application/javascript", "module"].includes(type)) {
        scripts.push((node.childNodes || []).map(child => child.value || "").join(""));
      }
    }
    if (node.tagName === "style") {
      styles.push((node.childNodes || []).map(child => child.value || "").join(""));
    }
  });
  for (const id of duplicateIds) fail(`${file}: duplicate id="${id}"`);

  for (let i = 0; i < styles.length; i++) {
    try {
      cssTree.parse(styles[i]);
    } catch (error) {
      fail(`${file}: CSS block ${i + 1}: ${error.message}`);
    }
  }
  console.log(`CSS blocks OK: ${file} (${styles.length})`);

  for (let i = 0; i < scripts.length; i++) {
    const temp = path.join(os.tmpdir(), `digital-staff-${path.basename(file)}-${i}.js`);
    fs.writeFileSync(temp, scripts[i]);
    const result = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
    fs.rmSync(temp, { force: true });
    if (result.status !== 0) {
      fail(`${file}: JavaScript block ${i + 1}\n${result.stderr || result.stdout}`);
    }
  }
  console.log(`JavaScript blocks OK: ${file} (${scripts.length})`);
}

for (const file of ["README.md", "index.html", "settings.html"]) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes("v1.5.0")) fail(`${file}: version v1.5.0 not found`);
}
if (failures) process.exit(1);
console.log("All syntax checks passed.");
