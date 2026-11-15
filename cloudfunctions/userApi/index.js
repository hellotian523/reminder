// cloudfunctions/userApi/index.js
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 本地测试环境兜底
}

/**
 * 校验用户配置输入
 */
function validateUserSettings(data = {}) {
  const token = (data.pushplus_token || '').trim();
  const enabled = data.morning_report_enabled !== undefined ? Boolean(data.morning_report_enabled) : true;
  const time = (data.morning_report_time || '08:30').trim();

  // 格式如 08:30, 23:59
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(time)) {
    throw new Error('Invalid morning report time format. Expected HH:mm (e.g. 08:30)');
  }

  return {
    pushplus_token: token,
    morning_report_enabled: enabled,
    morning_report_time: time
  };
}

/**
 * 构造 PushPlus 消息体
 */
function formatPushPayload(token, title, content) {
  return {
    token,
    title,
    content,
    template: 'markdown'
  };
}

/**
 * 调用 PushPlus 发送接口
 */
async function sendPushPlusNotification({ token, title, content }) {
  if (!token) {
    throw new Error('PushPlus Token is empty');
  }
  const payload = formatPushPayload(token, title, content);
  
  // shortcut: 使用全局 fetch 发送请求，降级为原生 https 模块
  if (typeof fetch === 'function') {
    const res = await fetch('http://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } else {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const req = http.request('http://www.pushplus.plus/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ code: 500, msg: raw });
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
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
  const action = event.action;

  try {
    switch (action) {
      case 'getUserSettings': {
        if (!db) {
          return {
            code: 0,
            data: {
              pushplus_token: '',
              morning_report_enabled: true,
              morning_report_time: '08:30'
            }
          };
        }
        const res = await db.collection('users').where({ _openid: openid }).get();
        if (res.data && res.data.length > 0) {
          const user = res.data[0];
          return {
            code: 0,
            data: {
              pushplus_token: user.pushplus_token || '',
              morning_report_enabled: user.morning_report_enabled !== undefined ? user.morning_report_enabled : true,
              morning_report_time: user.morning_report_time || '08:30'
            }
          };
        }
        return {
          code: 0,
          data: {
            pushplus_token: '',
            morning_report_enabled: true,
            morning_report_time: '08:30'
          }
        };
      }

      case 'saveUserSettings': {
        const settings = validateUserSettings(event.data);
        if (!db) return { code: 0, data: settings };

        const existing = await db.collection('users').where({ _openid: openid }).get();
        const now = Date.now();
        if (existing.data && existing.data.length > 0) {
          await db.collection('users').doc(existing.data[0]._id).update({
            data: {
              ...settings,
              updated_at: now
            }
          });
        } else {
          await db.collection('users').add({
            data: {
              _openid: openid,
              ...settings,
              updated_at: now
            }
          });
        }
        return { code: 0, data: settings, message: 'Settings saved' };
      }

      case 'testPush': {
        const token = (event.pushplus_token || '').trim();
        if (!token) {
          return { code: 400, message: '请先填写 PushPlus Token' };
        }
        const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const content = [
          '### 🔔 微信待办备忘录 - 推送连通性测试',
          '',
          '> 恭喜！你的 PushPlus 微信推送通道已成功连通。',
          '',
          '- **发送时间**：' + timeStr,
          '- **状态**：正常接收',
          '',
          '后续每日待办晨报与 DDL 提前提醒将通过此通道直达你的微信！'
        ].join('\n');

        const pushRes = await sendPushPlusNotification({
          token,
          title: '【微信待办】通道连通测试成功',
          content
        });

        if (pushRes && pushRes.code === 200) {
          return { code: 0, message: '测试消息发送成功，请查收微信公众号通知！', data: pushRes };
        } else {
          return { code: 500, message: (pushRes && pushRes.msg) || 'PushPlus 发送失败，请检查 Token 是否正确', data: pushRes };
        }
      }

      default:
        return { code: 400, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { code: 500, message: err.message };
  }
}

module.exports = {
  validateUserSettings,
  formatPushPayload,
  sendPushPlusNotification,
  main
};
