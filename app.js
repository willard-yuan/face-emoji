// 全局变量
let isModelsLoaded = false;
let originalImage = null;
let processedCanvas = null;

// 表情映射
const expressionMap = {
    'angry': 'angry',
    'disgusted': 'disgusted',
    'fearful': 'fearful',
    'happy': 'happy',
    'neutral': 'neutral',
    'sad': 'sad',
    'surprised': 'surprised'
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    setupEventListeners();
    setupTabSwitching();
});

// 加载face-api.js模型
async function loadModels() {
    try {
        console.log('Loading face-api.js models...');

        await faceapi.nets.ssdMobilenetv1.loadFromUri('./public/models');
        // await faceapi.nets.tinyFaceDetector.loadFromUri('./public/models');
        // await faceapi.nets.mtcnn.loadFromUri('./public/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('./public/models');
        
        console.log('Models loaded successfully');
        isModelsLoaded = true;
    } catch (error) {
        console.error('Error loading models:', error);
        alert('Failed to load AI models. Please refresh the page.');
    }
}

// 设置事件监听器
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');

    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // 统一处理滚动到上传区域的事件
    const scrollToUpload = (event) => {
        event.preventDefault(); // 阻止a标签的默认跳转行为
        const uploadSection = document.querySelector('.upload-section');
        if (uploadSection) {
            uploadSection.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // 为所有需要滚动的按钮/链接添加事件监听器
    const scrollTriggers = [
        '.header .cta-button',
        '.create-btn',
        '.cta-button-container .cta-button',
        '.perfect-emoji .try-now-btn'
    ];

    scrollTriggers.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
            element.addEventListener('click', scrollToUpload);
        }
    });
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processImage(file);
    }
}

// 处理拖拽悬停
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

// 处理拖拽离开
function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
}

// 处理拖拽放下
function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processImage(files[0]);
    }
}

// 处理图片
async function processImage(file) {
    if (!isModelsLoaded) {
        alert('AI models are still loading. Please wait a moment.');
        return;
    }
    
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }
    
    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB.');
        return;
    }
    
    showLoading(true);
    
    try {
        // 创建图片元素
        const img = await createImageFromFile(file);
        originalImage = img;
        
        // 进行人脸检测和表情识别
        const detections = await detectFacesAndExpressions(img);
        
        if (detections.length === 0) {
            alert('No faces detected in the image. Please try another photo.');
            showLoading(false);
            return;
        }
        
        // 绘制结果
        await drawEmojiOnFaces(img, detections);
        
        showLoading(false);
        document.getElementById('downloadBtn').style.display = 'inline-block';
        
    } catch (error) {
        console.error('Error processing image:', error);
        alert('Error processing image. Please try again.');
        showLoading(false);
    }
}

// 从文件创建图片
function createImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// 检测人脸和表情
async function detectFacesAndExpressions(img) {
    const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({
            minConfidence: 0.3,  // 提高置信度阈值，减少误检
            maxResults: 10       // 限制最多返回10个人脸
        }))
        .withFaceExpressions();


        // .detectAllFaces(img, new faceapi.MtcnnOptions({
        //     minFaceSize: 20,
        //     scaleFactor: 0.709
        // }))

        // .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({
        //     minConfidence: 0.3,  // 提高置信度阈值，减少误检
        //     maxResults: 10       // 限制最多返回10个人脸
        // }))

        // this.options = new faceapi.MtcnnOptions({
        //     minFaceSize: 20, // 1 - 50
        //     scaleFactor: 0.709, // 0.1 ~ 0.9
        //   });
    
    // .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
    
    return detections;
}

// 在人脸上绘制表情符号
async function drawEmojiOnFaces(img, detections) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // 设置画布尺寸
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.style.display = 'block';
    
    // 绘制原始图片
    ctx.drawImage(img, 0, 0);
    
    // 为每个检测到的人脸绘制表情符号
    for (const detection of detections) {
        await drawEmojiForDetection(ctx, detection);
    }
    
    processedCanvas = canvas;
}

// 为单个检测结果绘制表情符号
function drawEmojiForDetection(ctx, detection) {
    return new Promise((resolve) => {
        // 获取最高分数的表情
        const expressions = detection.expressions;
        let maxExpression = 'neutral';
        let maxScore = 0;
        
        Object.keys(expressions).forEach(expression => {
            if (expressions[expression] > maxScore) {
                maxScore = expressions[expression];
                maxExpression = expression;
            }
        });
        
        // 创建表情图片
        const emojiImg = new Image();
        emojiImg.onload = () => {
            const box = detection.detection.box;
            
            // 计算表情符号的位置和大小
            const emojiSize = Math.max(box.width, box.height) * 1.2;
            const x = box.x + (box.width - emojiSize) / 2;
            const y = box.y + (box.height - emojiSize) / 2;
            
            // 绘制表情符号
            ctx.drawImage(emojiImg, x, y, emojiSize, emojiSize);
            resolve();
        };
        
        emojiImg.onerror = () => {
            console.error(`Failed to load emoji: ${maxExpression}`);
            resolve();
        };
        
        emojiImg.src = `./public/emojis/${maxExpression}.png`;
    });
}

// 显示/隐藏加载状态
function showLoading(show) {
    const loading = document.getElementById('loading');
    const canvas = document.getElementById('canvas');
    const downloadBtn = document.getElementById('downloadBtn');
    
    if (show) {
        loading.style.display = 'block';
        canvas.style.display = 'none';
        downloadBtn.style.display = 'none';
    } else {
        loading.style.display = 'none';
    }
}

// 下载处理后的图片
function downloadImage() {
    if (!processedCanvas) {
        alert('No processed image to download.');
        return;
    }
    
    // 创建下载链接
    const link = document.createElement('a');
    link.download = 'emojified-photo.png';
    link.href = processedCanvas.toDataURL('image/png');
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 工具函数：获取表情符号路径
function getEmojiPath(expression) {
    const mappedExpression = expressionMap[expression] || 'neutral';
    return `./public/emojis/${mappedExpression}.png`;
}

// 设置标签切换功能
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    if (!tabButtons.length) return;
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 移除所有标签的active类
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // 为当前点击的标签添加active类
            button.classList.add('active');
            
            // 获取当前点击的标签名称
            const tabName = button.getAttribute('data-tab');
            console.log(`Switched to ${tabName} tab`);
            
            // 获取所有示例图片
            const exampleImages = document.querySelectorAll('.example img');
            
            // 根据标签切换图片
            if (tabName === 'original') {
                // 显示原始照片
                if (exampleImages[0]) exampleImages[0].src = './public/images/demo1.webp';
                if (exampleImages[1]) exampleImages[1].src = './public/images/demo2.webp';
            } else if (tabName === 'emoji') {
                // 显示表情符号版本
                if (exampleImages[0]) exampleImages[0].src = './public/images/emojified-photo1.webp';
                if (exampleImages[1]) exampleImages[1].src = './public/images/emojified-photo2.webp';
            }
        });
    });
    
    // 初始化时触发默认标签的点击事件
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        activeTab.click();
    }
}

// 错误处理
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

// 未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});