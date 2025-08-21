// 全局变量
let isModelsLoaded = false;
let originalImage = null;
let processedCanvas = null;
let selectedEmojiStyle = 'random_labubu';
let detectedFaces = null;
let drawnEmojis = [];
let selectedEmoji = null;
let progressInterval = null;
let currentProgress = 0;

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

    // 为canvas添加点击事件监听器
    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    }

    // 添加键盘事件监听器
    window.addEventListener('keydown', handleKeyDown);
});

// 加载face-api.js模型
async function loadModels() {
    try {
        console.log('Loading face-api.js models...');

        // 并行加载模型以提高性能
        const modelPromises = [
            faceapi.nets.ssdMobilenetv1.loadFromUri('./public/models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./public/models')
        ];
        
        await Promise.all(modelPromises);
        
        console.log('Models loaded successfully');
        isModelsLoaded = true;
    } catch (error) {
        console.error('Error loading models:', error);
        // 更友好的错误处理，不阻塞用户体验
        console.warn('AI models failed to load. Some features may be limited.');
        isModelsLoaded = false;
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
    
    // 设置联系我们按钮的点击事件
    const contactUsBtn = document.querySelector('.faq-contact .btn');
    if (contactUsBtn) {
        contactUsBtn.addEventListener('click', function(event) {
            event.preventDefault();
            window.location.href = 'mailto:willardyuan@gmail.com?subject=EmojiFace%20Inquiry';
        });
    }

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
        // 追踪用户上传图片事件
        if (typeof window.va === 'function') {
            window.va('event', { 
                name: 'Image Upload',
                data: { 
                    fileSize: Math.round(file.size / 1024), // KB
                    fileType: file.type 
                }
            });
        }
        
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

// 显示提示框
function showTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip || drawnEmojis.length === 0) return;

    const container = document.querySelector('.uploaded-image-container');
    const canvas = document.getElementById('canvas');
    
    if (!container || !canvas) return;

    // 将tooltip定位在容器的右上角
    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    // 相对于容器的定位
    const tooltipTop = 20; // 距离容器顶部20px
    const tooltipRight = 20; // 距离容器右侧20px

    tooltip.style.top = `${tooltipTop}px`;
    tooltip.style.right = `${tooltipRight}px`;
    tooltip.style.left = 'auto'; // 清除之前的left定位
    tooltip.innerHTML = '💡 Click to select emojis and press Delete key to remove unwanted ones';
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';

    setTimeout(() => {
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            tooltip.style.display = 'none';
        }, 300); // Corresponds to transition time
    }, 4000); // 显示4秒
}

// 在人脸上绘制表情符号
async function drawEmojiOnFaces(img, detections) {
    processedCanvas = document.getElementById('canvas');
    const ctx = processedCanvas.getContext('2d');
    
    // 设置画布尺寸
    processedCanvas.width = img.width;
    processedCanvas.height = img.height;

    // 清空之前绘制的emojis
    drawnEmojis = [];
    selectedEmoji = null;
    
    // 为每个检测到的人脸绘制表情符号
    for (const detection of detections) {
        await drawEmojiForDetection(ctx, detection);
    }

    redrawCanvas();
    showTooltip();
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
            if (selectedEmojiStyle === 'random_labubu') {
                // 为每个人脸随机选择labubu emoji
                emojiName = getRandomLabubuEmoji();
            } else if (selectedEmojiStyle === 'labubu') {
                // 为Happy Labubu选项随机选择指定的labubu emoji
                emojiName = getHappyLabubuEmoji();
            } else {
                emojiName = getEmojiByStyle(selectedEmojiStyle);
            }
        }
        
        // 创建表情图片
        const emojiImg = new Image();
        emojiImg.onload = () => {
            const box = detection.detection.box;
            
            // 计算表情符号的位置和大小
            let emojiSize, x, y;
            
            if (emojiName.includes('labubu_emoji')) {
                // 对于所有labubu emoji，使用较小的尺寸以避免耳朵覆盖人脸外区域
                emojiSize = Math.max(box.width, box.height) * 0.98;
                x = box.x + (box.width - emojiSize) / 2;
                y = box.y - emojiImg.height / 2.8;
                drawnEmojis.push({ img: emojiImg, x, y, width: emojiSize, height: emojiSize + emojiImg.height / 2.8 });
            } else {
                // 其他emoji使用原来的尺寸
                emojiSize = Math.max(box.width, box.height) * 0.95;
                x = box.x + (box.width - emojiSize) / 2;
                y = box.y + (box.height - emojiSize) / 2;
                // 存储emoji信息
                drawnEmojis.push({ img: emojiImg, x, y, width: emojiSize, height: emojiSize });
            }
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
        'labubu': 'happy_labubu',
        'random_labubu': 'random_labubu'
    };
    
    return styleMap[style] || 'neutral';
}

