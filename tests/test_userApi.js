const assert = require('assert');

console.log('Testing userApi logic...');

let userApi;
try {
  userApi = require('../cloudfunctions/userApi/index.js');
} catch (e) {
  assert.fail('Failed to require cloudfunctions/userApi/index.js: ' + e.message);
}

// 1. Test validateUserSettings
assert.strictEqual(typeof userApi.validateUserSettings, 'function', 'validateUserSettings must be exported');

const validSettings = userApi.validateUserSettings({
  pushplus_token: '  token_abc123  ',
  morning_report_enabled: true,
  morning_report_time: '08:30'
});
assert.strictEqual(validSettings.pushplus_token, 'token_abc123', 'Token should be trimmed');
assert.strictEqual(validSettings.morning_report_enabled, true);
assert.strictEqual(validSettings.morning_report_time, '08:30');

// Test invalid time format
assert.throws(() => userApi.validateUserSettings({ morning_report_time: '25:00' }), /Invalid morning report time format/);
assert.throws(() => userApi.validateUserSettings({ morning_report_time: '8:30' }), /Invalid morning report time format/);

// 2. Test formatPushPayload
assert.strictEqual(typeof userApi.formatPushPayload, 'function', 'formatPushPayload must be exported');
const payload = userApi.formatPushPayload('my_token', '测试标题', '# 正文');
assert.strictEqual(payload.token, 'my_token');
assert.strictEqual(payload.title, '测试标题');
assert.strictEqual(payload.template, 'markdown');
assert.strictEqual(payload.content, '# 正文');

console.log('All userApi unit tests passed successfully!');
