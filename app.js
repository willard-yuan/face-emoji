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
let isDragging = false;
let isResizing = false;
let isRotating = false;
let resizeMode = null;
let dragStartX, dragStartY;

// 控件显示策略配置与状态
// 配置：是否在首次添加后为所有emoji显示编辑控件
const showControlsInitially = true;
// 配置：在首次展示阶段，未选中的控件使用更淡样式
const dimUnselectedInitialControls = false;
// 运行时状态：当前是否处于“首次添加后的初始展示阶段”
let controlsInitialActive = false;

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
        // 优先使用 Pointer 事件，触控设备更稳定；旧设备回退到 Touch + Mouse
        if (window.PointerEvent) {
            canvas.addEventListener('pointerdown', handleCanvasPointerDown);
            canvas.addEventListener('pointermove', handleCanvasPointerMove);
            canvas.addEventListener('pointerup', handleCanvasPointerUp);
            canvas.addEventListener('pointerleave', handleCanvasPointerLeave);
        } else {
            // Touch 事件（防止滚动干扰）
            canvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
            canvas.addEventListener('touchend', handleCanvasTouchEnd);
            canvas.addEventListener('touchcancel', handleCanvasTouchCancel);

            // Mouse 事件作为补充
            canvas.addEventListener('mousedown', handleCanvasMouseDown);
            canvas.addEventListener('mousemove', handleCanvasMouseMove);
            canvas.addEventListener('mouseup', handleCanvasMouseUp);
            canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
        }
    }

    // 添加键盘事件监听器
    window.addEventListener('keydown', handleKeyDown);
});

// 独立挂载移动菜单的交互增强：
// 1) 点击外部区域自动关闭
// 2) 按下 Escape 键关闭
document.addEventListener('DOMContentLoaded', () => {
    try {
        const mobileToggle = document.getElementById('mobileMenuToggle');
        const mobileMenu = document.getElementById('mobileMenu');
        const toggleLabel = document.querySelector('label.btn-toggle');

        if (!mobileToggle || !mobileMenu) return;

        const closeIfOutside = (event) => {
            if (!mobileToggle.checked) return;
            const target = event.target;
            const clickedInsideMenu = mobileMenu.contains(target);
            const clickedToggleLabel = toggleLabel ? toggleLabel.contains(target) : false;
            const clickedCheckbox = target === mobileToggle;
            if (!clickedInsideMenu && !clickedToggleLabel && !clickedCheckbox) {
                mobileToggle.checked = false;
            }
        };

        document.addEventListener('click', closeIfOutside, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileToggle.checked) {
                mobileToggle.checked = false;
            }
        });
    } catch (err) {
        console.warn('Mobile menu enhancement failed:', err);
    }
});

// 设备能力与控件尺寸（移动端更易点按）
function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function getHandleMetrics() {
    const touch = isTouchDevice();
    return {
        handleSize: touch ? 22 : 14,
        deleteOffset: touch ? 20 : 16,
        rotateHandleSize: touch ? 24 : 16,
        rotateOffset: touch ? 32 : 26,
    };
}

