# EmojiFace - Turn Photos into Emoji Art

一个基于AI的人脸表情识别和表情符号替换的Web应用，可以将照片中的人脸替换为对应表情的emoji。

## 功能特性

- 🎯 **AI人脸检测**: 使用face-api.js进行精确的人脸检测
- 😊 **表情识别**: 识别7种基本表情（开心、愤怒、悲伤、惊讶、恐惧、厌恶、中性）
- 🎨 **表情替换**: 自动将检测到的人脸替换为对应的emoji表情
- 📱 **响应式设计**: 支持桌面和移动设备
- 🔒 **隐私保护**: 所有处理都在本地进行，不上传到服务器
- ⚡ **即时处理**: 快速的图像处理和结果展示
- 💾 **一键下载**: 支持下载处理后的图片

## 支持的表情类型

- 😊 Happy (开心)
- 😠 Angry (愤怒) 
- 😢 Sad (悲伤)
- 😲 Surprised (惊讶)
- 😨 Fearful (恐惧)
- 🤢 Disgusted (厌恶)
- 😐 Neutral (中性)

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **AI库**: face-api.js v0.22.2
- **图像处理**: HTML5 Canvas API
- **UI设计**: 现代渐变设计，响应式布局

## 项目结构

```
emojiface5/
├── index.html              # 主页面
├── app.js                  # 主要JavaScript逻辑
├── package.json            # 项目配置
├── README.md              # 项目说明
├── public/
│   ├── emojis/            # 表情图片资源
│   │   ├── angry.png
│   │   ├── disgusted.png
│   │   ├── fearful.png
│   │   ├── happy.png
│   │   ├── neutral.png
│   │   ├── sad.png
│   │   └── surprised.png
│   ├── models/            # face-api.js模型文件
│   └── favicon.ico
└── src/
    ├── typings/           # TypeScript类型定义
    └── utils/             # 工具函数
        └── drawEmoji.ts   # 表情绘制逻辑
```

## 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd emojiface5
```

### 2. 启动本地服务器
```bash
# 使用Python (推荐)
python3 -m http.server 8000

# 或使用npm
npm start
```

### 3. 访问应用
打开浏览器访问: `http://localhost:8000`

## 使用方法

1. **上传照片**: 点击上传区域或拖拽图片文件
2. **AI处理**: 系统自动检测人脸和识别表情
3. **查看结果**: 人脸将被替换为对应的emoji表情
4. **下载图片**: 点击下载按钮保存处理后的图片

## 支持的文件格式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- 最大文件大小: 10MB

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## 开发说明

### 核心组件

1. **人脸检测**: 使用face-api.js的TinyFaceDetector模型
2. **表情识别**: 使用face-api.js的FaceExpressionNet模型
3. **图像处理**: HTML5 Canvas进行图像绘制和合成
4. **UI交互**: 原生JavaScript处理用户交互

### 主要函数

- `loadModels()`: 加载AI模型
- `processImage()`: 处理上传的图片
- `detectFacesAndExpressions()`: 检测人脸和表情
- `drawEmojiOnFaces()`: 在人脸位置绘制emoji
- `downloadImage()`: 下载处理后的图片

## 性能优化

- 使用TinyFaceDetector模型以提高检测速度
- 异步加载和处理，避免阻塞UI
- 图片尺寸自适应，优化内存使用
- CDN加载face-api.js库

## 隐私和安全

- 所有图片处理都在客户端本地进行
- 不会上传任何图片到服务器
- 不收集或存储用户数据
- 支持HTTPS部署

## 许可证

MIT License - 详见 LICENSE 文件

## 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至项目维护者

---

**EmojiFace** - 让你的照片更有趣！ 🎉