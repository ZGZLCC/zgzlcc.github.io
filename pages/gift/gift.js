document.addEventListener('DOMContentLoaded', function() {
    const giftImage = document.getElementById('giftImage');
    const saveBtn = document.getElementById('saveBtn');
    
    // 图片预览功能
    giftImage.addEventListener('click', previewMedia);
    
    // 返回首页功能
    saveBtn.addEventListener('click', backToHome);
    
    // 检查图片是否存在
    checkImageExists();
});

// 检查图片是否存在
function checkImageExists() {
    const img = document.getElementById('giftImage');
    img.onerror = function() {
        console.error('图片加载失败');
        // 这里可以设置备用图片
        // img.src = '备用图片路径';
        alert('资源加载失败');
    };
}

// 图片预览功能
function previewMedia() {
    const img = document.getElementById('giftImage');
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'imageModal';
    
    const modalContent = document.createElement('img');
    modalContent.className = 'modal-content';
    modalContent.src = img.src;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close';
    closeBtn.innerHTML = '&times;';
    
    modal.appendChild(modalContent);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 关闭模态框
    closeBtn.onclick = function() {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    };
    
    // 点击模态框外部关闭
    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            document.body.removeChild(modal);
        }
    };
}

// 返回首页功能
function backToHome() {
    window.location.href = '../../index.html';
}