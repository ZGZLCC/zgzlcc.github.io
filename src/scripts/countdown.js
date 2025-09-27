const today = new Date();
const targetDate = new Date(2019, 0, 30); // 2019年1月30日 (月份从0开始，所以0代表1月)
const togetherDate = new Date(2022, 1, 1); // 2022年2月1日 (月份从0开始，所以1代表2月)

// 计算两个日期之间的毫秒差
const diffTime = today.getTime() - targetDate.getTime();
const togetherTime = today.getTime() - togetherDate.getTime();

// 将毫秒差转换为天数
// Math.ceil确保我们得到完整的天数
const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
const togetherDays = Math.ceil(togetherTime / (1000 * 60 * 60 * 24));

// 更新页面上的元素
const daysLeftElement = document.getElementById('daysLeft');
const daysTogetherElement = document.getElementById('daysTogether');
const todayDateElement = document.getElementById('todayDate');

if (daysLeftElement) {
    daysLeftElement.textContent = diffDays + '天';
}

if (daysTogetherElement) {
    daysTogetherElement.textContent = togetherDays + '天';
}

if (todayDateElement) {
    todayDateElement.textContent = 
    `今天是${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}