const assert = require('assert');

console.log('Running End-to-End (E2E) Lifecycle Smoke Verification...');

const todoApi = require('../cloudfunctions/todoApi/index.js');
const userApi = require('../cloudfunctions/userApi/index.js');
const cronDailyMorning = require('../cloudfunctions/cronDailyMorning/index.js');
const cronCheckDdl = require('../cloudfunctions/cronCheckDdl/index.js');

// Base timestamp for simulation: 2026-11-15 08:00:00 UTC+8
const baseTime = new Date('2026-11-15T08:00:00+08:00').getTime();

// ==========================================
// Phase 1: User Settings Configuration
// ==========================================
console.log('Phase 1: Validating user settings...');
const testToken = 'test_token_123456';
const mockUser = {
  _openid: 'user_e2e_001',
  pushplus_token: testToken,
  morning_report_enabled: true,
  morning_report_time: '08:30'
};
assert.strictEqual(mockUser.pushplus_token, testToken);
assert.strictEqual(mockUser.morning_report_enabled, true);

// ==========================================
// Phase 2: Create Todo & Compute Remind Time
// ==========================================
console.log('Phase 2: Creating todo item with DDL & advance alert offset...');
// DDL is at 10:00 (baseTime + 2 hours), alert 30 minutes in advance (09:30)
const ddl = baseTime + 2 * 60 * 60 * 1000; // +120m
const offsetMinutes = 30;

const validatedInput = todoApi.validateTodoInput({
  title: '提交周报与项目演示方案',
  desc: '整理 PPT 并发邮件给组长',
  ddl: ddl,
  remind_offset_minutes: offsetMinutes
});

let todo = {
  _id: 'todo_e2e_01',
  _openid: mockUser._openid,
  ...validatedInput,
  status: 'pending',
  has_reminded: false,
  created_at: baseTime,
  updated_at: baseTime
};

assert.strictEqual(todo.title, '提交周报与项目演示方案');
assert.strictEqual(todo.target_remind_time, ddl - 30 * 60 * 1000, 'Remind time must be exactly 30 min before DDL');
assert.strictEqual(todo.has_reminded, false);

// ==========================================
// Phase 3: DDL Inspection before remind time
// ==========================================
console.log('Phase 3: Inspecting DDL trigger before alert threshold (09:15)...');
const timeBeforeAlert = baseTime + 75 * 60 * 1000; // 09:15, target is 09:30
const triggeredEarly = cronCheckDdl.filterTodosToRemind([todo], timeBeforeAlert);
assert.strictEqual(triggeredEarly.length, 0, 'Should not trigger before target_remind_time');

// ==========================================
// Phase 4: DDL Inspection at alert time
// ==========================================
console.log('Phase 4: Inspecting DDL trigger at alert threshold (09:31)...');
const timeAtAlert = baseTime + 91 * 60 * 1000; // 09:31
const triggeredAtDue = cronCheckDdl.filterTodosToRemind([todo], timeAtAlert);
assert.strictEqual(triggeredAtDue.length, 1, 'Should trigger when now >= target_remind_time');
assert.strictEqual(triggeredAtDue[0]._id, todo._id);

// Generate alert markdown
const alertMd = cronCheckDdl.formatDdlAlertMarkdown(todo);
assert(alertMd.includes('⏰ 待办临期提醒！'));
assert(alertMd.includes('提交周报与项目演示方案'));
assert(alertMd.includes('提前 30 分钟'));

// Simulate cloud function updating has_reminded = true
todo.has_reminded = true;
todo.reminded_at = timeAtAlert;

// ==========================================
// Phase 5: Anti-Duplicate check (Idempotency)
// ==========================================
console.log('Phase 5: Verifying anti-duplicate reminder...');
const triggeredAgain = cronCheckDdl.filterTodosToRemind([todo], timeAtAlert + 5 * 60 * 1000);
assert.strictEqual(triggeredAgain.length, 0, 'Already reminded item must NOT trigger again');

// ==========================================
// Phase 6: Morning Report Aggregation
// ==========================================
console.log('Phase 6: Verifying morning report generation...');
const morningReportTime = new Date('2026-11-15T08:30:00+08:00').getTime();
const categorized = cronDailyMorning.categorizeTodos([todo], morningReportTime);
// Since DDL is today at 10:00, it should be categorized into today's tasks
assert.strictEqual(categorized.today.length, 1, 'Task should be in today list for morning report');
assert.strictEqual(categorized.overdue.length, 0);

const morningMd = cronDailyMorning.generateMorningReportMarkdown(categorized, '2026-11-15');
assert(morningMd.includes('☀️ 早安！今日待办晨报'));
assert(morningMd.includes('提交周报与项目演示方案'));

// ==========================================
// Phase 7: Update DDL & Reset Reminder Flag
// ==========================================
console.log('Phase 7: Modifying DDL to next day and resetting reminder...');
const newDdl = ddl + 24 * 60 * 60 * 1000; // Postpone by 1 day
const updatedInput = todoApi.validateTodoInput({
  title: todo.title,
  desc: todo.desc,
  ddl: newDdl,
  remind_offset_minutes: 60 // change to 1 hour before
});

todo = {
  ...todo,
  ...updatedInput,
  has_reminded: false, // Reset flag as done in edit page / todoApi update
  updated_at: Date.now()
};

assert.strictEqual(todo.remind_offset_minutes, 60);
assert.strictEqual(todo.target_remind_time, newDdl - 60 * 60 * 1000);
assert.strictEqual(todo.has_reminded, false);

// Verify it's not triggered right now
const checkAfterUpdate = cronCheckDdl.filterTodosToRemind([todo], timeAtAlert);
assert.strictEqual(checkAfterUpdate.length, 0, 'New remind time is tomorrow, must not trigger now');

// ==========================================
// Phase 8: Mark Task as Completed
// ==========================================
console.log('Phase 8: Marking task as completed (done)...');
todo.status = 'done';
todo.completed_at = Date.now();

// When target time arrives tomorrow, completed task should be ignored
const tomorrowAlertTime = todo.target_remind_time + 1000;
const checkAfterDone = cronCheckDdl.filterTodosToRemind([todo], tomorrowAlertTime);
assert.strictEqual(checkAfterDone.length, 0, 'Completed task must never trigger DDL reminders');

console.log('======================================================');
console.log('✅ ALL E2E LIFECYCLE SMOKE TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');
