// pages/edit/edit.js
const REMIND_OPTIONS = [
  { label: '准时提醒 (到期时)', value: 0 },
  { label: '提前 15 分钟', value: 15 },
  { label: '提前 30 分钟', value: 30 },
  { label: '提前 1 小时', value: 60 },
  { label: '提前 2 小时', value: 120 },
  { label: '提前 1 天', value: 1440 }
];

Page({
  data: {
    isEdit: false,
    todoId: null,
    title: '',
    desc: '',
    selectedDate: '',
    selectedTime: '18:00',
    minDate: '',
    remindOptions: REMIND_OPTIONS,
    remindLabels: REMIND_OPTIONS.map(o => o.label),
    remindIndex: 1, // 默认提前 15 分钟
    targetRemindTimeDisplay: '',
    saving: false,
    deleting: false
  },

  onLoad(options) {
    const now = new Date();
    const dStr = this.formatDate(now);
    const minDStr = dStr;

    // 默认时间设置为当前时间后推1小时，整点或30分
    let targetHour = now.getHours() + 1;
    let targetTime = '18:00';
    if (targetHour < 24) {
      targetTime = `${String(targetHour).padStart(2, '0')}:00`;
    }

    this.setData({
      selectedDate: dStr,
      minDate: minDStr,
      selectedTime: targetTime
    });

    if (options && options.id) {
      this.setData({
        isEdit: true,
        todoId: options.id
      });
      wx.setNavigationBarTitle({ title: '编辑待办' });
      this.fetchTodoDetail(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '新建待办' });
      this.updateRemindPreview();
    }
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  fetchTodoDetail(id) {
    if (!wx.cloud) return;
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'todoApi',
      data: { action: 'getTodo', id }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0 && res.result.data) {
        const item = res.result.data;
        const ddlDate = new Date(item.ddl);
        const selectedDate = this.formatDate(ddlDate);
        const selectedTime = `${String(ddlDate.getHours()).padStart(2, '0')}:${String(ddlDate.getMinutes()).padStart(2, '0')}`;

        let remindIndex = REMIND_OPTIONS.findIndex(o => o.value === Number(item.remind_offset_minutes));
        if (remindIndex < 0) remindIndex = 0;

        this.setData({
          title: item.title || '',
          desc: item.desc || '',
          selectedDate,
          selectedTime,
          remindIndex
        }, () => {
          this.updateRemindPreview();
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载待办详情失败', err);
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value }, () => {
      this.updateRemindPreview();
    });
  },

  onTimeChange(e) {
    this.setData({ selectedTime: e.detail.value }, () => {
      this.updateRemindPreview();
    });
  },

  onRemindOffsetChange(e) {
    this.setData({ remindIndex: Number(e.detail.value) }, () => {
      this.updateRemindPreview();
    });
  },

  getDdlTimestamp() {
    const { selectedDate, selectedTime } = this.data;
    if (!selectedDate || !selectedTime) return 0;
    // 构造 YYYY/MM/DD HH:mm:00 (兼容 iOS 日期解析)
    const normalizedStr = `${selectedDate.replace(/-/g, '/')} ${selectedTime}:00`;
    return new Date(normalizedStr).getTime();
  },

  updateRemindPreview() {
    const ddl = this.getDdlTimestamp();
    if (!ddl) return;
    const offsetMinutes = REMIND_OPTIONS[this.data.remindIndex].value;
    const targetRemindTime = ddl - offsetMinutes * 60 * 1000;

    const d = new Date(targetRemindTime);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    this.setData({
      targetRemindTimeDisplay: `${m}月${day}日 ${h}:${min}`
    });
  },

  onSave() {
    const title = (this.data.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入待办标题', icon: 'none' });
      return;
    }

    const ddl = this.getDdlTimestamp();
    if (!ddl || isNaN(ddl)) {
      wx.showToast({ title: '请选择合法的截止时间', icon: 'none' });
      return;
    }

    const offsetMinutes = REMIND_OPTIONS[this.data.remindIndex].value;
    this.setData({ saving: true });

    const action = this.data.isEdit ? 'updateTodo' : 'addTodo';
    const payload = {
      title,
      desc: (this.data.desc || '').trim(),
      ddl,
      remind_offset_minutes: offsetMinutes
    };

    const reqData = this.data.isEdit 
      ? { action, id: this.data.todoId, data: payload }
      : { action, data: payload };

    wx.cloud.callFunction({
      name: 'todoApi',
      data: reqData
    }).then(res => {
      this.setData({ saving: false });
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 600);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ saving: false });
      wx.showToast({ title: '保存异常: ' + err.message, icon: 'none' });
    });
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定删除该事项吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          this.setData({ deleting: true });
          wx.cloud.callFunction({
            name: 'todoApi',
            data: {
              action: 'deleteTodo',
              id: this.data.todoId
            }
          }).then(delRes => {
            this.setData({ deleting: false });
            if (delRes.result && delRes.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 600);
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          }).catch(err => {
            this.setData({ deleting: false });
            wx.showToast({ title: '删除异常: ' + err.message, icon: 'none' });
          });
        }
      }
    });
  }
});
