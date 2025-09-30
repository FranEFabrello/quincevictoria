#!/usr/bin/env node
// Script de optimización y prerender de SVG a PNG/WebP/AVIF
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { optimize: svgoOptimize } = require('svgo');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_DIR = path.join(ASSETS_DIR, 'prerendered');

async function ensureOutputDir() { await fs.mkdir(OUTPUT_DIR, { recursive: true }); }

function optimizeSvg(svgContent, filePath) {
  try {
    const { data } = svgoOptimize(svgContent, {
      path: filePath,
      multipass: true,
      floatPrecision: 2,
      plugins: [
        'removeDoctype','removeXMLProcInst','removeComments','removeMetadata','removeEditorsNSData',
        'cleanupAttrs','convertStyleToAttrs','minifyStyles','cleanupIds','removeUselessDefs','collapseGroups',
        'convertShapeToPath','convertPathData','mergePaths','removeEmptyContainers','removeEmptyText',
        { name: 'removeDimensions', active: true },
        { name: 'sortAttrs', active: true },
        { name: 'cleanupNumericValues', params: { floatPrecision: 2 } }
      ]
    });
    return data || svgContent;
  } catch (e) {
    console.warn('⚠ SVGO falló, usando original:', path.basename(filePath), e.message);
    return svgContent;
  }
}

async function needsRender(baseName, srcStat) {
  const targets = ['png','webp','avif'].map(ext => path.join(OUTPUT_DIR, `${baseName}.${ext}`));
  for (const t of targets) {
    try {
      const st = await fs.stat(t);
      if (st.mtimeMs < srcStat.mtimeMs) return true; // fuente más nuevo
    } catch { return true; } // no existe
  }
  return false; // todos frescos
}

async function processSvgFile(fileName) {
  const inputPath = path.join(ASSETS_DIR, fileName);
  const baseName = path.parse(fileName).name;
  let srcStat = await fs.stat(inputPath);
  const original = await fs.readFile(inputPath, 'utf8');
  const optimized = optimizeSvg(original, inputPath);

  if (optimized.length < original.length) {
    await fs.writeFile(inputPath, optimized, 'utf8');
    srcStat = await fs.stat(inputPath);
    console.log(`✂ ${fileName}: ${(original.length/1024).toFixed(1)}KB → ${(optimized.length/1024).toFixed(1)}KB`);
  } else {
    console.log(`= ${fileName}: sin reducción`);
  }

  if (!(await needsRender(baseName, srcStat))) {
    return { fileName, skipped: true };
  }

  const img = sharp(Buffer.from(optimized));
  await Promise.all([
    img.clone().png({ compressionLevel: 9, progressive: true }).toFile(path.join(OUTPUT_DIR, `${baseName}.png`)),
    img.clone().webp({ quality: 82 }).toFile(path.join(OUTPUT_DIR, `${baseName}.webp`)),
    img.clone().avif({ quality: 48 }).toFile(path.join(OUTPUT_DIR, `${baseName}.avif`))
  ]);
  return { fileName };
}

async function main() {
  await ensureOutputDir();
  let entries;
  try { entries = await fs.readdir(ASSETS_DIR); } catch (e) { console.error('No se pudo leer assets/:', e.message); process.exit(1); }
  const svgFiles = entries.filter(f => f.toLowerCase().endsWith('.svg'));
  if (!svgFiles.length) { console.log('No hay SVG.'); return; }
  console.log(`Procesando ${svgFiles.length} SVG...`);
  for (const f of svgFiles) {
    try {
      const r = await processSvgFile(f);
      if (r.skipped) console.log(`↷ Derivados al día: ${f}`); else console.log(`✔ Derivados generados: ${f}`);
    } catch (e) {
      console.error(`✖ Error en ${f}:`, e.message);
    }
  }
  console.log('Prerenderizado completado.');
}

main().catch(e => { console.error('Error inesperado:', e); process.exit(1); });
