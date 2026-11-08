// 全局变量
let isModelsLoaded = false;
let originalImage = null;
let processedCanvas = null;
let selectedEmojiStyle = 'random_labubu';
// Plan A：选中精确表情时保存其文件名，智能模式下为空字符串。
let selectedEmojiPreset = '';
// 人类可读的选中项名称，随结果一起传给 result.html 展示。
let selectedEmojiLabel = 'Auto Labubu';
let detectedFaces = null;
let drawnEmojis = [];
let selectedEmoji = null;
// 处理中状态：软取消、延迟/慢提示定时器、任务编号、焦点归还
let isProcessing = false;
let processingCancelled = false;
let processingShowTimer = null;
let processingSlowTimer = null;
let processingRunId = 0;
let lastFocusedElement = null;
let applyHintTimer = null;
let modelLoadFailed = false;
let processingShownAt = 0;
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
document.addEventListener('DOMContentLoaded', () => {
    // 先绑定全部交互，模型放后台加载：首屏不再出现"点了没反应"的空白期
    setupEventListeners();
    setupTabSwitching();
    setupEmojiSelection();
    
    // 关闭按钮与应用按钮已在 HTML 上通过 onclick 绑定，此处不再重复挂载

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

    updateModelReadiness();
    loadModels().finally(updateModelReadiness);
});

// 示例图的循环滚动完全由 CSS 驱动（两组镜像 + translateX(-50%)），
// 不在这里做任何 DOM 操作，避免外部脚本缓存/加载时序导致动画不启动。

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
    modelLoadFailed = false;
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
        modelLoadFailed = true;
    }
}

