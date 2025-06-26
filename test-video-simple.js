// 如果有可用的 DASH 測試串流，可以在這裡添加
console.log('測試影片頁面已載入，可以開始測試媒體片段監控功能');

// 監聽影片播放事件
document.addEventListener('DOMContentLoaded', () => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        video.addEventListener('play', () => {
            console.log('影片開始播放，媒體片段監控應該開始工作');
        });
        
        video.addEventListener('loadstart', () => {
            console.log('影片開始載入');
        });
    });
}); 