// Pointer 事件包装：复用现有鼠标处理逻辑
function handleCanvasPointerDown(event) {
    const canvas = event.target;
    if (event.pointerId != null && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
    event.preventDefault();
    handleCanvasMouseDown(event);
}

function handleCanvasPointerMove(event) {
    event.preventDefault();
    handleCanvasMouseMove(event);
}

function handleCanvasPointerUp(event) {
    const canvas = event.target;
    if (event.pointerId != null && canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    event.preventDefault();
    handleCanvasMouseUp(event);
}

function handleCanvasPointerLeave(event) {
    event.preventDefault();
    handleCanvasMouseLeave(event);
}

// Touch 事件包装：归一化 clientX/clientY 后复用鼠标逻辑
function handleCanvasTouchStart(event) {
    event.preventDefault();
    const t = event.touches[0] || event.changedTouches[0];
    if (!t) return;
    handleCanvasMouseDown({ target: event.target, clientX: t.clientX, clientY: t.clientY });
}

function handleCanvasTouchMove(event) {
    event.preventDefault();
    const t = event.touches[0] || event.changedTouches[0];
    if (!t) return;
    handleCanvasMouseMove({ target: event.target, clientX: t.clientX, clientY: t.clientY });
}

function handleCanvasTouchEnd(event) {
    const t = (event.changedTouches && event.changedTouches[0]) || null;
    handleCanvasMouseUp({ target: event.target, clientX: t ? t.clientX : 0, clientY: t ? t.clientY : 0 });
}

function handleCanvasTouchCancel(event) {
    handleCanvasMouseLeave({ target: event.target });
}

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
    uploadArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
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

    // 首次添加后进入初始展示阶段（根据配置）
    controlsInitialActive = !!showControlsInitially;
    redrawCanvas();
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
            
            // 调整emoji大小，使其与人脸框宽度成比例
            emojiSize = box.width * 1.5; 
            
            // 将emoji定位在人脸框的中心
            x = box.x - (emojiSize - box.width) / 2;
            y = box.y - (emojiSize - box.height) / 2 - box.height * 0.1; // 向上微调

            const aspectRatio = emojiImg.naturalWidth / emojiImg.naturalHeight;
            const emojiHeight = emojiSize / aspectRatio;

            drawnEmojis.push({
                img: emojiImg,
                x: x,
                y: y,
                width: emojiSize,
                height: emojiHeight, // 使用计算出的高度
                angle: 0 // 新增：初始角度
            });
            
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

// 加载示例图片
async function loadSampleImage(imagePath) {
    try {
        // 追踪用户点击示例图片事件
        if (typeof window.va === 'function') {
            window.va('event', { 
                name: 'Sample Image Selected',
                data: { 
                    imagePath: imagePath
                }
            });
        }
        
        // 创建图片元素
        const img = new Image();
        img.onload = function() {
            originalImage = img;
            
            // 隐藏upload-container
            hideUploadContainer();
            
            // 显示图片预览
            showImagePreview(img);
            document.querySelector('.emoji-selection').style.display = 'block';
        };
        img.onerror = function() {
            console.error('Error loading sample image:', imagePath);
            alert('Error loading sample image. Please try again.');
        };
        img.src = imagePath;
        
    } catch (error) {
        console.error('Error loading sample image:', error);
        alert('Error loading sample image. Please try again.');
    }
}

// 设置emoji选择器
function setupEmojiSelection() {
    const emojiOptions = document.querySelectorAll('.emoji-option');
    
    emojiOptions.forEach((option, index) => {
        option.addEventListener('click', () => {
            selectEmojiOption(option, emojiOptions);
        });
        
        option.addEventListener('keydown', (e) => {
            handleEmojiKeyNavigation(e, option, emojiOptions, index);
        });
    });
}

function selectEmojiOption(selectedOption, allOptions) {
    // 移除所有active类和更新ARIA属性
    allOptions.forEach(opt => {
        opt.classList.remove('active');
        opt.setAttribute('aria-checked', 'false');
        opt.setAttribute('tabindex', '-1');
    });
    
    // 添加active类到当前选项并更新ARIA属性
    selectedOption.classList.add('active');
    selectedOption.setAttribute('aria-checked', 'true');
    selectedOption.setAttribute('tabindex', '0');
    
    // 更新选中的emoji样式
    selectedEmojiStyle = selectedOption.getAttribute('data-style');
}

function handleEmojiKeyNavigation(e, currentOption, allOptions, currentIndex) {
    let newIndex = currentIndex;
    
    switch(e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
            e.preventDefault();
            newIndex = (currentIndex + 1) % allOptions.length;
            break;
        case 'ArrowUp':
        case 'ArrowLeft':
            e.preventDefault();
            newIndex = (currentIndex - 1 + allOptions.length) % allOptions.length;
            break;
        case 'Enter':
        case ' ':
            e.preventDefault();
            selectEmojiOption(currentOption, allOptions);
            return;
        default:
            return;
    }
    
    // 移动焦点到新选项
    allOptions[newIndex].focus();
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
    if (!processedCanvas || !originalImage) {
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
    
    // 使用离屏画布导出，避免包含编辑控件
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = processedCanvas.width;
    exportCanvas.height = processedCanvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    // 绘制原始图片
    exportCtx.drawImage(originalImage, 0, 0);
    // 绘制所有emoji（不绘制任何控件）
    drawnEmojis.forEach(emoji => {
        exportCtx.save();
        exportCtx.translate(emoji.x + emoji.width / 2, emoji.y + emoji.height / 2);
        exportCtx.rotate(emoji.angle);
        exportCtx.drawImage(emoji.img, -emoji.width / 2, -emoji.height / 2, emoji.width, emoji.height);
        exportCtx.restore();
    });

    // 创建下载链接（基于离屏画布）
    const link = document.createElement('a');
    link.download = 'emojified-photo.png';
    link.href = exportCanvas.toDataURL('image/png');
    
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

    // 先绘制所有emoji图片
    drawnEmojis.forEach(emoji => {
        ctx.save();
        ctx.translate(emoji.x + emoji.width / 2, emoji.y + emoji.height / 2);
        ctx.rotate(emoji.angle);
        ctx.drawImage(emoji.img, -emoji.width / 2, -emoji.height / 2, emoji.width, emoji.height);
        ctx.restore();
    });

    // 控件绘制
    const { handleSize, deleteOffset, rotateHandleSize, rotateOffset } = getHandleMetrics();
    const halfHandleSize = handleSize / 2;
    const rotateHalfSize = rotateHandleSize / 2;

    if (controlsInitialActive && showControlsInitially) {
        // 初始展示阶段：为所有emoji绘制控件
        drawnEmojis.forEach(emoji => {
            ctx.save();
            ctx.translate(emoji.x + emoji.width / 2, emoji.y + emoji.height / 2);
            ctx.rotate(emoji.angle);

            // 边框样式：选中更亮，未选中更淡（可配置）
            const isSelected = selectedEmoji === emoji;
            ctx.globalAlpha = (!isSelected && dimUnselectedInitialControls) ? 0.5 : 1.0;
            ctx.strokeStyle = isSelected ? '#6c47ff' : '#333';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(-emoji.width / 2, -emoji.height / 2, emoji.width, emoji.height);

            // 手柄颜色（受透明度影响）
            ctx.fillStyle = '#ff0000';

            // 角手柄
            ctx.fillRect(-emoji.width / 2 - halfHandleSize, -emoji.height / 2 - halfHandleSize, handleSize, handleSize);
            ctx.fillRect(emoji.width / 2 - halfHandleSize, -emoji.height / 2 - halfHandleSize, handleSize, handleSize);
            ctx.fillRect(-emoji.width / 2 - halfHandleSize, emoji.height / 2 - halfHandleSize, handleSize, handleSize);
            ctx.fillRect(emoji.width / 2 - halfHandleSize, emoji.height / 2 - halfHandleSize, handleSize, handleSize);

            // 边手柄
            ctx.fillRect(-halfHandleSize, -emoji.height / 2 - halfHandleSize, handleSize, handleSize);
            ctx.fillRect(-emoji.width / 2 - halfHandleSize, -halfHandleSize, handleSize, handleSize);
            ctx.fillRect(emoji.width / 2 - halfHandleSize, -halfHandleSize, handleSize, handleSize);
            ctx.fillRect(-halfHandleSize, emoji.height / 2 - halfHandleSize, handleSize, handleSize);

            // 旋转手柄（菱形），使用独立尺寸与偏移
            {
                const ry = -emoji.height / 2 - rotateOffset;
                ctx.beginPath();
                ctx.moveTo(0, ry - rotateHalfSize);
                ctx.lineTo(rotateHalfSize, ry);
                ctx.lineTo(0, ry + rotateHalfSize);
                ctx.lineTo(-rotateHalfSize, ry);
                ctx.closePath();
                ctx.fill();
            }

            // 删除手柄（右上外侧，深色方块+白色X图标）
            const delX = emoji.width / 2 + deleteOffset - halfHandleSize;
            const delY = -emoji.height / 2 - deleteOffset - halfHandleSize;
            ctx.fillStyle = '#222';
            ctx.fillRect(delX, delY, handleSize, handleSize);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            // 画白色X（两条斜线）
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(delX + 4, delY + 4);
            ctx.lineTo(delX + handleSize - 4, delY + handleSize - 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(delX + handleSize - 4, delY + 4);
            ctx.lineTo(delX + 4, delY + handleSize - 4);
            ctx.stroke();

            ctx.restore();
            ctx.globalAlpha = 1.0;
        });
    } else if (selectedEmoji) {
        // 常规阶段：仅为选中emoji绘制控件
        ctx.save();
        ctx.translate(selectedEmoji.x + selectedEmoji.width / 2, selectedEmoji.y + selectedEmoji.height / 2);
        ctx.rotate(selectedEmoji.angle);

        ctx.strokeStyle = '#6c47ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-selectedEmoji.width / 2, -selectedEmoji.height / 2, selectedEmoji.width, selectedEmoji.height);

        ctx.fillStyle = '#ff0000';
        // 角手柄
        ctx.fillRect(-selectedEmoji.width / 2 - halfHandleSize, -selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        ctx.fillRect(selectedEmoji.width / 2 - halfHandleSize, -selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        ctx.fillRect(-selectedEmoji.width / 2 - halfHandleSize, selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        ctx.fillRect(selectedEmoji.width / 2 - halfHandleSize, selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        // 边手柄
        ctx.fillRect(-halfHandleSize, -selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        ctx.fillRect(-selectedEmoji.width / 2 - halfHandleSize, -halfHandleSize, handleSize, handleSize);
        ctx.fillRect(selectedEmoji.width / 2 - halfHandleSize, -halfHandleSize, handleSize, handleSize);
        ctx.fillRect(-halfHandleSize, selectedEmoji.height / 2 - halfHandleSize, handleSize, handleSize);
        // 旋转手柄（菱形），使用独立尺寸与偏移
        {
            const ry = -selectedEmoji.height / 2 - rotateOffset;
            ctx.beginPath();
            ctx.moveTo(0, ry - rotateHalfSize);
            ctx.lineTo(rotateHalfSize, ry);
            ctx.lineTo(0, ry + rotateHalfSize);
            ctx.lineTo(-rotateHalfSize, ry);
            ctx.closePath();
            ctx.fill();
        }

        // 删除手柄（右上外侧，深色方块+白色X图标）
        const delX = selectedEmoji.width / 2 + deleteOffset - halfHandleSize;
        const delY = -selectedEmoji.height / 2 - deleteOffset - halfHandleSize;
        ctx.fillStyle = '#222';
        ctx.fillRect(delX, delY, handleSize, handleSize);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        // 画白色X（两条斜线）
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(delX + 4, delY + 4);
        ctx.lineTo(delX + handleSize - 4, delY + handleSize - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(delX + handleSize - 4, delY + 4);
        ctx.lineTo(delX + 4, delY + handleSize - 4);
        ctx.stroke();

        ctx.restore();
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

    if (isDragging && selectedEmoji) {
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        selectedEmoji.x += dx;
        selectedEmoji.y += dy;
        dragStartX = x;
        dragStartY = y;
        redrawCanvas();
        return;
    } else if (isResizing && selectedEmoji) {
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        const minSize = 10;

        switch (resizeMode) {
            case 'bottomRight':
                selectedEmoji.width += dx;
                selectedEmoji.height += dy;
                break;
            case 'bottomLeft': {
                // 右边保持不动，左边移动
                let newWidth = selectedEmoji.width - dx;
                if (newWidth < minSize) {
                    const allowedDx = selectedEmoji.width - minSize;
                    selectedEmoji.x += allowedDx;
                    selectedEmoji.width = minSize;
                } else {
                    selectedEmoji.x += dx;
                    selectedEmoji.width = newWidth;
                }
                selectedEmoji.height += dy;
                break;
            }
            case 'topRight': {
                // 下边保持不动，上边移动
                let newHeight = selectedEmoji.height - dy;
                if (newHeight < minSize) {
                    const allowedDy = selectedEmoji.height - minSize;
                    selectedEmoji.y += allowedDy;
                    selectedEmoji.height = minSize;
                } else {
                    selectedEmoji.y += dy;
                    selectedEmoji.height = newHeight;
                }
                selectedEmoji.width += dx;
                break;
            }
            case 'topLeft': {
                let newWidth = selectedEmoji.width - dx;
                let newHeight = selectedEmoji.height - dy;
                if (newWidth < minSize) {
                    const allowedDx = selectedEmoji.width - minSize;
                    selectedEmoji.x += allowedDx;
                    selectedEmoji.width = minSize;
                } else {
                    selectedEmoji.x += dx;
                    selectedEmoji.width = newWidth;
                }
                if (newHeight < minSize) {
                    const allowedDy = selectedEmoji.height - minSize;
                    selectedEmoji.y += allowedDy;
                    selectedEmoji.height = minSize;
                } else {
                    selectedEmoji.y += dy;
                    selectedEmoji.height = newHeight;
                }
                break;
            }
            case 'left': {
                let newWidth = selectedEmoji.width - dx;
                if (newWidth < minSize) {
                    const allowedDx = selectedEmoji.width - minSize;
                    selectedEmoji.x += allowedDx;
                    selectedEmoji.width = minSize;
                } else {
                    selectedEmoji.x += dx;
                    selectedEmoji.width = newWidth;
                }
                break;
            }
            case 'right':
                selectedEmoji.width += dx;
                break;
            case 'top': {
                let newHeight = selectedEmoji.height - dy;
                if (newHeight < minSize) {
                    const allowedDy = selectedEmoji.height - minSize;
                    selectedEmoji.y += allowedDy;
                    selectedEmoji.height = minSize;
                } else {
                    selectedEmoji.y += dy;
                    selectedEmoji.height = newHeight;
                }
                break;
            }
            case 'bottom':
                selectedEmoji.height += dy;
                break;
        }

        dragStartX = x;
        dragStartY = y;
        redrawCanvas();
        return;
    } else if (isRotating && selectedEmoji) {
        const centerX = selectedEmoji.x + selectedEmoji.width / 2;
        const centerY = selectedEmoji.y + selectedEmoji.height / 2;
        const angle = Math.atan2(y - centerY, x - centerX) + Math.PI / 2;
        selectedEmoji.angle = angle;
        redrawCanvas();
        return;
    }

    // 悬停时显示方向性光标（根据可见控件与命中部位）
    const { handleSize, deleteOffset, rotateHandleSize, rotateOffset } = getHandleMetrics();
    const halfHandleSize = handleSize / 2;
    const rotateHalfSize = rotateHandleSize / 2;

    let cursor = 'default';
    for (let i = drawnEmojis.length - 1; i >= 0; i--) {
        const emoji = drawnEmojis[i];

        // 转换为局部坐标（考虑旋转）
        const centerX = emoji.x + emoji.width / 2;
        const centerY = emoji.y + emoji.height / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const cosA = Math.cos(emoji.angle);
        const sinA = Math.sin(emoji.angle);
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;

        const controlsVisible = (controlsInitialActive && showControlsInitially) || (selectedEmoji === emoji);

        if (controlsVisible) {
            // 删除手柄（右上外侧）
            const delX = emoji.width / 2 + deleteOffset - halfHandleSize;
            const delY = -emoji.height / 2 - deleteOffset - halfHandleSize;
            if (lx >= delX && lx <= delX + handleSize && ly >= delY && ly <= delY + handleSize) {
                cursor = 'pointer';
                break;
            }

            // 旋转手柄（上方正中，使用独立尺寸与偏移）
            if (lx >= -rotateHalfSize && lx <= rotateHalfSize &&
                ly >= (-emoji.height / 2 - rotateOffset - rotateHalfSize) && ly <= (-emoji.height / 2 - rotateOffset + rotateHalfSize)) {
                cursor = 'crosshair';
                break;
            }

            // 角手柄
            const onTopLeft = (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
                ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize));
            const onTopRight = (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
                ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize));
            const onBottomLeft = (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
                ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize));
            const onBottomRight = (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
                ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize));

            if (onTopLeft || onBottomRight) {
                cursor = 'nwse-resize';
                break;
            }
            if (onTopRight || onBottomLeft) {
                cursor = 'nesw-resize';
                break;
            }

            // 边手柄
            const onTop = (lx >= -halfHandleSize && lx <= halfHandleSize &&
                ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize));
            const onLeft = (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
                ly >= (-halfHandleSize) && ly <= (halfHandleSize));
            const onRight = (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
                ly >= (-halfHandleSize) && ly <= (halfHandleSize));
            const onBottom = (lx >= -halfHandleSize && lx <= halfHandleSize &&
                ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize));

            if (onTop || onBottom) {
                cursor = 'ns-resize';
                break;
            }
            if (onLeft || onRight) {
                cursor = 'ew-resize';
                break;
            }
        }

        // emoji本体区域（可拖动或点击选中）
        if (lx >= -emoji.width / 2 && lx <= emoji.width / 2 &&
            ly >= -emoji.height / 2 && ly <= emoji.height / 2) {
            cursor = 'move';
            break;
        }
    }
    canvas.style.cursor = cursor;
}

// 处理canvas鼠标离开事件
function handleCanvasMouseLeave(event) {
    // 当鼠标离开canvas区域时，清除选中状态和鼠标样式
    const canvas = event.target;
    canvas.style.cursor = 'default';
    isDragging = false;
    isResizing = false;
    isRotating = false;
    
    // if (selectedEmoji) {
    //     selectedEmoji = null;
    //     redrawCanvas();
    // }
}

// 处理canvas mousedown事件
function handleCanvasMouseDown(event) {
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // 一旦用户开始交互，退出初始展示阶段
    if (controlsInitialActive) {
        controlsInitialActive = false;
        // 不立即重绘，以便后续命中控件后统一重绘
    }

    const { handleSize, deleteOffset, rotateHandleSize, rotateOffset } = getHandleMetrics();
    const halfHandleSize = handleSize / 2;
    const rotateHalfSize = rotateHandleSize / 2;

    // 从上到下（最后绘制在最上层）查找点击目标
    for (let i = drawnEmojis.length - 1; i >= 0; i--) {
        const emoji = drawnEmojis[i];

        // 将点击点转换到emoji的局部坐标（考虑旋转）
        const centerX = emoji.x + emoji.width / 2;
        const centerY = emoji.y + emoji.height / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const cosA = Math.cos(emoji.angle);
        const sinA = Math.sin(emoji.angle);
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;

        // 删除手柄（右上外侧）
        {
            const delX = emoji.width / 2 + deleteOffset - halfHandleSize;
            const delY = -emoji.height / 2 - deleteOffset - halfHandleSize;
            const hitDelete = (lx >= delX && lx <= delX + handleSize && ly >= delY && ly <= delY + handleSize);
            if (hitDelete) {
                // 删除该emoji
                drawnEmojis.splice(i, 1);
                if (selectedEmoji === emoji) {
                    selectedEmoji = null;
                }
                redrawCanvas();
                return;
            }
        }

        // 旋转手柄（位于上方正中，使用独立尺寸与偏移）
        if (lx >= -rotateHalfSize && lx <= rotateHalfSize &&
            ly >= (-emoji.height / 2 - rotateOffset - rotateHalfSize) && ly <= (-emoji.height / 2 - rotateOffset + rotateHalfSize)) {
            selectedEmoji = emoji;
            isRotating = true;
            return;
        }

        // 角手柄检测
        if (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
            ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'topLeft';
            dragStartX = x;
            dragStartY = y;
            return;
        }

        if (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
            ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'topRight';
            dragStartX = x;
            dragStartY = y;
            return;
        }

        if (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
            ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'bottomLeft';
            dragStartX = x;
            dragStartY = y;
            return;
        }

        if (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
            ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'bottomRight';
            dragStartX = x;
            dragStartY = y;
            return;
        }

        // 边手柄检测：上、左、右、下
        // 上边中点
        if (lx >= -halfHandleSize && lx <= halfHandleSize &&
            ly >= (-emoji.height / 2 - halfHandleSize) && ly <= (-emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'top';
            dragStartX = x;
            dragStartY = y;
            return;
        }
        // 左边中点
        if (lx >= (-emoji.width / 2 - halfHandleSize) && lx <= (-emoji.width / 2 + halfHandleSize) &&
            ly >= (-halfHandleSize) && ly <= (halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'left';
            dragStartX = x;
            dragStartY = y;
            return;
        }
        // 右边中点
        if (lx >= (emoji.width / 2 - halfHandleSize) && lx <= (emoji.width / 2 + halfHandleSize) &&
            ly >= (-halfHandleSize) && ly <= (halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'right';
            dragStartX = x;
            dragStartY = y;
            return;
        }
        // 下边中点
        if (lx >= -halfHandleSize && lx <= halfHandleSize &&
            ly >= (emoji.height / 2 - halfHandleSize) && ly <= (emoji.height / 2 + halfHandleSize)) {
            selectedEmoji = emoji;
            isResizing = true;
            resizeMode = 'bottom';
            dragStartX = x;
            dragStartY = y;
            return;
        }

        // 点击emoji本体区域开始拖动
        if (lx >= -emoji.width / 2 && lx <= emoji.width / 2 &&
            ly >= -emoji.height / 2 && ly <= emoji.height / 2) {
            selectedEmoji = emoji;
            isDragging = true;
            dragStartX = x;
            dragStartY = y;
            return;
        }
    }

    // 未命中任何emoji或控件时，清除选中状态
    selectedEmoji = null;
    redrawCanvas();
}

// 处理canvas mouseup事件
function handleCanvasMouseUp(event) {
    isDragging = false;
    isResizing = false;
    isRotating = false;
    resizeMode = null;
}

// 处理canvas点击事件
function handleCanvasClick(event) {
    if (drawnEmojis.length === 0) return;

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // 查找点击的emoji
    let clickedEmoji = null;
    for (let i = drawnEmojis.length - 1; i >= 0; i--) {
        const emoji = drawnEmojis[i];
        if (x >= emoji.x && x <= emoji.x + emoji.width && y >= emoji.y && y <= emoji.y + emoji.height) {
            clickedEmoji = emoji;
            break;
        }
    }

    // 设置选中状态
    if (clickedEmoji) {
        selectedEmoji = clickedEmoji;
    } else {
        selectedEmoji = null;
    }

    redrawCanvas();
}

// 处理键盘按下事件
function handleKeyDown(event) {
    if (selectedEmoji && (event.key === 'Delete' || event.key === 'Backspace')) {
        const index = drawnEmojis.indexOf(selectedEmoji);
        if (index > -1) {
            drawnEmojis.splice(index, 1);
            selectedEmoji = null;
            redrawCanvas();
        }
    }

    // ESC键关闭图片预览
    if (event.key === 'Escape') {
        const imagePreviewSection = document.getElementById('imagePreviewSection');
        if (imagePreviewSection && imagePreviewSection.style.display !== 'none') {
            closeImagePreview();
        }
    }
    
    // Canvas键盘导航
    if (event.target.id === 'canvas') {
        const canvas = document.getElementById('canvas');
        const tooltip = document.getElementById('tooltip');
        
        switch(event.key) {
            case 'Enter':
                event.preventDefault();
                applyEmojiToFace();
                break;
            case 'Tab':
                // 让Tab键正常工作，不阻止默认行为
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                // 提供键盘导航反馈
                if (tooltip) {
                    tooltip.textContent = 'Use Enter to apply emoji to faces, Escape to close';
                    tooltip.style.display = 'block';
                    tooltip.style.left = '50%';
                    tooltip.style.top = '10px';
                    tooltip.style.transform = 'translateX(-50%)';
                    
                    // 3秒后隐藏提示
                    setTimeout(() => {
                        tooltip.style.display = 'none';
                    }, 3000);
                }
                break;
        }
    }
    
    // 删除选中的emoji
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
    // 点击后退出初始展示阶段
    if (controlsInitialActive) {
        controlsInitialActive = false;
    }