// 设置事件监听器
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');

    const processingCancel = document.getElementById('processingCancel');
    if (processingCancel) {
        processingCancel.addEventListener('click', cancelProcessing);
    }

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
        
        // 精确表情优先；文件名来自静态 DOM，只允许安全字符，避免路径注入。
        if (selectedEmojiStyle === 'preset' && /^[a-zA-Z0-9_-]+$/.test(selectedEmojiPreset)) {
            emojiName = selectedEmojiPreset;
        // 根据选择的样式决定emoji
        } else if (selectedEmojiStyle === 'auto') {
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
    // labubu / random_labubu 已在调用处单独处理，这里只保留旧的通用样式映射。
    const styleMap = {
        'happy': 'blush',
        'funny': 'stuck_out_tongue_winking_eye',
        'cool': 'sunglasses'
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
    if (isProcessing) cancelProcessing();

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

// 设置emoji选择器（Plan A：3 个智能模式 + 3 组紧凑精确表情网格）
function getEmojiOptions() {
    return Array.from(document.querySelectorAll('.emoji-chooser [data-style]'));
}

function getEmojiOptionLabel(option) {
    // aria-label 已经是给用户看的名字；智能模式带破折号说明，只取前半段。
    const label = option.getAttribute('aria-label') || '';
    return label.split('—')[0].trim() || option.getAttribute('data-emoji') || 'Emoji';
}

function setupEmojiSelection() {
    const chooser = document.getElementById('emojiChooser');
    if (!chooser) return;

    const options = getEmojiOptions();
    options.forEach(option => {
        option.addEventListener('click', () => selectEmojiOption(option, options));
        option.addEventListener('keydown', e => handleEmojiKeyNavigation(e, option, options));
    });

    // 显式同步一次，保证 HTML 默认态、全局变量与「Selected」行三者一致。
    const initial = chooser.querySelector('.emoji-mode.active, .emoji-tile.active') || options[0];
    if (initial) selectEmojiOption(initial, options, false);
}

function selectEmojiOption(selectedOption, allOptions, announce = true) {
    // 模式和所有精确表情共用一个 radiogroup，跨组互斥。
    allOptions.forEach(opt => {
        opt.classList.remove('active');
        opt.setAttribute('aria-checked', 'false');
        opt.setAttribute('tabindex', '-1');
    });

    selectedOption.classList.add('active');
    selectedOption.setAttribute('aria-checked', 'true');
    selectedOption.setAttribute('tabindex', '0');

    selectedEmojiStyle = selectedOption.getAttribute('data-style') || 'random_labubu';
    selectedEmojiPreset = selectedEmojiStyle === 'preset'
        ? (selectedOption.getAttribute('data-emoji') || '')
        : '';
    selectedEmojiLabel = getEmojiOptionLabel(selectedOption);

    const label = document.getElementById('emojiSelectedLabel');
    if (label) label.textContent = 'Selected: ' + selectedEmojiLabel;

    if (announce && typeof window.va === 'function') {
        window.va('event', {
            name: 'Emoji Style Selected',
            data: {
                emojiStyle: selectedEmojiStyle,
                emojiPreset: selectedEmojiPreset
            }
        });
    }
}

function moveEmojiFocus(target, allOptions) {
    if (!target) return;
    allOptions.forEach(opt => opt.setAttribute('tabindex', '-1'));
    target.setAttribute('tabindex', '0');
    target.focus();
}

// 用实际布局推算列数，响应式下键盘上下移动才能对齐视觉行。
function gridColumnCount(grid) {
    const tiles = Array.from(grid.querySelectorAll('.emoji-tile'));
    if (tiles.length < 2) return tiles.length || 1;
    const firstTop = tiles[0].getBoundingClientRect().top;
    let cols = 0;
    for (const tile of tiles) {
        if (Math.abs(tile.getBoundingClientRect().top - firstTop) > 2) break;
        cols++;
    }
    return Math.max(1, cols);
}

function handleEmojiKeyNavigation(e, currentOption, allOptions) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectEmojiOption(currentOption, allOptions);
        return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) === -1) return;
    e.preventDefault();

    const modes = Array.from(document.querySelectorAll('.emoji-chooser .emoji-mode'));
    const grids = Array.from(document.querySelectorAll('.emoji-chooser .emoji-grid'));
    const globalIndex = allOptions.indexOf(currentOption);

    // 智能模式行：左右在行内循环，向下进入第一组精确表情。
    if (!currentOption.classList.contains('emoji-tile')) {
        const index = modes.indexOf(currentOption);
        if (e.key === 'ArrowLeft') {
            moveEmojiFocus(modes[(index - 1 + modes.length) % modes.length], allOptions);
        } else if (e.key === 'ArrowRight') {
            moveEmojiFocus(modes[(index + 1) % modes.length], allOptions);
        } else if (e.key === 'ArrowDown') {
            const firstTiles = grids.length
                ? Array.from(grids[0].querySelectorAll('.emoji-tile')) : [];
            moveEmojiFocus(firstTiles[Math.min(index, firstTiles.length - 1)], allOptions);
        } else {
            moveEmojiFocus(allOptions[allOptions.length - 1], allOptions);
        }
        return;
    }

    const grid = currentOption.closest('.emoji-grid');
    const tiles = Array.from(grid.querySelectorAll('.emoji-tile'));
    const pos = tiles.indexOf(currentOption);
    const cols = gridColumnCount(grid);
    const gridIndex = grids.indexOf(grid);

    // 左右按 DOM 顺序连续移动，可自然跨到相邻分组。
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const next = globalIndex + (e.key === 'ArrowRight' ? 1 : -1);
        moveEmojiFocus(allOptions[(next + allOptions.length) % allOptions.length], allOptions);
        return;
    }

    if (e.key === 'ArrowUp') {
        if (pos - cols >= 0) {
            moveEmojiFocus(tiles[pos - cols], allOptions);
        } else if (gridIndex > 0) {
            const prevGrid = grids[gridIndex - 1];
            const prevTiles = Array.from(prevGrid.querySelectorAll('.emoji-tile'));
            const prevCols = gridColumnCount(prevGrid);
            const lastRowStart = Math.floor((prevTiles.length - 1) / prevCols) * prevCols;
            moveEmojiFocus(prevTiles[Math.min(lastRowStart + (pos % cols), prevTiles.length - 1)], allOptions);
        } else {
            moveEmojiFocus(modes[Math.min(pos % cols, modes.length - 1)], allOptions);
        }
        return;
    }

    // ArrowDown：跨出当前网格时落到下一组同一列，最后一组回到模式行。
    if (pos + cols < tiles.length) {
        moveEmojiFocus(tiles[pos + cols], allOptions);
    } else if (gridIndex < grids.length - 1) {
        const nextTiles = Array.from(grids[gridIndex + 1].querySelectorAll('.emoji-tile'));
        moveEmojiFocus(nextTiles[Math.min(pos % cols, nextTiles.length - 1)], allOptions);
    } else {
        moveEmojiFocus(modes[0], allOptions);
    }
}

