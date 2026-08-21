import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve(process.cwd(), 'deployment', 'production-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const missingSecrets = manifest.requiredSecrets.filter((key) => !process.env[key]);
const missingFiles = manifest.requiredFiles.filter((relativePath) => {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return !fs.existsSync(absolutePath);
});

if (missingSecrets.length > 0 || missingFiles.length > 0) {
  console.error('Production validation failed.');
  if (missingSecrets.length > 0) {
    console.error('Missing secrets: ' + missingSecrets.join(', '));
  }
  if (missingFiles.length > 0) {
    console.error('Missing files: ' + missingFiles.join(', '));
  }
  process.exit(1);
}

console.log('Production validation passed.');
console.log(`Services ready: ${manifest.services.length}`);
