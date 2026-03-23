/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const fs = require('fs');
const path = require('path');

const { rebuildWithElectronRebuild } = require('./rebuildNativeModules');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

const UNUSED_PTY_PACKAGE_PATHS = [
  'node_modules/node-pty',
  'node_modules/@lydell/node-pty',
  'node_modules/@lydell/node-pty-darwin-arm64',
  'node_modules/@lydell/node-pty-darwin-x64',
  'node_modules/@lydell/node-pty-linux-arm64',
  'node_modules/@lydell/node-pty-linux-x64',
  'node_modules/@lydell/node-pty-win32-arm64',
  'node_modules/@lydell/node-pty-win32-x64',
];

function removeUnusedPtyPackages(projectRoot) {
  for (const relativePath of UNUSED_PTY_PACKAGE_PATHS) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    fs.rmSync(absolutePath, { recursive: true, force: true });
    console.log(`Removed unused PTY package: ${relativePath}`);
  }
}

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');
    const projectRoot = path.resolve(__dirname, '..');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // AionUi only needs better-sqlite3 rebuilt for Electron.
      // PTY-backed shell execution is intentionally disabled, so do not
      // install optional node-pty variants from aioncli-core here.
      console.log('Local environment, rebuilding required native modules');
      rebuildWithElectronRebuild({
        platform: process.platform,
        arch: process.arch,
        electronVersion,
        cwd: projectRoot,
      });
    }

    removeUnusedPtyPackages(projectRoot);
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
