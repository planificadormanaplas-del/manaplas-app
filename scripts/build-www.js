// Copia los archivos de la app a la carpeta www/ (la que Capacitor mete dentro del APK).
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'www');
const incluir = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino);
for (const item of incluir) {
  fs.cpSync(path.join(raiz, item), path.join(destino, item), { recursive: true });
}
// Versión de la app (sale de js/config.js) para el APK
const cfg = fs.readFileSync(path.join(raiz, 'js/config.js'), 'utf8');
const version = (cfg.match(/VERSION:\s*'([^']+)'/) || [])[1] || '0.0.0';
fs.writeFileSync(path.join(raiz, 'www', 'version.txt'), version);
console.log('www/ lista · versión', version);