// 随机选择Happy Labubu emoji
function getHappyLabubuEmoji() {
    const happyLabubuEmojis = [
        'labubu_emoji2',
        'labubu_emoji3',
        'labubu_emoji5',
        'labubu_emoji8',
        'labubu_emoji10'
    ];
    
    const randomIndex = Math.floor(Math.random() * happyLabubuEmojis.length);
    return happyLabubuEmojis[randomIndex];
}

// 随机选择labubu emoji (用于Random Labubu选项)
function getRandomLabubuEmoji() {
    const labubuEmojis = [
        'labubu_emoji1',
        'labubu_emoji2',
        'labubu_emoji3',
        'labubu_emoji4',
        'labubu_emoji5',
        'labubu_emoji6',
        'labubu_emoji7',
        'labubu_emoji8',
        'labubu_emoji9',
        'labubu_emoji10',
        'labubu_emoji11'
    ];
    
    const randomIndex = Math.floor(Math.random() * labubuEmojis.length);
    return labubuEmojis[randomIndex];
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
    drawnEmojis = [];
    selectedEmoji = null;
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
    
    // 重新显示emoji选择器
    const emojiSelection = document.querySelector('.emoji-selection');
    if (emojiSelection) {
        emojiSelection.style.display = 'block';
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

    // 追踪用户点击添加emoji按钮事件
    if (typeof window.va === 'function') {
        window.va('event', { 
            name: 'Add Emoji Click',
            data: { 
                emojiStyle: selectedEmojiStyle 
            }
        });
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
                // 隐藏emoji选择器
                const emojiSelection = document.querySelector('.emoji-selection');
                if (emojiSelection) {
                    emojiSelection.style.display = 'none';
                }
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
        // 启动进度条动画
        startProgressAnimation();
    } else {
        processingOverlay.style.display = 'none';
        // 当蒙版隐藏时，隐藏原始图片并显示处理后的canvas
        if (processedCanvas) {
            uploadedImage.style.display = 'none';
            canvas.style.display = 'block';
        }
        // 停止进度条动画
        stopProgressAnimation();
    }
}

// 启动进度条动画
function startProgressAnimation() {
    const progressFill = document.querySelector('.progress-fill');
    if (!progressFill) return;
    
    // 重置进度
    currentProgress = 0;
    progressFill.style.width = '0%';
    progressFill.classList.add('processing');
    
    // 清除之前的定时器
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    // 启动进度条动画，分阶段增长
    progressInterval = setInterval(() => {
        if (currentProgress < 85) {
            // 前85%比较快速增长
            if (currentProgress < 30) {
                currentProgress += Math.random() * 8 + 2; // 2-10%的随机增长
            } else if (currentProgress < 60) {
                currentProgress += Math.random() * 5 + 1; // 1-6%的随机增长
            } else {
                currentProgress += Math.random() * 2 + 0.5; // 0.5-2.5%的缓慢增长
            }
            
            // 确保不超过85%
            currentProgress = Math.min(currentProgress, 85);
            progressFill.style.width = currentProgress + '%';
        }
        // 在85%后停止自动增长，等待处理完成
    }, 200); // 每200ms更新一次
}

// 停止进度条动画并完成
function stopProgressAnimation() {
    const progressFill = document.querySelector('.progress-fill');
    if (!progressFill) return;
    
    // 清除定时器
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // 快速完成到100%
    currentProgress = 100;
    progressFill.style.width = '100%';
    
    // 500ms后移除processing类和重置
    setTimeout(() => {
        progressFill.classList.remove('processing');
        currentProgress = 0;
        progressFill.style.width = '0%';
    }, 500);
}

// 下载处理后的图片
function downloadImage() {
    if (!processedCanvas) {
        alert('No processed image to download.');
        return;
    }
    
    // 追踪用户点击下载按钮事件
    if (typeof window.va === 'function') {
        window.va('event', { 
            name: 'Download Photo',
            data: { 
                emojiStyle: selectedEmojiStyle,
                facesDetected: detectedFaces ? detectedFaces.length : 0
            }
        });
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
                if (exampleImages[0]) exampleImages[0].src = './public/images/demo2.webp';
                if (exampleImages[1]) exampleImages[1].src = './public/images/demo1.webp';
            } else if (tabName === 'emoji') {
                // 显示表情符号版本
                if (exampleImages[0]) exampleImages[0].src = './public/images/emojified-photo2.webp';
                if (exampleImages[1]) exampleImages[1].src = './public/images/emojified-photo1.webp';
            }
        });
    });
    
    // 初始化时触发默认标签的点击事件
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        activeTab.click();
    }
}

