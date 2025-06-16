document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const selectBtn = document.getElementById('select-btn');
    const resultContainer = document.getElementById('result-container');
    const originalImg = document.getElementById('original-img');
    const emojiImg = document.getElementById('emoji-img');
    const downloadBtn = document.getElementById('download-btn');
    const tryAgainBtn = document.getElementById('try-again-btn');
    const faqItems = document.querySelectorAll('.faq-item');
    const ctaButtons = document.querySelectorAll('.cta-btn');

    // Initialize
    initDragAndDrop();
    initEventListeners();
    initFaqToggle();
    initSmoothScroll();

    // Drag and Drop Functionality
    function initDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            uploadArea.classList.add('dragover');
        }

        function unhighlight() {
            uploadArea.classList.remove('dragover');
        }

        uploadArea.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) {
                handleFiles(files);
            }
        }
    }

    // Event Listeners
    function initEventListeners() {
        // File selection button
        selectBtn.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFiles(e.target.files);
            }
        });

        // Download button
        downloadBtn.addEventListener('click', downloadEmojifiedImage);

        // Try again button
        tryAgainBtn.addEventListener('click', resetUpload);

        // CTA buttons scroll to upload section
        ctaButtons.forEach(button => {
            button.addEventListener('click', () => {
                document.querySelector('.upload-section').scrollIntoView({ behavior: 'smooth' });
            });
        });
    }

    // Handle uploaded files
    function handleFiles(files) {
        const file = files[0]; // Only process the first file
        
        // Check if file is an image
        if (!file.type.match('image.*')) {
            alert('Please upload an image file (JPEG, PNG, or WebP).');
            return;
        }
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('File size exceeds 10MB. Please upload a smaller image.');
            return;
        }

        // Display original image
        const reader = new FileReader();
        reader.onload = function(e) {
            originalImg.src = e.target.result;
            
            // Simulate processing with loading animation
            showLoading();
            
            // Simulate AI processing delay (1-3 seconds)
            setTimeout(() => {
                processImage(e.target.result);
            }, Math.random() * 2000 + 1000);
        };
        reader.readAsDataURL(file);
    }

    // Simulate image processing (in a real app, this would call an AI service)
    function processImage(imageData) {
        // For demo purposes, we'll use a placeholder emoji image
        // In a real implementation, this would call an AI service API
        simulateEmojiTransformation(imageData);
    }

    // Simulate emoji transformation
    function simulateEmojiTransformation(originalImageData) {
        // Create a canvas to manipulate the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // Set canvas dimensions
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw original image
            ctx.drawImage(img, 0, 0);
            
            // Apply a simple filter effect (this is just a placeholder for the AI transformation)
            // In a real app, this would be replaced with actual AI-generated emoji overlay
            applySimpleFilter(ctx, canvas.width, canvas.height);
            
            // Convert canvas to data URL and display
            const processedImageData = canvas.toDataURL('image/png');
            emojiImg.src = processedImageData;
            
            // Hide loading, show result
            hideLoading();
            showResult();
        };
        
        img.src = originalImageData;
    }

    // Apply a simple filter effect (placeholder for AI transformation)
    function applySimpleFilter(ctx, width, height) {
        // This is a very simple placeholder effect
        // In a real app, this would be replaced with actual AI-generated emoji overlay
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Detect face-like areas (very simplified)
        // In a real app, this would use proper face detection
        const centerX = width / 2;
        const centerY = height / 3;
        const faceRadius = Math.min(width, height) / 4;
        
        // Draw a simple emoji face (very simplified)
        // In a real app, this would overlay proper emoji based on AI analysis
        ctx.save();
        
        // Draw face circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, faceRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        
        // Draw eyes
        const eyeRadius = faceRadius / 8;
        const eyeOffsetX = faceRadius / 3;
        const eyeOffsetY = faceRadius / 8;
        
        ctx.beginPath();
        ctx.arc(centerX - eyeOffsetX, centerY - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
        ctx.arc(centerX + eyeOffsetX, centerY - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        
        // Draw smile
        ctx.beginPath();
        ctx.arc(centerX, centerY + eyeOffsetY, faceRadius / 2, 0, Math.PI);
        ctx.lineWidth = faceRadius / 12;
        ctx.strokeStyle = '#000';
        ctx.stroke();
        
        ctx.restore();
    }

    // Show loading animation
    function showLoading() {
        // Create loading element if it doesn't exist
        if (!document.querySelector('.loading')) {
            const loadingEl = document.createElement('div');
            loadingEl.className = 'loading';
            loadingEl.innerHTML = `
                <div class="loading-spinner"></div>
                <p>Transforming your photo with AI magic...</p>
            `;
            uploadArea.parentNode.insertBefore(loadingEl, resultContainer);
        }
        
        // Hide upload area, show loading
        uploadArea.style.display = 'none';
        document.querySelector('.loading').style.display = 'block';
    }

    // Hide loading animation
    function hideLoading() {
        const loadingEl = document.querySelector('.loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    // Show result container
    function showResult() {
        resultContainer.style.display = 'block';
    }

    // Reset upload process
    function resetUpload() {
        // Hide result, show upload area
        resultContainer.style.display = 'none';
        uploadArea.style.display = 'block';
        
        // Clear file input
        fileInput.value = '';
    }

    // Download emojified image
    function downloadEmojifiedImage() {
        // Create a temporary link element
        const link = document.createElement('a');
        link.download = 'emojified-photo.png';
        link.href = emojiImg.src;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // FAQ accordion functionality
    function initFaqToggle() {
        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            question.addEventListener('click', () => {
                // Toggle active class
                item.classList.toggle('active');
                
                // Toggle plus/minus icon
                const icon = question.querySelector('i');
                if (item.classList.contains('active')) {
                    icon.classList.remove('fa-plus');
                    icon.classList.add('fa-minus');
                } else {
                    icon.classList.remove('fa-minus');
                    icon.classList.add('fa-plus');
                }
            });
        });
    }

    // Smooth scrolling for navigation links
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }
});