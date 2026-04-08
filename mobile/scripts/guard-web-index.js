const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("dist/index.html not found. Run expo export first.");
  process.exit(1);
}

const guardMarker = "ravitobox-boot-guard";
let html = fs.readFileSync(indexPath, "utf8");

if (!html.includes(guardMarker)) {
  const guardScript = `
  <script id="${guardMarker}">
    (function () {
      var bootOk = false;
      window.addEventListener("error", function () {
        // keep bootOk false, fallback may show
      });
      setTimeout(function () {
        var root = document.getElementById("root");
        if (!root || root.children.length > 0 || bootOk) return;
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#eef4f0;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;padding:24px;z-index:99999";
        box.innerHTML =
          '<div style="max-width:640px;background:#fff;border:1px solid #d4e0d8;border-radius:12px;padding:18px 20px;box-shadow:0 10px 30px rgba(0,0,0,.08)">' +
          '<h2 style="margin:0 0 8px;font-size:20px">RavitoBox : chargement interrompu</h2>' +
          '<p style="margin:0 0 10px;line-height:1.45">L\\'application ne s\\'est pas initialisée. Fais un rechargement complet (Ctrl/Cmd+Shift+R). Si le problème persiste, ouvre la console puis envoie l\\'erreur.</p>' +
          '<button style="background:#0f766e;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;font-weight:600">Recharger</button>' +
          "</div>";
        box.querySelector("button").onclick = function () {
          location.reload();
        };
        document.body.appendChild(box);
      }, 3500);
      window.__ravitoboxBootOk = function () {
        bootOk = true;
      };
    })();
  </script>`;

  // Insert right before closing body to run even if app bundle fails.
  html = html.replace("</body>", `${guardScript}\n</body>`);
}

// Mark boot success when the main bundle actually loads.
html = html.replace(
  /<script src="([^"]+AppEntry-[^"]+\.js)" defer><\/script>/,
  '<script src="$1" defer onload="window.__ravitoboxBootOk&&window.__ravitoboxBootOk()"></script>'
);

fs.writeFileSync(indexPath, html);
console.log("Applied boot guard to dist/index.html");
