document.addEventListener('DOMContentLoaded', function() {
    // 设置页面标题
    document.title = 'Chan&Chen';
    
    // 绑定按钮点击事件
    const giftBtn = document.getElementById('giftBtn');
    if (giftBtn) {
        giftBtn.addEventListener('click', navigateToGift);
    }
    
    // 为相爱天数按钮添加点击事件
    const daysBtn = document.getElementById('daysBtn');
    if (daysBtn) {
        daysBtn.addEventListener('click', navigateToDays);
    }
    
    // 初始化照片轮播
    initSlideshow();
});


function navigateToGift() {
    // 跳转到礼物页面
    window.location.href = 'pages/gift/gift.html';
}

function navigateToDays() {
    // 跳转到相爱天数页面
    window.location.href = 'pages/days/days.html';
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