Page({
    data: {
      mediaPath: '/images/gift.png' // 图片路径需与wxml中一致
    },
  
    onLoad() {
      // 初始化时检查图片是否存在
      this.checkImageExists()
    },
  
    // 检查图片是否存在
    checkImageExists() {
        const fs = wx.getFileSystemManager()
        try {
          fs.accessSync('images/gift.png') // 正确相对路径
          console.log('图片验证通过')
        } catch (e) {
          console.error('图片访问失败:', e)
          wx.showToast({
            title: '资源加载失败',
            icon: 'error'
          })
          // 建议添加备用图片加载方案
          this.setData({
            mediaPath: 'cloud://your-env-id/images/fallback.png' 
          })
        }
      },
  
    // 图片预览功能
    previewMedia() {
      wx.previewImage({
        current: this.data.mediaPath, // 当前显示图片
        urls: [this.data.mediaPath],  // 需要预览的图片列表
        fail: (err) => {
          console.error('预览失败:', err)
          wx.showToast({
            title: '预览失败，请重试',
            icon: 'none'
          })
        }
      })
    },
  
    // 保存到相册功能
    saveToAlbum() {
      this.checkPermission(() => {
        wx.downloadFile({
          url: this.data.mediaPath,
          success: (res) => {
            if (res.statusCode === 200) {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  wx.showToast({
                    title: '保存成功',
                    icon: 'success'
                  })
                },
                fail: (err) => {
                  console.error('保存失败:', err)
                  this.showAuthModal('相册')
                }
              })
            }
          },
          fail: (err) => {
            console.error('下载失败:', err)
            wx.showToast({
              title: '图片下载失败',
              icon: 'none'
            })
          }
        })
      })
    },
  
    // 权限检查
    checkPermission(callback) {
      wx.getSetting({
        success: (res) => {
          if (!res.authSetting['scope.writePhotosAlbum']) {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: callback,
              fail: () => this.showAuthModal('相册')
            })
          } else {
            callback()
          }
        }
      })
    },
  
    // 显示权限弹窗
    showAuthModal(type) {
      wx.showModal({
        title: '权限申请',
        content: `需要${type}权限才能继续操作`,
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting()
          }
        }
      })
    }
  })