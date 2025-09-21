document.addEventListener('DOMContentLoaded', function() {
    const giftImage = document.getElementById('giftImage');
    const saveBtn = document.getElementById('saveBtn');
    
    // 图片预览功能
    giftImage.addEventListener('click', previewMedia);
    
    // 保存到相册功能
    saveBtn.addEventListener('click', saveToAlbum);
    
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

// 保存到相册功能
function saveToAlbum() {
    const img = document.getElementById('giftImage');
    
    // 创建临时链接下载图片
    const link = document.createElement('a');
    link.href = img.src;
    link.download = 'gift.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert('图片已开始下载，请在下载文件夹中查看');
}

// 注意：由于浏览器安全限制，网页端无法直接保存到系统相册
// 上述实现改为触发浏览器下载功能