// 应用emoji到人脸
async function applyEmojiToFace() {
    if (isProcessing) return;

    if (!originalImage) {
        showApplyHint('Please upload an image first.');
        return;
    }

    if (!isModelsLoaded) {
        showApplyHint(modelLoadFailed
            ? 'Face detection failed to load. Please reload the page.'
            : 'Still getting ready — one moment.');
        return;
    }

    // 追踪用户点击添加emoji按钮事件
    if (typeof window.va === 'function') {
        window.va('event', {
            name: 'Add Emoji Click',
            data: {
                emojiStyle: selectedEmojiStyle,
                emojiPreset: selectedEmojiPreset
            }
        });
    }

    beginProcessing();

    try {
        setProcessingStage('detect');
        const faces = await detectFacesAndExpressions(originalImage);
        if (isStaleProcessing()) return;

        if (!faces || faces.length === 0) {
            showProcessingError(
                'No faces found',
                'Try a photo with a clear, front-facing face.',
                'Choose another photo',
                'choose'
            );
            return;
        }

        detectedFaces = faces;

        setProcessingStage('draw');
        await drawEmojiOnFaces(originalImage, detectedFaces);
        if (isStaleProcessing()) return;

        setProcessingStage('done');
        // 仅当浮层真的显示过且不足 400ms 时补足，避免一闪而过；
        // 浮层从未出现（快任务）则零额外延迟，直接结束。
        const shownFor = processingShownAt ? Date.now() - processingShownAt : Infinity;
        if (shownFor < 400) {
            await wait(400 - shownFor);
            if (isStaleProcessing()) return;
        }

        endProcessing();

        // 默认把结果放到独立、可索引的 result.html；存储或跳转失败时
        // 自动退回原来的同页结果，保证主流程不中断。
        if (!isClassicResultMode()) {
            try {
                if (await openResultPage()) return;
            } catch (error) {
                reportHandoffFailure('unexpected-error', error);
            }
        }

        const actionButtons = document.getElementById('actionButtons');
        if (actionButtons) actionButtons.style.display = 'flex';
        showResultPageFallbackLink();
        const emojiSelection = document.querySelector('.emoji-selection');
        if (emojiSelection) emojiSelection.style.display = 'none';
    } catch (error) {
        console.error('Error applying emoji:', error);
        if (isStaleProcessing()) return;
        showProcessingError(
            'Something went wrong',
            'We could not process this photo. You can try again.',
            'Try again',
            'retry'
        );
    }
}

// 处理中状态机：真实阶段 + 软取消 + 内联错误态
const PROCESSING_STAGES = ['detect', 'draw', 'done'];
const PROCESSING_LABELS = {
    detect: 'Finding faces',
    draw: 'Placing emojis',
    done: 'Almost done'
};

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clearProcessingTimers() {
    clearTimeout(processingShowTimer);
    clearTimeout(processingSlowTimer);
    processingShowTimer = null;
    processingSlowTimer = null;
}

function isStaleProcessing() {
    return processingCancelled || !isProcessing;
}

