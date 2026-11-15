// cloudfunctions/cronCheckDdl/index.js
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 本地测试环境
}

/**
 * 格式化 UTC+8 时间
 */
function formatUtc8Time(timestamp) {
  const d = new Date(Number(timestamp) + 8 * 3600 * 1000);
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

/**
 * 筛选到达预警时间且未提醒过的待办任务
 */
function filterTodosToRemind(todos = [], now = Date.now()) {
  const result = [];
  for (const item of todos) {
    if (item.status === 'pending' && !item.has_reminded && Number(item.target_remind_time) <= Number(now)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * 格式化 DDL 预警 Markdown 消息
 */
function formatDdlAlertMarkdown(todo) {
  const ddlStr = formatUtc8Time(todo.ddl);
  const offset = Number(todo.remind_offset_minutes || 0);
  const offsetText = offset === 0 ? '准时提醒' : `提前 ${offset} 分钟`;
  const descPart = todo.desc ? `\n- **详细备注**：${todo.desc}` : '';

  return [
    '### ⏰ 待办临期提醒！',
    '',
    `> 🔔 你的待办事项 **「${todo.title}」** 即将到达截止时间，请注意跟进！`,
    '',
    `- **任务标题**：${todo.title}`,
    `- **截止时间 (DDL)**：${ddlStr}`,
    `- **预警规则**：${offsetText}` + descPart,
    '',
    '---',
    '✅ *处理完成后，请及时在小程序中标记完成！*'
  ].join('\n');
}

/**
 * PushPlus 发送
 */
async function sendPush(token, title, content) {
  if (typeof fetch === 'function') {
    return await (await fetch('http://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, content, template: 'markdown' })
    })).json();
  } else {
    const http = require('http');
    return new Promise((resolve) => {
      const body = JSON.stringify({ token, title, content, template: 'markdown' });
      const req = http.request('http://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (e) { resolve({ code: 500 }); }
        });
      });
      req.on('error', () => resolve({ code: 500 }));
      req.write(body);
      req.end();
    });
  }
}

/**
 * 5分钟巡检主入口
 */
async function main(event = {}, context = {}) {
  if (!cloud) {
    return { code: 0, message: 'Cloud context not initialized in local run' };
  }

  const db = cloud.database();
  const _ = db.command;
  const now = Date.now();

  // 1. 查找满足提醒条件的任务 (status == 'pending' && has_reminded == false && target_remind_time <= now)
  const candidateRes = await db.collection('todos')
    .where({
      status: 'pending',
      has_reminded: false,
      target_remind_time: _.lte(now)
    })
    .limit(100)
    .get();

  const todos = candidateRes.data || [];
  if (todos.length === 0) {
    return { code: 0, sentCount: 0, message: 'No todos need reminder at this cycle' };
  }

  // 2. 批量查找对应用户的 Token
  const openids = [...new Set(todos.map(t => t._openid))];
  const usersRes = await db.collection('users')
    .where({
      _openid: _.in(openids)
    })
    .get();

  const tokenMap = {};
  for (const user of (usersRes.data || [])) {
    if (user.pushplus_token) {
      tokenMap[user._openid] = user.pushplus_token;
    }
  }

  let sentCount = 0;
  for (const todo of todos) {
    const token = tokenMap[todo._openid];
    if (token) {
      const content = formatDdlAlertMarkdown(todo);
      try {
        await sendPush(token, `【临期预警】${todo.title}`, content);
        sentCount++;
      } catch (err) {
        console.error(`Failed to send DDL alert for todo ${todo._id}:`, err);
      }
    }

    // 无论推送是否成功，均标记 has_reminded = true 避免循环反复轰炸
    await db.collection('todos').doc(todo._id).update({
      data: {
        has_reminded: true,
        reminded_at: now
      }
    });
  }

  return { code: 0, candidateCount: todos.length, sentCount };
}

module.exports = {
  filterTodosToRemind,
  formatDdlAlertMarkdown,
  formatUtc8Time,
  main
};
