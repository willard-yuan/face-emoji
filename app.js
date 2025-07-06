// 全局变量
let isModelsLoaded = false;
let originalImage = null;
let processedCanvas = null;
let selectedEmojiStyle = 'auto';
let detectedFaces = null;

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
    setupEmojiSelection();
    
    // 设置关闭按钮事件
    const closeBtn = document.getElementById('closePreview');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeImagePreview);
    }
    
    // 设置应用emoji按钮事件
    const applyBtn = document.getElementById('applyEmoji');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyEmojiToFace);
    }
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
    
    try {
        // 创建图片元素
        const img = await createImageFromFile(file);
        originalImage = img;
        
        // 隐藏upload-container
        hideUploadContainer();
        
        // 显示图片预览
        showImagePreview(img);
        
    } catch (error) {
        console.error('Error processing image:', error);
        alert('Error processing image. Please try again.');
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
    const uploadedImage = document.getElementById('uploadedImage');
    
    // 设置画布尺寸
    canvas.width = img.width;
    canvas.height = img.height;
    
    // 保持原始图片可见，不隐藏它
    // uploadedImage.style.display = 'none'; // 注释掉这行，让原始图片在蒙版下保持可见
    // canvas.style.display = 'block'; // 移除这行，让showLoading控制显示时机
    
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
        let emojiName = 'neutral';
        
        // 根据选择的样式决定emoji
        if (selectedEmojiStyle === 'auto') {
            // AI自动选择：获取最高分数的表情
            const expressions = detection.expressions;
            let maxScore = 0;
            
            Object.keys(expressions).forEach(expression => {
                if (expressions[expression] > maxScore) {
                    maxScore = expressions[expression];
                    emojiName = expression;
                }
            });
        } else {
            // 用户选择的固定样式
            emojiName = getEmojiByStyle(selectedEmojiStyle);
        }
        
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
            console.error(`Failed to load emoji: ${emojiName}`);
            resolve();
        };
        
        emojiImg.src = `./public/emojis/${emojiName}.png`;
    });
}

// 根据样式获取emoji名称
function getEmojiByStyle(style) {
    const styleMap = {
        'happy': 'blush',
        'funny': 'stuck_out_tongue_winking_eye',
        'cool': 'sunglasses',
        'cute': 'happy',
        'animal': 'cat'
    };
    
    return styleMap[style] || 'neutral';
}

// 显示图片预览
function showImagePreview(img) {
    const imagePreviewSection = document.getElementById('imagePreviewSection');
    const uploadedImage = document.getElementById('uploadedImage');
    
    uploadedImage.src = img.src;
    imagePreviewSection.style.display = 'block';
    
    // 滚动到预览区域
    imagePreviewSection.scrollIntoView({ behavior: 'smooth' });
}

// 关闭图片预览
function closeImagePreview() {
    const imagePreviewSection = document.getElementById('imagePreviewSection');
    const canvas = document.getElementById('canvas');
    const uploadedImage = document.getElementById('uploadedImage');
    const actionButtons = document.getElementById('actionButtons');
    const processingOverlay = document.getElementById('processingOverlay');
    
    imagePreviewSection.style.display = 'none';
    canvas.style.display = 'none';
    uploadedImage.style.display = 'block';
    actionButtons.style.display = 'none';
    processingOverlay.style.display = 'none';
    
    // 显示upload-container
    showUploadContainer();
    
    // 重置变量
    originalImage = null;
    detectedFaces = null;
    processedCanvas = null;
}

// 隐藏upload-container
function hideUploadContainer() {
    const uploadContainer = document.querySelector('.upload-container');
    if (uploadContainer) {
        uploadContainer.style.display = 'none';
    }
}

// 显示upload-container
function showUploadContainer() {
    const uploadContainer = document.querySelector('.upload-container');
    if (uploadContainer) {
        uploadContainer.style.display = 'block';
    }
}

// 上传新图片
function uploadNewImage() {
    // 重置所有状态
    closeImagePreview();
    
    // 清空文件输入
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
    
    // 滚动到上传区域
    const uploadSection = document.querySelector('.upload-section');
    if (uploadSection) {
        uploadSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// 设置emoji选择器
function setupEmojiSelection() {
    const emojiOptions = document.querySelectorAll('.emoji-option');
    
    emojiOptions.forEach(option => {
        option.addEventListener('click', () => {
            // 移除所有active类
            emojiOptions.forEach(opt => opt.classList.remove('active'));
            
            // 为当前选项添加active类
            option.classList.add('active');
            
            // 更新选中的emoji样式
            selectedEmojiStyle = option.getAttribute('data-style');
        });
    });
}

// 应用emoji到人脸
async function applyEmojiToFace() {
    if (!originalImage) {
        alert('Please upload an image first.');
        return;
    }

    if (!isModelsLoaded) {
        alert('AI models are still loading. Please wait a moment.');
        return;
    }

    showLoading(true);

    // 使用setTimeout延迟耗时操作，确保UI先更新
    setTimeout(async () => {
        const startTime = Date.now();
        const minDisplayTime = 3000; // 3秒

        try {
            // 进行人脸检测
            detectedFaces = await detectFacesAndExpressions(originalImage);

            if (detectedFaces.length === 0) {
                const elapsedTime = Date.now() - startTime;
                const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

                setTimeout(() => {
                    showLoading(false);
                    alert('No faces detected in the image. Please try another photo.');
                }, remainingTime);
                return;
            }

            // 根据选择的样式绘制emoji
            await drawEmojiOnFaces(originalImage, detectedFaces);

            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

            setTimeout(() => {
                showLoading(false);
                document.getElementById('actionButtons').style.display = 'flex';
            }, remainingTime);

        } catch (error) {
            console.error('Error applying emoji:', error);

            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

            setTimeout(() => {
                showLoading(false);
                alert('Error applying emoji. Please try again.');
            }, remainingTime);
        }
    }, 50); // 延迟50毫秒，给浏览器渲染UI的时间
}

// 显示/隐藏加载状态
function showLoading(show) {
    const processingOverlay = document.getElementById('processingOverlay');
    const canvas = document.getElementById('canvas');
    const uploadedImage = document.getElementById('uploadedImage');
    const actionButtons = document.getElementById('actionButtons');
    
    if (show) {
        processingOverlay.style.display = 'flex';
        canvas.style.display = 'none';
        actionButtons.style.display = 'none';
        // 保持原始图片可见，在蒙版下方
        if (uploadedImage) {
            uploadedImage.style.display = 'block';
        }
    } else {
        processingOverlay.style.display = 'none';
        // 当蒙版隐藏时，隐藏原始图片并显示处理后的canvas
        if (processedCanvas) {
            uploadedImage.style.display = 'none';
            canvas.style.display = 'block';
        }
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