function beginProcessing() {
    isProcessing = true;
    processingCancelled = false;
    const runId = ++processingRunId;

    clearProcessingTimers();
    hideProcessingError();
    setProcessingStage('detect');

    const slowNote = document.getElementById('processingSlow');
    if (slowNote) slowNote.hidden = true;

    // 延迟显示：快任务根本不出现浮层，避免闪烁
    processingShowTimer = setTimeout(() => {
        if (runId === processingRunId && isProcessing) showProcessing(true);
    }, 200);

    // 只有真的慢下来才提示，不做任何时间承诺
    processingSlowTimer = setTimeout(() => {
        if (runId === processingRunId && isProcessing) {
            const note = document.getElementById('processingSlow');
            if (note) note.hidden = false;
        }
    }, 8000);
}

function endProcessing() {
    clearProcessingTimers();
    processingRunId++; // 让仍在途的异步结果失效
    isProcessing = false;
    showProcessing(false);
}

function cancelProcessing() {
    if (!isProcessing) return;
    processingCancelled = true;
    endProcessing();
}

function setProcessingStage(stage) {
    const index = PROCESSING_STAGES.indexOf(stage);

    document.querySelectorAll('.stage-chip').forEach(chip => {
        const i = PROCESSING_STAGES.indexOf(chip.dataset.stage);
        chip.classList.toggle('is-active', i === index);
        chip.classList.toggle('is-done', i < index);
        if (i === index) chip.setAttribute('aria-current', 'step');
        else chip.removeAttribute('aria-current');
    });

    document.querySelectorAll('.stage-segment').forEach((segment, i) => {
        segment.classList.toggle('is-active', i === index);
        segment.classList.toggle('is-done', i < index);
    });

    const track = document.getElementById('processingTrack');
    if (track) {
        track.setAttribute('aria-valuenow', String(index + 1));
        track.setAttribute('aria-valuetext', PROCESSING_LABELS[stage] || 'Working');
    }

    const heading = document.getElementById('processingHeading');
    if (heading) heading.textContent = PROCESSING_LABELS[stage] || 'Working';
    const live = document.getElementById('processingLive');
    if (live) live.textContent = PROCESSING_LABELS[stage] || 'Working';
}

function hideProcessingError() {
    const box = document.getElementById('processingError');
    const stages = document.getElementById('processingStages');
    const track = document.getElementById('processingTrack');
    const note = document.getElementById('processingNote');
    if (box) box.hidden = true;
    if (stages) stages.hidden = false;
    if (track) track.hidden = false;
    if (note) note.hidden = false;
}

function showProcessingError(title, message, actionLabel, action) {
    // 出错时浮层必须立即可见，即使 200ms 延迟还没到
    showProcessing(true);
    clearTimeout(processingShowTimer);

    const heading = document.getElementById('processingHeading');
    if (heading) heading.textContent = title;
    const live = document.getElementById('processingLive');
    if (live) live.textContent = title + '. ' + message;

    const stages = document.getElementById('processingStages');
    const track = document.getElementById('processingTrack');
    const note = document.getElementById('processingNote');
    const slowNote = document.getElementById('processingSlow');
    if (stages) stages.hidden = true;
    if (track) track.hidden = true;
    if (note) note.hidden = true;
    if (slowNote) slowNote.hidden = true;

    const box = document.getElementById('processingError');
    const titleEl = document.getElementById('processingErrorTitle');
    const descEl = document.getElementById('processingErrorDesc');
    const actionBtn = document.getElementById('processingErrorAction');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (actionBtn) {
        actionBtn.textContent = actionLabel;
        actionBtn.onclick = () => {
            endProcessing();
            if (action === 'retry') applyEmojiToFace();
            else closeImagePreview();
        };
    }
    if (box) box.hidden = false;
    if (actionBtn) actionBtn.focus();
}

