const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing scaffold files...');

const root = path.resolve(__dirname, '..');

// 1. Check app.json
const appJsonPath = path.join(root, 'app.json');
assert(fs.existsSync(appJsonPath), 'app.json must exist');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
assert(Array.isArray(appJson.pages), 'app.json must have pages array');
assert(appJson.pages.includes('pages/index/index'), 'pages/index/index must be configured');
assert(appJson.pages.includes('pages/edit/edit'), 'pages/edit/edit must be configured');
assert(appJson.pages.includes('pages/settings/settings'), 'pages/settings/settings must be configured');
assert(appJson.window && typeof appJson.window === 'object', 'app.json must have window configuration');

// 2. Check project.config.json
const projectConfigPath = path.join(root, 'project.config.json');
assert(fs.existsSync(projectConfigPath), 'project.config.json must exist');
const projConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
assert(projConfig.miniprogramRoot !== undefined, 'miniprogramRoot must be configured');
assert(projConfig.cloudfunctionRoot !== undefined, 'cloudfunctionRoot must be configured');

// 3. Check app.js and app.wxss
assert(fs.existsSync(path.join(root, 'app.js')), 'app.js must exist');
assert(fs.existsSync(path.join(root, 'app.wxss')), 'app.wxss must exist');

console.log('Scaffold verification passed successfully!');
