var fs = require("fs");
var html = fs.readFileSync("index.html", "utf8");

// In <script> blocks, bare & followed by a letter is treated as HTML entity start by old browsers.
// Fix: replace & inside the script tag with \u0026 (unicode escape) which is safe in JS strings.

var si = html.lastIndexOf("<script>");
var se = html.lastIndexOf("</script>");
var before = html.slice(0, si+8);
var js = html.slice(si+8, se);
var after = html.slice(se);

// Fix specific problematic strings inside JS string literals:
// 1. L&T in stock name
js = js.replace("'L\u0026T'", "'L\u00260026T'");
// 2. F&O in news
js = js.replace("F\u0026O rules", "F\u00260026O rules");
// 3. URL query string &range=1d - this is inside a JS string so safe with unicode escape
js = js.replace("?interval=5m\u0026range=1d", "?interval=5m\u00260026range=1d");

fs.writeFileSync("index.html", before + js + after, "utf8");
console.log("Fixed. Verifying...");

// Verify
var html2 = fs.readFileSync("index.html", "utf8");
var si2 = html2.lastIndexOf("<script>");
var se2 = html2.lastIndexOf("</script>");
var js2 = html2.slice(si2+8, se2);
try { new Function(js2); console.log("JS PARSES OK!"); }
catch(e) { console.log("Still broken:", e.message); }