function showProcessing(show) {
    const overlay = document.getElementById('processingOverlay');
    if (!overlay) return;
    const canvas = document.getElementById('canvas');
    const uploadedImage = document.getElementById('uploadedImage');
    const actionButtons = document.getElementById('actionButtons');

    if (show) {
        if (overlay.style.display !== 'flex') {
            lastFocusedElement = document.activeElement;
        }
        const thumb = document.getElementById('processingThumb');
        if (thumb && uploadedImage && uploadedImage.src) thumb.src = uploadedImage.src;

        overlay.style.display = 'flex';
        processingShownAt = Date.now(); // 记录真实展示时刻，用于避免浮层一闪而过
        overlay.setAttribute('aria-busy', 'true');
        if (canvas) canvas.style.display = 'none';
        if (actionButtons) actionButtons.style.display = 'none';
        if (uploadedImage) uploadedImage.style.display = 'block';

        setSiblingsInert(overlay, true);
        const cancelBtn = document.getElementById('processingCancel');
        if (cancelBtn) cancelBtn.focus();
    } else {
        overlay.style.display = 'none';
        processingShownAt = 0;
        overlay.setAttribute('aria-busy', 'false');
        if (processedCanvas && uploadedImage && canvas) {
            uploadedImage.style.display = 'none';
            canvas.style.display = 'block';
        }
        setSiblingsInert(overlay, false);
        if (lastFocusedElement && document.contains(lastFocusedElement)) {
            try { lastFocusedElement.focus(); } catch (e) { /* 元素可能已不可聚焦 */ }
        }
        lastFocusedElement = null;
    }
}

function setSiblingsInert(overlay, on) {
    const parent = overlay.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach(child => {
        if (child === overlay) return;
        if (on) {
            child.setAttribute('inert', '');
            child.setAttribute('aria-hidden', 'true');
        } else {
            child.removeAttribute('inert');
            child.removeAttribute('aria-hidden');
        }
    });
}

function updateModelReadiness() {
    const box = document.getElementById('uploadReadiness');
    const text = document.getElementById('uploadReadinessText');
    const applyBtn = document.getElementById('emojiApplyBtn');
    if (!box || !text) return;

    if (isModelsLoaded) {
        box.hidden = true;
        box.classList.remove('is-error');
        if (applyBtn) applyBtn.disabled = false;
    } else if (modelLoadFailed) {
        box.hidden = false;
        box.classList.add('is-error');
        text.textContent = 'Face detection unavailable — please reload the page';
        if (applyBtn) applyBtn.disabled = true;
    } else {
        box.hidden = false;
        box.classList.remove('is-error');
        text.textContent = 'Getting ready — you can pick a photo now';
        if (applyBtn) applyBtn.disabled = true;
    }
}

function showApplyHint(message) {
    const hint = document.getElementById('applyHint');
    if (!hint) return;
    hint.textContent = message;
    hint.hidden = false;
    clearTimeout(applyHintTimer);
    applyHintTimer = setTimeout(() => { hint.hidden = true; }, 4000);
}

// 合成「干净」的结果画布：只含原图 + emoji，不含编辑控件。
// 下载按钮与结果页共用，避免两处绘制逻辑不一致。
function buildExportCanvas() {
    if (!processedCanvas || !originalImage) return null;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = processedCanvas.width;
    exportCanvas.height = processedCanvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.drawImage(originalImage, 0, 0);
    drawnEmojis.forEach(emoji => {
        exportCtx.save();
        exportCtx.translate(emoji.x + emoji.width / 2, emoji.y + emoji.height / 2);
        exportCtx.rotate(emoji.angle);
        exportCtx.drawImage(emoji.img, -emoji.width / 2, -emoji.height / 2, emoji.width, emoji.height);
        exportCtx.restore();
    });
    return exportCanvas;
}

// 结果页模式：把结果以 Blob 存到本地，然后在当前标签跳转。
// 图片始终留在设备里，延续 "Your photo stays on this device" 的隐私承诺。
// 回滚开关：localStorage.setItem('emojiResultMode', 'classic')
function reportHandoffFailure(reason, error) {
    console.warn('[EmojiFace] Result page hand-off unavailable: ' + reason + '. Showing the inline result instead.', error || '');
    try {
        if (typeof window.va === 'function') {
            window.va('event', { name: 'Result Handoff Failed', data: { reason: reason } });
        }
    } catch (e) { /* analytics must never break the flow */ }
}

