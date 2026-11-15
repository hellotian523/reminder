// cloudfunctions/todoApi/index.js
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 本地测试环境未安装 wx-server-sdk 时的兜底
}

/**
 * 计算触发提醒的时间戳 (ddl - offset)
 * @param {number|string} ddl 截止时间戳
 * @param {number|string} offsetMinutes 提前提醒分钟数 (默认 0)
 * @returns {number}
 */
function calcTargetRemindTime(ddl, offsetMinutes = 0) {
  const ddlMs = Number(ddl);
  if (!Number.isFinite(ddlMs) || ddlMs <= 0) {
    throw new Error('Invalid DDL timestamp');
  }
  const offsetMs = Number(offsetMinutes || 0) * 60 * 1000;
  if (!Number.isFinite(offsetMs) || offsetMs < 0) {
    throw new Error('Invalid remind offset');
  }
  return ddlMs - offsetMs;
}

/**
 * 校验待办表单参数
 */
function validateTodoInput(data = {}) {
  const title = (data.title || '').trim();
  if (!title) {
    throw new Error('Title is required and cannot be empty');
  }
  if (title.length > 100) {
    throw new Error('Title cannot exceed 100 characters');
  }
  const desc = (data.desc || '').trim();
  const ddl = Number(data.ddl);
  const remind_offset_minutes = Number(data.remind_offset_minutes !== undefined ? data.remind_offset_minutes : 0);
  const target_remind_time = calcTargetRemindTime(ddl, remind_offset_minutes);

  return {
    title,
    desc,
    ddl,
    remind_offset_minutes,
    target_remind_time
  };
}

/**
 * 云函数主入口
 */
async function main(event = {}, context = {}) {
  const wxContext = cloud ? cloud.getWXContext() : { OPENID: event.mock_openid || 'test_user' };
  const openid = wxContext.OPENID;
  if (!openid) {
    return { code: 401, message: 'Unauthenticated user' };
  }

  const db = cloud ? cloud.database() : null;
  const _ = db ? db.command : null;
  const action = event.action;

  try {
    switch (action) {
      case 'addTodo': {
        const input = validateTodoInput(event.data);
        const now = Date.now();
        const record = {
          _openid: openid,
          title: input.title,
          desc: input.desc,
          ddl: input.ddl,
          remind_offset_minutes: input.remind_offset_minutes,
          target_remind_time: input.target_remind_time,
          status: 'pending',
          has_reminded: false,
          created_at: now,
          updated_at: now
        };
        if (!db) return { code: 0, data: { _id: 'mock_id', ...record } };
        const res = await db.collection('todos').add({ data: record });
        return { code: 0, data: { _id: res._id, ...record } };
      }

      case 'updateTodo': {
        const { id, data } = event;
        if (!id) return { code: 400, message: 'Todo ID is required' };
        const input = validateTodoInput(data);
        const updateData = {
          title: input.title,
          desc: input.desc,
          ddl: input.ddl,
          remind_offset_minutes: input.remind_offset_minutes,
          target_remind_time: input.target_remind_time,
          has_reminded: false, // 重置提醒状态，以便新 DDL 再次触发预警
          updated_at: Date.now()
        };
        if (!db) return { code: 0, data: { updated: 1, ...updateData } };
        await db.collection('todos').where({ _id: id, _openid: openid }).update({ data: updateData });
        return { code: 0, data: { updated: 1, ...updateData } };
      }

      case 'deleteTodo': {
        const { id } = event;
        if (!id) return { code: 400, message: 'Todo ID is required' };
        if (!db) return { code: 0, data: { removed: 1 } };
        await db.collection('todos').where({ _id: id, _openid: openid }).remove();
        return { code: 0, data: { removed: 1 } };
      }

      case 'toggleStatus': {
        const { id, status } = event;
        if (!id) return { code: 400, message: 'Todo ID is required' };
        const targetStatus = status === 'done' ? 'done' : 'pending';
        const updateData = {
          status: targetStatus,
          updated_at: Date.now()
        };
        if (!db) return { code: 0, data: { updated: 1, status: targetStatus } };
        await db.collection('todos').where({ _id: id, _openid: openid }).update({ data: updateData });
        return { code: 0, data: { updated: 1, status: targetStatus } };
      }

      case 'getTodo': {
        const { id } = event;
        if (!id) return { code: 400, message: 'Todo ID is required' };
        if (!db) return { code: 0, data: null };
        const res = await db.collection('todos').where({ _id: id, _openid: openid }).get();
        if (!res.data || res.data.length === 0) {
          return { code: 404, message: 'Todo not found' };
        }
        return { code: 0, data: res.data[0] };
      }

      case 'listTodos': {
        const filter = event.filter || 'all'; // 'all', 'today', 'done'
        if (!db) return { code: 0, data: [] };

        let query = { _openid: openid };
        if (filter === 'done') {
          query.status = 'done';
        } else if (filter === 'today') {
          // 今天 00:00:00 到 23:59:59 (北京时间 UTC+8)
          const now = new Date();
          const utc8Offset = 8 * 60 * 60 * 1000;
          const todayDate = new Date(now.getTime() + utc8Offset);
          const startOfDay = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate()) - utc8Offset).getTime();
          const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
          
          query.status = 'pending';
          query.ddl = _.lte(endOfDay);
        } else {
          // 'all': pending 待办
          query.status = 'pending';
        }

        const res = await db.collection('todos')
          .where(query)
          .orderBy('ddl', 'asc')
          .limit(100)
          .get();

        return { code: 0, data: res.data || [] };
      }

      default:
        return { code: 400, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { code: 500, message: err.message };
  }
}

module.exports = {
  calcTargetRemindTime,
  validateTodoInput,
  main
};
