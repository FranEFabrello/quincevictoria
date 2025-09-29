#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { parse, stringify } = require('svgson');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_DIR = path.join(ASSETS_DIR, 'prerendered');

async function ensureOutputDir() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function cleanNode(node) {
    const cleanedAttributes = Object.entries(node.attributes || {})
        .filter(([_, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .reduce((attrs, [key, value]) => {
            attrs[key] = String(value).trim();
            return attrs;
        }, {});

    const children = (node.children || [])
        .map(child => cleanNode(child))
        .filter(child => {
            if (child.type === 'text') {
                return child.value.trim().length > 0;
            }
            return !(child.children && child.children.length === 0 && Object.keys(child.attributes || {}).length === 0);
        });

    return {
        ...node,
        attributes: cleanedAttributes,
        children
    };
}

async function optimizeSvg(svgContent) {
    const ast = await parse(svgContent);
    const optimizedAst = cleanNode(ast);
    return stringify(optimizedAst);
}

async function processSvgFile(fileName) {
    const inputPath = path.join(ASSETS_DIR, fileName);
    const baseName = path.parse(fileName).name;
    const svgContent = await fs.readFile(inputPath, 'utf8');
    const optimizedSvg = await optimizeSvg(svgContent);

    if (optimizedSvg !== svgContent) {
        await fs.writeFile(inputPath, optimizedSvg, 'utf8');
    }

    const image = sharp(Buffer.from(optimizedSvg));

    const pngPath = path.join(OUTPUT_DIR, `${baseName}.png`);
    const webpPath = path.join(OUTPUT_DIR, `${baseName}.webp`);

    await Promise.all([
        image.clone().png({ compressionLevel: 9, progressive: true }).toFile(pngPath),
        image.clone().webp({ quality: 90 }).toFile(webpPath)
    ]);

    return { fileName, pngPath, webpPath };
}

async function main() {
    await ensureOutputDir();
    const entries = await fs.readdir(ASSETS_DIR);
    const svgFiles = entries.filter(entry => entry.toLowerCase().endsWith('.svg'));

    if (svgFiles.length === 0) {
        console.log('No se encontraron SVG en assets/. Nada que prerenderizar.');
        return;
    }

    console.log(`Procesando ${svgFiles.length} SVG...`);
    for (const file of svgFiles) {
        try {
            const result = await processSvgFile(file);
            console.log(`✔ ${file} → ${path.relative(process.cwd(), result.pngPath)}, ${path.relative(process.cwd(), result.webpPath)}`);
        } catch (error) {
            console.error(`✖ Error al procesar ${file}:`, error.message);
        }
    }
    console.log('Prerenderizado completado.');
}

main().catch(error => {
    console.error('Error inesperado en el prerenderizador:', error);
    process.exit(1);
});