// 旧标签页 / 启发式缓存可能让页面仍跑着旧版 index.html（没有 result-store.js），
// 或该脚本被扩展 / 网络拦截。此时补载一次，避免静默退回同页结果。
function ensureResultStore() {
    if (window.EmojiResultStore) return Promise.resolve(true);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'result-store.js?v=20261108c';
        script.onload = () => resolve(Boolean(window.EmojiResultStore));
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
    });
}

// hand-off 失败时仍给用户一个进入结果页的入口，避免第二次 page_view 全丢。
function showResultPageFallbackLink() {
    const box = document.getElementById('actionButtons');
    if (!box || document.getElementById('resultPageFallbackLink')) return;
    const link = document.createElement('a');
    link.id = 'resultPageFallbackLink';
    link.className = 'btn';
    link.href = 'result.html';
    link.textContent = 'Save & edit guide';
    link.setAttribute('aria-label', 'Open the result page with save and edit instructions');
    box.appendChild(link);
}

async function openResultPage() {
    const exportCanvas = buildExportCanvas();
    if (!exportCanvas) {
        reportHandoffFailure('no-export-canvas');
        return false;
    }

    const resultBlob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
    if (!resultBlob) {
        reportHandoffFailure('canvas-toblob-null');
        return false;
    }
    if (!await ensureResultStore()) {
        reportHandoffFailure('result-store-unavailable');
        return false;
    }

    // 原图用作结果页可编辑画布的底图与 before/after 对比。
    // 用离屏 canvas 重绘而非 fetch(originalImage.src)：blob:/data: URL、
    // 缓存策略与 CORS 都不会让这一步失败。
    let originalBlob = null;
    try {
        if (originalImage) {
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = originalImage.naturalWidth || originalImage.width;
            originalCanvas.height = originalImage.naturalHeight || originalImage.height;
            originalCanvas.getContext('2d').drawImage(originalImage, 0, 0);
            originalBlob = await new Promise(resolve => originalCanvas.toBlob(resolve, 'image/png'));
        }
    } catch (e) { /* optional */ }

    // 把每个 emoji 图层序列化，结果页据此重建可拖拽 / 缩放 / 旋转 / 删除的编辑态。
    const emojis = drawnEmojis.map(emoji => ({
        src: emoji.img.src,
        x: emoji.x,
        y: emoji.y,
        width: emoji.width,
        height: emoji.height,
        angle: emoji.angle
    }));

    try {
        await window.EmojiResultStore.saveResult({
            resultBlob: resultBlob,
            originalBlob: originalBlob,
            style: selectedEmojiStyle,
            styleLabel: selectedEmojiLabel,
            preset: selectedEmojiPreset,
            faces: detectedFaces ? detectedFaces.length : 0,
            width: exportCanvas.width,
            height: exportCanvas.height,
            emojis: emojis
        });
    } catch (error) {
        // 隐私模式 / IndexedDB 被禁用 / 存储配额不足：保留同页结果，不打断用户。
        reportHandoffFailure('indexeddb-write-failed', error);
        return false;
    }

    window.location.assign('result.html');
    return true;
}

function isClassicResultMode() {
    try {
        const classic = localStorage.getItem('emojiResultMode') === 'classic';
        if (classic) {
            console.info('[EmojiFace] Classic inline result mode is active. Run localStorage.removeItem(\'emojiResultMode\') to restore the result page.');
        }
        return classic;
    } catch (e) { return false; }
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
                emojiPreset: selectedEmojiPreset,
                facesDetected: detectedFaces ? detectedFaces.length : 0
            }
        });
    }
    
    // 使用离屏画布导出，避免包含编辑控件
    const exportCanvas = buildExportCanvas();

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
    // 处理中优先响应 Esc：取消当前任务，而不是关闭整个预览
    if (event.key === 'Escape' && isProcessing) {
        event.preventDefault();
        cancelProcessing();
        return;
    }

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