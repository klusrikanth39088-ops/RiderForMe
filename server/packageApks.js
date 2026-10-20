const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const desktopDir = 'c:\\Users\\seela\\OneDrive\\Desktop';
const distDir = path.join(rootDir, 'dist-apk');
const baseApkPath = path.join(rootDir, 'rider_base.apk');
const keystorePath = path.join(rootDir, 'riderforme.keystore');
const jarsignerPath = 'C:\\Program Files\\Amazon Corretto\\jdk25.0.4_7\\bin\\jarsigner.exe';

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildApk(appName, appSlug, webSrcDir) {
  console.log(`\n========================================`);
  console.log(`Packaging APK for: ${appName} (${appSlug})`);
  console.log(`========================================`);

  const workDir = path.join(rootDir, `scratch_build_${appSlug}`);
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });

  console.log(`1. Extracting base APK archive...`);
  // Unpack base APK with tar
  execSync(`tar -xf "${baseApkPath}" -C "${workDir}"`, { stdio: 'inherit' });

  // Remove existing signatures
  console.log(`2. Stripping base signatures...`);
  const metaInfDir = path.join(workDir, 'META-INF');
  if (fs.existsSync(metaInfDir)) {
    const files = fs.readdirSync(metaInfDir);
    for (const f of files) {
      if (f.endsWith('.SF') || f.endsWith('.RSA') || f.endsWith('.DSA') || f === 'MANIFEST.MF') {
        fs.unlinkSync(path.join(metaInfDir, f));
      }
    }
  }

  // Inject web assets into assets/public and assets/www
  console.log(`3. Embedding ${appName} web bundle and Macherla 522426 offline maps...`);
  const targetPublic = path.join(workDir, 'assets', 'public');
  const targetWww = path.join(workDir, 'assets', 'www');
  copyDirRecursive(webSrcDir, targetPublic);
  copyDirRecursive(webSrcDir, targetWww);

  // Copy offline tiles if available
  const offlineTilesSrc = path.join(rootDir, 'server', 'offline-tiles');
  if (fs.existsSync(offlineTilesSrc)) {
    console.log(`   Embedding offline tile cache into APK assets...`);
    copyDirRecursive(offlineTilesSrc, path.join(targetPublic, 'offline-tiles'));
    copyDirRecursive(offlineTilesSrc, path.join(targetWww, 'offline-tiles'));
  }

  // Repack using jar tool
  console.log(`4. Repacking APK archive with Java jar tool...`);
  const unsignedApk = path.join(distDir, `${appSlug}-unsigned.apk`);
  if (fs.existsSync(unsignedApk)) fs.unlinkSync(unsignedApk);

  const jarExe = 'C:\\Program Files\\Amazon Corretto\\jdk25.0.4_7\\bin\\jar.exe';
  execSync(`"${jarExe}" --create --no-manifest --file "${unsignedApk}" -C "${workDir}" .`, { stdio: 'inherit' });
  console.log(`   Archive created: ${(fs.statSync(unsignedApk).size / (1024*1024)).toFixed(2)} MB`);

  // Sign with jarsigner
  console.log(`5. Signing APK with RiderForMe production keystore...`);
  const signedApkName = `RiderForMe-${appName}.apk`;
  const distSignedPath = path.join(distDir, signedApkName);
  const desktopSignedPath = path.join(desktopDir, signedApkName);

  if (fs.existsSync(distSignedPath)) fs.unlinkSync(distSignedPath);
  fs.copyFileSync(unsignedApk, distSignedPath);

  const signCmd = `"${jarsignerPath}" -keystore "${keystorePath}" -storepass rider123 -keypass rider123 -sigalg SHA256withRSA -digestalg SHA-256 "${distSignedPath}" riderforme`;
  execSync(signCmd, { stdio: 'inherit' });

  // Verify signature
  console.log(`6. Verifying APK signature...`);
  execSync(`"${jarsignerPath}" -verify "${distSignedPath}"`, { stdio: 'inherit' });
  console.log(`   Signature successfully verified!`);

  // Copy to Desktop
  fs.copyFileSync(distSignedPath, desktopSignedPath);
  console.log(`7. Installed to Desktop: ${desktopSignedPath}`);

  // Check if Phone Link / CrossDevice Download folder exists
  const phoneDownloadDir = 'C:\\Users\\seela\\CrossDevice\\I2221 (2)\\storage\\Download';
  if (fs.existsSync(phoneDownloadDir)) {
    try {
      const phoneDest = path.join(phoneDownloadDir, signedApkName);
      fs.copyFileSync(distSignedPath, phoneDest);
      console.log(`8. Synced directly to connected Android phone: ${phoneDest}`);
    } catch(err) {
      console.log(`   Phone sync note: ${err.message}`);
    }
  }

  // Clean scratch
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.unlinkSync(unsignedApk);

  return { distPath: distSignedPath, desktopPath: desktopSignedPath };
}

try {
  const customerWeb = path.join(rootDir, 'apps', 'customer-app');
  const driverWeb = path.join(rootDir, 'apps', 'driver-app');

  const customerResult = buildApk('Customer', 'customer', customerWeb);
  const captainResult = buildApk('Captain', 'captain', driverWeb);

  console.log('\n========================================');
  console.log('SUCCESS! BOTH APKS GENERATED AND DEPLOYED:');
  console.log('Customer APK: ' + customerResult.desktopPath);
  console.log('Captain APK:  ' + captainResult.desktopPath);
  console.log('========================================\n');
} catch (e) {
  console.error('Packaging failed:', e);
  process.exit(1);
}
