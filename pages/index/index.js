
Page({
  data: {
    daysLeft: 0,
    today: ''
  },
  onLoad() {
    this.calculateDays();
    // 动态设置导航栏
    this.setNavigationBar();
  },
  calculateDays() {
    const today = new Date();
    const currentYear = today.getFullYear();
    let birthday = new Date(currentYear, 4, 22); // 5月22日(月份从0开始)
    
    // 如果今年生日已过，计算明年生日
    if (today > birthday) {
      birthday = new Date(currentYear + 1, 4, 22);
    }
    
    const diffTime = birthday - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    this.setData({
      daysLeft: diffDays,
      today: `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
    });
  },
  setNavigationBar() {
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: `时光胶囊`
    });
    // 设置导航栏颜色
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#FF6B81',
      animation: {
        duration: 400,
        timingFunc: 'easeIn'
      }
    });
  },
  navigateToGift() {
    wx.navigateTo({
      url: '/pages/gift/gift'
    });
  }
})