// 重绘canvas
function redrawCanvas() {
    if (!processedCanvas || !originalImage) return;
    const ctx = processedCanvas.getContext('2d');

    // 清除canvas并绘制原始图片
    ctx.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
    ctx.drawImage(originalImage, 0, 0);

    // 绘制所有emojis
    drawnEmojis.forEach(emoji => {
        ctx.drawImage(emoji.img, emoji.x, emoji.y, emoji.width, emoji.height);
    });

    // 如果有选中的emoji，绘制高亮边框
    if (selectedEmoji) {
        ctx.strokeStyle = '#6c47ff'; // 亮紫色
        ctx.lineWidth = 4;
        ctx.strokeRect(selectedEmoji.x, selectedEmoji.y, selectedEmoji.width, selectedEmoji.height);
    }
}

// 处理canvas鼠标移动事件
function handleCanvasMouseMove(event) {
    if (drawnEmojis.length === 0) return;

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // 查找鼠标悬停的emoji
    let hoveredEmoji = null;
    for (let i = drawnEmojis.length - 1; i >= 0; i--) {
        const emoji = drawnEmojis[i];
        if (x >= emoji.x && x <= emoji.x + emoji.width && y >= emoji.y && y <= emoji.y + emoji.height) {
            hoveredEmoji = emoji;
            break;
        }
    }

    // 根据是否悬停在emoji上设置鼠标样式和选中状态
    if (hoveredEmoji) {
        canvas.style.cursor = 'pointer';
        // 只有当鼠标在emoji区域内时才设置为选中状态
        if (selectedEmoji !== hoveredEmoji) {
            selectedEmoji = hoveredEmoji;
            redrawCanvas();
        }
    } else {
        canvas.style.cursor = 'default';
        // 鼠标不在任何emoji区域时，清除选中状态
        if (selectedEmoji) {
            selectedEmoji = null;
            redrawCanvas();
        }
    }
}

// 处理canvas鼠标离开事件
function handleCanvasMouseLeave(event) {
    // 当鼠标离开canvas区域时，清除选中状态和鼠标样式
    const canvas = event.target;
    canvas.style.cursor = 'default';
    
    if (selectedEmoji) {
        selectedEmoji = null;
        redrawCanvas();
    }
}

// 处理canvas点击事件
function handleCanvasClick(event) {
    // 点击事件现在主要用于其他交互，选中状态由鼠标移动事件控制
    // 可以在这里添加其他点击相关的逻辑，比如双击编辑等
}

// 处理键盘按下事件
function handleKeyDown(event) {
    if (!selectedEmoji) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); // 防止浏览器后退

        // 从数组中移除选中的emoji
        const index = drawnEmojis.indexOf(selectedEmoji);
        if (index > -1) {
            drawnEmojis.splice(index, 1);
        }

        selectedEmoji = null;
        redrawCanvas();
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