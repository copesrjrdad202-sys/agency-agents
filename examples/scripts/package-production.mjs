import fs from 'fs';
import path from 'path';

const root = process.cwd();
const distDir = path.resolve(root, 'dist');
const releaseDir = path.resolve(root, 'release');
const manifestPath = path.resolve(root, 'deployment', 'production-manifest.json');
const dataPath = path.resolve(root, 'data', 'businesses.json');

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ not found. Run npm run build first.');
}

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

fs.copyFileSync(manifestPath, path.resolve(releaseDir, 'production-manifest.json'));
fs.cpSync(distDir, path.resolve(releaseDir, 'dist'), { recursive: true });

const releaseDataDir = path.resolve(releaseDir, 'data');
if (!fs.existsSync(releaseDataDir)) {
  fs.mkdirSync(releaseDataDir, { recursive: true });
}
if (fs.existsSync(dataPath)) {
  fs.copyFileSync(dataPath, path.resolve(releaseDataDir, 'businesses.json'));
}

const summary = {
  builtAt: new Date().toISOString(),
  distDir: 'dist',
  manifest: 'deployment/production-manifest.json',
};

fs.writeFileSync(path.resolve(releaseDir, 'build-summary.json'), JSON.stringify(summary, null, 2));

console.log('Production package prepared in release/.');
