document.addEventListener('DOMContentLoaded', () => {
    // 获取所有带有media类的元素
    const mediaElements = document.querySelectorAll('.media');
    
    // 为每个media元素添加点击事件监听器
    mediaElements.forEach((mediaElement) => {
        mediaElement.addEventListener('click', function() {
            // 获取图片元素
            const img = this.querySelector('img');
            
            // 创建模态框
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'imageModal';
            
            // 创建模态框内容
            const modalContent = document.createElement('img');
            modalContent.className = 'modal-content';
            modalContent.src = img.src;
            
            // 创建关闭按钮
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close';
            closeBtn.innerHTML = '&times;';
            
            // 组装模态框
            modal.appendChild(modalContent);
            modal.appendChild(closeBtn);
            document.body.appendChild(modal);
            
            // 显示模态框
            modal.style.display = 'block';
            
            // 绑定关闭事件 - 点击关闭按钮关闭
            closeBtn.onclick = () => {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            };
            
            // 绑定关闭事件 - 点击模态框背景关闭
            modal.onclick = (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    document.body.removeChild(modal);
                }
            };
        });
    });
});