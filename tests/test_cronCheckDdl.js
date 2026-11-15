const assert = require('assert');

console.log('Testing cronCheckDdl logic...');

let cronDdl;
try {
  cronDdl = require('../cloudfunctions/cronCheckDdl/index.js');
} catch (e) {
  assert.fail('Failed to require cloudfunctions/cronCheckDdl/index.js: ' + e.message);
}

// 1. Test filterTodosToRemind
assert.strictEqual(typeof cronDdl.filterTodosToRemind, 'function', 'filterTodosToRemind must be exported');

const now = 1794702600000;

const mockTodos = [
  // 1. Should trigger: pending, not reminded, target_remind_time <= now
  { _id: 't1', title: '待提醒任务1', target_remind_time: now - 1000, has_reminded: false, status: 'pending' },
  // 2. Already reminded: should NOT trigger
  { _id: 't2', title: '已提醒任务', target_remind_time: now - 5000, has_reminded: true, status: 'pending' },
  // 3. Not yet due: should NOT trigger
  { _id: 't3', title: '未到时间任务', target_remind_time: now + 60000, has_reminded: false, status: 'pending' },
  // 4. Completed: should NOT trigger
  { _id: 't4', title: '已完成任务', target_remind_time: now - 1000, has_reminded: false, status: 'done' }
];

const toRemind = cronDdl.filterTodosToRemind(mockTodos, now);
assert.strictEqual(toRemind.length, 1, 'Exactly 1 todo should be triggered');
assert.strictEqual(toRemind[0]._id, 't1');

// 2. Test formatDdlAlertMarkdown
assert.strictEqual(typeof cronDdl.formatDdlAlertMarkdown, 'function', 'formatDdlAlertMarkdown must be exported');
const alertMd = cronDdl.formatDdlAlertMarkdown({
  title: '提交财务报销',
  desc: '发票贴好',
  ddl: now + 15 * 60 * 1000,
  remind_offset_minutes: 15
});

assert(alertMd.includes('⏰ 待办临期提醒！'), 'Alert markdown should contain alert header');
assert(alertMd.includes('提交财务报销'), 'Alert markdown should contain task title');
assert(alertMd.includes('提前 15 分钟'), 'Alert markdown should contain remind offset');

console.log('All cronCheckDdl unit tests passed successfully!');
