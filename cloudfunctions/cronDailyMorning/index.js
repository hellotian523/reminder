// cloudfunctions/cronDailyMorning/index.js
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
function formatUtc8Time(timestamp, showDate = false) {
  const d = new Date(Number(timestamp) + 8 * 3600 * 1000);
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  if (showDate) {
    return `${Y}-${M}-${D} ${h}:${m}`;
  }
  return `${h}:${m}`;
}

/**
 * 将待办任务按紧急程度进行归类
 */
function categorizeTodos(todos = [], now = Date.now()) {
  const utc8Time = new Date(Number(now) + 8 * 3600 * 1000);
  const year = utc8Time.getUTCFullYear();
  const month = utc8Time.getUTCMonth();
  const date = utc8Time.getUTCDate();
  
  const startOfToday = Date.UTC(year, month, date) - 8 * 3600 * 1000;
  const endOfToday = startOfToday + 24 * 3600 * 1000 - 1;

  const overdue = [];
  const today = [];
  const upcoming = [];

  for (const item of todos) {
    if (item.status !== 'pending') continue;
    const ddl = Number(item.ddl);
    if (ddl < startOfToday) {
      overdue.push(item);
    } else if (ddl <= endOfToday) {
      today.push(item);
    } else {
      upcoming.push(item);
    }
  }

  // 排序：越早截止的排在越前面
  overdue.sort((a, b) => a.ddl - b.ddl);
  today.sort((a, b) => a.ddl - b.ddl);
  upcoming.sort((a, b) => a.ddl - b.ddl);

  return {
    overdue,
    today,
    upcoming,
    totalPending: overdue.length + today.length + upcoming.length
  };
}

/**
 * 渲染高质量晨报 Markdown
 */
function generateMorningReportMarkdown(categories, dateStr) {
  const { overdue, today, upcoming, totalPending } = categories;

  if (totalPending === 0) {
    return [
      `### ☀️ 早安！今日待办晨报 (${dateStr})`,
      '',
      '> 今日暂无未完成待办事项，尽情享受轻松的一天吧！🏖️',
      '',
      '---',
      '*💡 打开小程序可随时添加新任务*'
    ].join('\n');
  }

  const lines = [
    `### ☀️ 早安！今日待办晨报 (${dateStr})`,
    '',
    `> 📊 **待办概览**：总计 ${totalPending} 项 | 🚨 已逾期: ${overdue.length} 项 | 📌 今日必做: ${today.length} 项`,
    ''
  ];

  if (overdue.length > 0) {
    lines.push(`#### 🚨 已逾期事项 (${overdue.length})`);
    for (const item of overdue) {
      const timeStr = formatUtc8Time(item.ddl, true);
      const descPart = item.desc ? ` - *${item.desc}*` : '';
      lines.push(`- **${item.title}** (截止: ${timeStr})${descPart}`);
    }
    lines.push('');
  }

  if (today.length > 0) {
    lines.push(`#### 📌 今日待做事项 (${today.length})`);
    for (const item of today) {
      const timeStr = formatUtc8Time(item.ddl, false);
      const descPart = item.desc ? ` - *${item.desc}*` : '';
      lines.push(`- **${item.title}** (今日 ${timeStr} 截止)${descPart}`);
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push(`#### ⏳ 后续规划事项 (${upcoming.length})`);
    for (const item of upcoming.slice(0, 5)) {
      const timeStr = formatUtc8Time(item.ddl, true);
      lines.push(`- **${item.title}** (${timeStr} 截止)`);
    }
    if (upcoming.length > 5) {
      lines.push(`- *...另有 ${upcoming.length - 5} 项后续待办，详见小程序*`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('💪 *保持专注，今日事今日毕！*');

  return lines.join('\n');
}

/**
 * 发送 PushPlus
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
 * 云函数主执行逻辑
 */
async function main(event = {}, context = {}) {
  if (!cloud) {
    return { code: 0, message: 'Cloud context not initialized in local run' };
  }

  const db = cloud.database();
  const now = Date.now();
  const d = new Date(now + 8 * 3600 * 1000);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  // 1. 查询开启晨报且配置了 Token 的用户
  const usersRes = await db.collection('users')
    .where({
      morning_report_enabled: true
    })
    .get();

  const users = usersRes.data || [];
  let sentCount = 0;

  for (const user of users) {
    const token = (user.pushplus_token || '').trim();
    if (!token) continue;

    // 2. 查询此用户的所有 pending 待办
    const todosRes = await db.collection('todos')
      .where({
        _openid: user._openid,
        status: 'pending'
      })
      .get();

    const categories = categorizeTodos(todosRes.data || [], now);
    const content = generateMorningReportMarkdown(categories, dateStr);

    try {
      await sendPush(token, `【今日待办晨报】${dateStr}`, content);
      sentCount++;
    } catch (err) {
      console.error(`Failed to send morning report to user ${user._openid}:`, err);
    }
  }

  return { code: 0, sentCount, totalUsers: users.length };
}

module.exports = {
  categorizeTodos,
  generateMorningReportMarkdown,
  formatUtc8Time,
  main
};
