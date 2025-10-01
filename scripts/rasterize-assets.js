// Script para rasterizar y optimizar SVGs en assets/
// Genera versiones .webp y .png para mobile y desktop
// Requiere: npm install sharp glob

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const INPUT_DIR = path.join(__dirname, '../assets');
const OUTPUT_DIR = INPUT_DIR; // Guardamos junto a los originales

const SIZES = [
  { name: 'mobile', width: 430 },
  { name: 'desktop', width: 1200 }
];

function getSvgFiles() {
  // Busca SVGs en assets/ y subcarpetas (corrige para Windows)
  const pattern = path.join(INPUT_DIR, '*.svg').replace(/\\/g, '/');
  console.log('Buscando SVGs en:', pattern);
  return glob.sync(pattern, { nodir: true });
}

async function rasterizeSvg(svgPath) {
  const base = path.basename(svgPath, '.svg');
  const svgBuffer = fs.readFileSync(svgPath);
  for (const size of SIZES) {
    // PNG
    const pngOut = path.join(OUTPUT_DIR, `${base}.${size.name}.png`);
    await sharp(svgBuffer)
      .resize({ width: size.width })
      .png({ quality: 80 })
      .toFile(pngOut);
    // WEBP
    const webpOut = path.join(OUTPUT_DIR, `${base}.${size.name}.webp`);
    await sharp(svgBuffer)
      .resize({ width: size.width })
      .webp({ quality: 80 })
      .toFile(webpOut);
    console.log(`✔️ ${base} (${size.name}) -> PNG & WEBP`);
  }
}

async function main() {
  const svgs = getSvgFiles();
  if (!svgs.length) {
    console.log('No SVGs encontrados en assets/');
    return;
  }
  for (const svg of svgs) {
    await rasterizeSvg(svg);
  }
  console.log('¡Listo! Archivos generados en assets/.');
}

main().catch(e => { console.error(e); process.exit(1); });
