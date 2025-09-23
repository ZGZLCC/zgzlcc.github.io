document.addEventListener('DOMContentLoaded', function() {
    calculateDays();
    
    // 设置页面标题
    document.title = 'chan&chen - 相爱天数';
    
    // 绑定返回按钮点击事件
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../../index.html';
        });
    }
});

function calculateDays() {
    const today = new Date();
    const targetDate = new Date(2019, 0, 30); // 2019年1月30日 (月份从0开始，所以0代表1月)
    
    // 计算两个日期之间的毫秒差
    const diffTime = today - targetDate;
    
    // 将毫秒差转换为天数
    // Math.ceil确保我们得到完整的天数
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // 更新页面上的元素
    const daysLeftElement = document.getElementById('daysLeft');
    const todayDateElement = document.getElementById('todayDate');
    
    if (daysLeftElement) {
        daysLeftElement.textContent = diffDays + '天';
    }
    
    if (todayDateElement) {
        todayDateElement.textContent = 
            `今天是${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    }
}