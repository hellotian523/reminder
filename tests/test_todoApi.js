const assert = require('assert');
const path = require('path');

// Test importing todoApi modules
let todoApi;
try {
  todoApi = require('../cloudfunctions/todoApi/index.js');
} catch (e) {
  // If not yet implemented, fail assertion
  assert.fail('Failed to require cloudfunctions/todoApi/index.js: ' + e.message);
}

console.log('Testing todoApi logic...');

// 1. Test calcTargetRemindTime calculation
assert.strictEqual(typeof todoApi.calcTargetRemindTime, 'function', 'calcTargetRemindTime must be exported');

const now = 1700000000000;
// ddl at now + 1 hour, remind 15 min before
const ddl = now + 60 * 60 * 1000;
const offset15 = 15;
const target15 = todoApi.calcTargetRemindTime(ddl, offset15);
assert.strictEqual(target15, ddl - 15 * 60 * 1000, 'Target remind time should be ddl minus 15 mins');

// offset = 0 (on time)
const target0 = todoApi.calcTargetRemindTime(ddl, 0);
assert.strictEqual(target0, ddl, 'Target remind time with 0 offset should be exactly ddl');

// Invalid DDL should throw
assert.throws(() => todoApi.calcTargetRemindTime('invalid'), /Invalid DDL timestamp/);
assert.throws(() => todoApi.calcTargetRemindTime(-100), /Invalid DDL timestamp/);

// 2. Test validateTodoInput
assert.strictEqual(typeof todoApi.validateTodoInput, 'function', 'validateTodoInput must be exported');

const valid = todoApi.validateTodoInput({
  title: '  买牛奶  ',
  desc: '盒装鲜奶',
  ddl: ddl,
  remind_offset_minutes: 30
});
assert.strictEqual(valid.title, '买牛奶', 'Title should be trimmed');
assert.strictEqual(valid.remind_offset_minutes, 30);
assert.strictEqual(valid.target_remind_time, ddl - 30 * 60 * 1000);

// Empty title should throw
assert.throws(() => todoApi.validateTodoInput({ title: '   ', ddl }), /Title is required/);
// Missing ddl should throw
assert.throws(() => todoApi.validateTodoInput({ title: '测试' }), /Invalid DDL timestamp/);

// 3. Test mock DB handlers dispatching in cloud function
assert.strictEqual(typeof todoApi.main, 'function', 'main handler must be exported');

console.log('All todoApi unit tests passed successfully!');
