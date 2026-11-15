const assert = require('assert');

console.log('Testing cronDailyMorning logic...');

let cronDaily;
try {
  cronDaily = require('../cloudfunctions/cronDailyMorning/index.js');
} catch (e) {
  assert.fail('Failed to require cloudfunctions/cronDailyMorning/index.js: ' + e.message);
}

// 1. Test categorizeTodos
assert.strictEqual(typeof cronDaily.categorizeTodos, 'function', 'categorizeTodos must be exported');

// Assume today is 2026-11-15 08:30:00 UTC+8 (timestamp: 1794702600000)
const now = new Date('2026-11-15T08:30:00+08:00').getTime();

const todos = [
  { _id: '1', title: '昨天逾期任务', ddl: new Date('2026-11-14T20:00:00+08:00').getTime(), status: 'pending' },
  { _id: '2', title: '今天下午待办', ddl: new Date('2026-11-15T15:00:00+08:00').getTime(), status: 'pending' },
  { _id: '3', title: '明天后续任务', ddl: new Date('2026-11-16T10:00:00+08:00').getTime(), status: 'pending' },
  { _id: '4', title: '已完成的任务不应计入', ddl: new Date('2026-11-15T10:00:00+08:00').getTime(), status: 'done' }
];

const categories = cronDaily.categorizeTodos(todos, now);
assert.strictEqual(categories.overdue.length, 1, 'Should have 1 overdue todo');
assert.strictEqual(categories.today.length, 1, 'Should have 1 today todo');
assert.strictEqual(categories.upcoming.length, 1, 'Should have 1 upcoming todo');
assert.strictEqual(categories.totalPending, 3, 'Total pending should be 3');

// 2. Test generateMorningReportMarkdown
assert.strictEqual(typeof cronDaily.generateMorningReportMarkdown, 'function', 'generateMorningReportMarkdown must be exported');
const md = cronDaily.generateMorningReportMarkdown(categories, '2026-11-15');
assert(md.includes('☀️ 早安！今日待办晨报'), 'Markdown should have greeting header');
assert(md.includes('昨天逾期任务'), 'Markdown should list overdue todo');
assert(md.includes('今天下午待办'), 'Markdown should list today todo');
assert(md.includes('明天后续任务'), 'Markdown should list upcoming todo');

// Test empty todos fallback
const emptyCategories = cronDaily.categorizeTodos([], now);
const emptyMd = cronDaily.generateMorningReportMarkdown(emptyCategories, '2026-11-15');
assert(emptyMd.includes('今日暂无未完成待办事项'), 'Markdown should have empty state text');

console.log('All cronDailyMorning unit tests passed successfully!');
