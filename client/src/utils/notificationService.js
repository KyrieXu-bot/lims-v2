import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * 初始化通知权限
 */
export async function requestNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    // Web 环境不支持本地通知
    return false;
  }

  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (error) {
    console.error('请求通知权限失败:', error);
    return false;
  }
}

/**
 * 检查通知权限状态
 */
export async function checkNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const result = await LocalNotifications.checkPermissions();
    return result.display === 'granted';
  } catch (error) {
    console.error('检查通知权限失败:', error);
    return false;
  }
}

/**
 * 显示本地通知
 * @param {Object} notification - 通知对象
 * @param {string} notification.title - 通知标题
 * @param {string} notification.body - 通知内容
 * @param {number} notification.id - 通知ID（可选，默认使用时间戳）
 */
export async function showLocalNotification({ title, body, id = null }) {
  if (!Capacitor.isNativePlatform()) {
    console.log('Web 环境，跳过本地通知:', { title, body });
    return;
  }

  try {
    // 检查权限
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      console.log('没有通知权限，尝试请求权限...');
      const granted = await requestNotificationPermission();
      if (!granted) {
        console.log('用户拒绝了通知权限');
        return;
      }
    }

    // 生成通知ID
    const notificationId = id || Date.now();

    // 显示通知
    await LocalNotifications.schedule({
      notifications: [
        {
          title: title || '新通知',
          body: body || '',
          id: notificationId,
          sound: 'default',
          badge: 1,
          // iOS 特定选项
          attachments: undefined,
          actionTypeId: '',
          extra: {
            // 可以在这里添加额外的数据，用于点击通知后的处理
          }
        }
      ]
    });

    console.log('本地通知已发送:', { title, body, id: notificationId });
  } catch (error) {
    console.error('发送本地通知失败:', error);
  }
}

/**
 * 取消所有通知
 */
export async function cancelAllNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocalNotifications.cancel({
      notifications: []
    });
  } catch (error) {
    console.error('取消通知失败:', error);
  }
}

/**
 * 获取未读通知数量（用于设置角标）
 */
export async function setBadgeCount(count) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // 注意：Capacitor 的 LocalNotifications 可能不直接支持角标
    // 这可能需要使用 @capacitor/app 插件的 setBadgeCount 方法
    // 或者使用原生代码实现
    console.log('设置角标数量:', count);
  } catch (error) {
    console.error('设置角标失败:', error);
  }
}


