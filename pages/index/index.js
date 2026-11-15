// pages/index/index.js
Page({
  data: {
    currentTab: 'today', // 'today', 'all', 'done'
    todos: [],
    loading: false,
    pendingCount: 0,
    todayCount: 0,
    overdueCount: 0,
    todayDateStr: ''
  },

  onShow() {
    this.initDateHeader();
    this.fetchTodos();
  },

  onPullDownRefresh() {
    this.fetchTodos(() => {
      wx.stopPullDownRefresh();
    });
  },

  initDateHeader() {
    const d = new Date();
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const str = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weeks[d.getDay()]}`;
    this.setData({ todayDateStr: str });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab }, () => {
      this.fetchTodos();
    });
  },

  switchTabByStat(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab }, () => {
      this.fetchTodos();
    });
  },

  fetchTodos(callback) {
    if (!wx.cloud) {
      if (callback) callback();
      return;
    }
    this.setData({ loading: true });

    // 一并查询该用户的全部未完成待办，以计算看板数据
    Promise.all([
      wx.cloud.callFunction({
        name: 'todoApi',
        data: { action: 'listTodos', filter: this.data.currentTab }
      }),
      wx.cloud.callFunction({
        name: 'todoApi',
        data: { action: 'listTodos', filter: 'all' }
      })
    ]).then(([listRes, allRes]) => {
      this.setData({ loading: false });
      if (callback) callback();

      const rawList = (listRes.result && listRes.result.code === 0 && listRes.result.data) || [];
      const allPending = (allRes.result && allRes.result.code === 0 && allRes.result.data) || [];

      // 计算全局统计
      const now = Date.now();
      const todayDate = new Date();
      const startOfToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();
      const endOfToday = startOfToday + 24 * 3600 * 1000 - 1;

      let overdueCount = 0;
      let todayCount = 0;

      for (const item of allPending) {
        if (item.ddl < startOfToday) {
          overdueCount++;
        } else if (item.ddl <= endOfToday) {
          todayCount++;
        }
      }

      // 格式化当前列表项
      const processedList = rawList.map(item => {
        const d = new Date(item.ddl);
        const isOverdue = item.ddl < now;
        const isToday = item.ddl >= startOfToday && item.ddl <= endOfToday;
        const formattedDdl = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        let remindText = '';
        const offset = Number(item.remind_offset_minutes || 0);
        if (offset === 0) remindText = '准时提醒';
        else if (offset === 15) remindText = '提前15分钟';
        else if (offset === 30) remindText = '提前30分钟';
        else if (offset === 60) remindText = '提前1小时';
        else if (offset === 120) remindText = '提前2小时';
        else if (offset === 1440) remindText = '提前1天';

        return {
          ...item,
          isOverdue,
          isToday,
          formattedDdl,
          remindText
        };
      });

      this.setData({
        todos: processedList,
        pendingCount: allPending.length,
        todayCount,
        overdueCount
      });
    }).catch(err => {
      this.setData({ loading: false });
      if (callback) callback();
      console.error('获取待办列表失败', err);
    });
  },

  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const targetStatus = status === 'done' ? 'pending' : 'done';

    // 乐观更新 UI
    const updated = this.data.todos.map(t => {
      if (t._id === id) {
        return { ...t, status: targetStatus };
      }
      return t;
    });
    this.setData({ todos: updated });

    wx.cloud.callFunction({
      name: 'todoApi',
      data: {
        action: 'toggleStatus',
        id,
        status: targetStatus
      }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        this.fetchTodos();
      }
    }).catch(err => {
      console.error('切换状态异常', err);
      this.fetchTodos();
    });
  },

  onLongPressTodo(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑事项', '删除事项'],
      itemColor: '#1E293B',
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
        } else if (res.tapIndex === 1) {
          this.deleteItem(id);
        }
      }
    });
  },

  deleteItem(id) {
    wx.showModal({
      title: '确认删除',
      content: '确定要彻底删除该待办事项吗？',
      confirmColor: '#EF4444',
      success: (mRes) => {
        if (mRes.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'todoApi',
            data: { action: 'deleteTodo', id }
          }).then(res => {
            wx.hideLoading();
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.fetchTodos();
            }
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  navToCreate() {
    wx.navigateTo({ url: '/pages/edit/edit' });
  },

  navToEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  },

  navToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  }
});
