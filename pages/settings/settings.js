// pages/settings/settings.js
Page({
  data: {
    pushplus_token: '',
    morning_report_enabled: true,
    morning_report_time: '08:30',
    hideToken: true,
    hasToken: false,
    testing: false,
    saving: false
  },

  onLoad() {
    this.fetchSettings();
  },

  fetchSettings() {
    if (!wx.cloud) return;
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'userApi',
      data: { action: 'getUserSettings' }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        const data = res.result.data;
        this.setData({
          pushplus_token: data.pushplus_token || '',
          morning_report_enabled: data.morning_report_enabled !== undefined ? data.morning_report_enabled : true,
          morning_report_time: data.morning_report_time || '08:30',
          hasToken: Boolean(data.pushplus_token && data.pushplus_token.trim())
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('获取设置失败', err);
    });
  },

  onTokenInput(e) {
    const val = e.detail.value;
    this.setData({
      pushplus_token: val,
      hasToken: Boolean(val && val.trim())
    });
  },

  toggleEye() {
    this.setData({ hideToken: !this.data.hideToken });
  },

  onReportSwitchChange(e) {
    this.setData({ morning_report_enabled: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ morning_report_time: e.detail.value });
  },

  onTestPush() {
    const token = (this.data.pushplus_token || '').trim();
    if (!token) {
      wx.showToast({ title: '请先输入 Token', icon: 'none' });
      return;
    }
    this.setData({ testing: true });
    wx.cloud.callFunction({
      name: 'userApi',
      data: {
        action: 'testPush',
        pushplus_token: token
      }
    }).then(res => {
      this.setData({ testing: false });
      if (res.result && res.result.code === 0) {
        wx.showModal({
          title: '测试推送成功',
          content: '消息已发出，请前往微信聊天列表查看【pushplus推送加】公众号提醒！',
          showCancel: false
        });
      } else {
        wx.showModal({
          title: '推送失败',
          content: (res.result && res.result.message) || '请检查 Token 是否正确',
          showCancel: false
        });
      }
    }).catch(err => {
      this.setData({ testing: false });
      wx.showModal({
        title: '请求异常',
        content: err.message || '网络连接超时',
        showCancel: false
      });
    });
  },

  onSaveSettings() {
    const token = (this.data.pushplus_token || '').trim();
    this.setData({ saving: true });
    wx.cloud.callFunction({
      name: 'userApi',
      data: {
        action: 'saveUserSettings',
        data: {
          pushplus_token: token,
          morning_report_enabled: this.data.morning_report_enabled,
          morning_report_time: this.data.morning_report_time
        }
      }
    }).then(res => {
      this.setData({ saving: false });
      if (res.result && res.result.code === 0) {
        this.setData({ hasToken: Boolean(token) });
        wx.showToast({ title: '设置已保存', icon: 'success' });
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' });
    });
  },

  copyOfficialAccount() {
    wx.setClipboardData({
      data: 'pushplus推送加',
      success: () => {
        wx.showToast({ title: '已复制公众号名称', icon: 'success' });
      }
    });
  }
});
