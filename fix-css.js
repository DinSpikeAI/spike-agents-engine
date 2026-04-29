const fs = require("fs");
const path = require("path");

if (!__dirname.endsWith("spike-engine")) {
  console.error("Wrong directory: " + __dirname);
  process.exit(1);
}

const cssPath = path.join(__dirname, "src", "app", "globals.css");
const content = fs.readFileSync(cssPath, "utf8");

// \u2014 = em-dash, ASCII-safe
const marker = "/* Spike Engine v2 design tokens \u2014 extends existing palette */";
const idx = content.indexOf(marker);

if (idx === -1) {
  console.log("OK: no duplicate block found.");
  process.exit(0);
}

const cleaned = content.slice(0, idx).trimEnd() + "\n";
fs.writeFileSync(cssPath, cleaned, "utf8");

console.log("Removed duplicate block.");
console.log("  Before: " + content.length + " bytes");
console.log("  After:  " + cleaned.length + " bytes");
console.log("  Saved:  " + (content.length - cleaned.length) + " bytes");
