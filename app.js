// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      // 初始化云开发环境
      // shortcut: 默认使用开发环境或者通过全局变量注入，若未填则使用微信控制台默认第一个环境
      wx.cloud.init({
        env: 'cloud1-xxx', // 用户可在微信开发者工具中替换为自己创建的云开发环境 ID
        traceUser: true
      });
    }

    this.globalData = {
      // 存储全局状态或配置
      hasLogin: false
    };
  }
});
