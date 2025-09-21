document.addEventListener('DOMContentLoaded', function() {
    calculateDays();
    // 设置页面标题
    document.title = '时光胶囊';
    
    // 绑定按钮点击事件
    const giftBtn = document.getElementById('giftBtn');
    if (giftBtn) {
        giftBtn.addEventListener('click', navigateToGift);
    }
});

function calculateDays() {
    const today = new Date();
    const currentYear = today.getFullYear();
    let birthday = new Date(currentYear, 4, 22); // 5月22日(月份从0开始)
    
    // 如果今年生日已过，计算明年生日
    if (today > birthday) {
        birthday = new Date(currentYear + 1, 4, 22);
    }
    
    const diffTime = birthday - today;
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

function navigateToGift() {
    // 跳转到礼物页面
    window.location.href = '../gift/gift.html';
}