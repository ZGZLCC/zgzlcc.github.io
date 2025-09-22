document.addEventListener('DOMContentLoaded', function() {
    calculateDays();
    // 设置页面标题
    document.title = 'chan&chen';
    
    // 绑定按钮点击事件
    const giftBtn = document.getElementById('giftBtn');
    if (giftBtn) {
        giftBtn.addEventListener('click', navigateToGift);
    }
    
    // 初始化照片轮播
    initSlideshow();
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

function navigateToGift() {
    // 跳转到礼物页面
    window.location.href = 'pages/gift/gift.html';
}

// 照片轮播功能
function initSlideshow() {
    let slideIndex = 0;
    const slides = document.getElementsByClassName('slideshow-slide');
    
    // 隐藏所有幻灯片
    for (let i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
    }
    
    // 显示下一张图片
    function showSlides() {
        // 隐藏所有幻灯片
        for (let i = 0; i < slides.length; i++) {
            slides[i].style.display = "none";
        }
        
        // 循环到下一张图片
        slideIndex++;
        if (slideIndex > slides.length) {
            slideIndex = 1;
        }
        
        // 显示当前图片
        slides[slideIndex - 1].style.display = "block";
        
        // 3秒后切换到下一张图片
        setTimeout(showSlides, 3000);
    }
    
    // 开始轮播
    showSlides();
}