const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project root and the workspace root
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Force Metro to use the correct project root and watch all files in the workspace
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot, workspaceRoot];

// 2. Let Metro resolve packages from both project and workspace node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
