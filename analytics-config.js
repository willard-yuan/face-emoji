/**
 * Google Analytics 和 Search Console 集成配置
 * EmojiFace.US SEO 分析工具
 */

class AnalyticsConfig {
    constructor() {
        this.gaTrackingId = 'GA_MEASUREMENT_ID'; // 替换为实际的GA4测量ID
        this.gscProperty = 'https://emojiface.us/'; // Search Console属性
        
        // 关键词跟踪配置
        this.keywordTracking = {
            primary: ['mask face', 'emoji face generator', 'face ai'],
            secondary: ['labubu emoji', 'emoji face maker', 'ai face mask'],
            longTail: ['how to mask face using emoji', 'face to emoji converter', 'ai emoji face filter']
        };
        
        // 转化目标配置
        this.conversionGoals = {
            'face_upload': 'Face Upload Completed',
            'emoji_generation': 'Emoji Generated',
            'download_result': 'Result Downloaded',
            'blog_visit': 'Blog Page Visited',
            'feature_page_visit': 'Features Page Visited'
        };
    }
    
    /**
     * 初始化Google Analytics 4
     */
    initGA4() {
        // 加载gtag脚本
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${this.gaTrackingId}`;
        document.head.appendChild(script);
        
        // 初始化gtag
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        
        // 配置GA4
        gtag('config', this.gaTrackingId, {
            // 增强电子商务
            send_page_view: true,
            // 自定义参数
            custom_map: {
                'custom_parameter_1': 'user_engagement_level',
                'custom_parameter_2': 'feature_usage'
            },
            // 用户属性
            user_properties: {
                'preferred_emoji_style': 'labubu',
                'user_type': 'new_visitor'
            }
        });
        
        // 设置全局gtag函数
        window.gtag = gtag;
        
        return gtag;
    }
    
    /**
     * 跟踪页面浏览
     */
    trackPageView(pagePath, pageTitle) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'page_view', {
                page_title: pageTitle,
                page_location: window.location.href,
                page_path: pagePath,
                content_group1: this.getContentGroup(pagePath),
                custom_parameter_1: 'page_view_tracking'
            });
        }
    }
    
    /**
     * 跟踪转化事件
     */
    trackConversion(goalType, value = null) {
        if (typeof gtag !== 'undefined' && this.conversionGoals[goalType]) {
            const eventData = {
                event_category: 'conversion',
                event_label: this.conversionGoals[goalType],
                custom_parameter_2: goalType
            };
            
            if (value) {
                eventData.value = value;
            }
            
            gtag('event', 'conversion', eventData);
            
            // 同时发送自定义转化事件
            gtag('event', goalType, {
                event_category: 'user_engagement',
                event_label: this.conversionGoals[goalType],
                value: value || 1
            });
        }
    }
    
    /**
     * 跟踪搜索查询
     */
    trackSearchQuery(query, results_count = 0) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'search', {
                search_term: query,
                event_category: 'site_search',
                event_label: query,
                custom_parameter_1: 'search_tracking',
                value: results_count
            });
        }
    }
    
    /**
     * 跟踪用户互动
     */
    trackUserEngagement(action, element, value = null) {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                event_category: 'user_engagement',
                event_label: element,
                custom_parameter_2: 'engagement_tracking',
                value: value
            });
        }
    }
    
    /**
     * 跟踪文件下载
     */
    trackDownload(fileName, fileType) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'file_download', {
                event_category: 'downloads',
                event_label: fileName,
                file_extension: fileType,
                custom_parameter_1: 'download_tracking'
            });
        }
    }
    
    /**
     * 跟踪外部链接点击
     */
    trackOutboundLink(url, linkText) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'click', {
                event_category: 'outbound_links',
                event_label: url,
                transport_type: 'beacon',
                custom_parameter_1: 'outbound_tracking'
            });
        }
    }
    
    /**
     * 跟踪表单提交
     */
    trackFormSubmission(formName, success = true) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'form_submit', {
                event_category: 'forms',
                event_label: formName,
                success: success,
                custom_parameter_2: 'form_tracking'
            });
        }
    }
    
    /**
     * 跟踪错误事件
     */
    trackError(errorType, errorMessage, page) {
        if (typeof gtag !== 'undefined') {
            gtag('event', 'exception', {
                description: errorMessage,
                fatal: false,
                event_category: 'errors',
                event_label: errorType,
                page_location: page,
                custom_parameter_1: 'error_tracking'
            });
        }
    }
    
    /**
     * 获取内容分组
     */
    getContentGroup(pagePath) {
        if (pagePath.includes('blog')) return 'Blog';
        if (pagePath.includes('features')) return 'Features';
        if (pagePath.includes('how-it-works')) return 'How It Works';
        if (pagePath.includes('faq')) return 'FAQ';
        if (pagePath.includes('mask-face-labubu')) return 'Labubu';
        return 'Main';
    }
    
    /**
     * 设置用户属性
     */
    setUserProperties(properties) {
        if (typeof gtag !== 'undefined') {
            gtag('config', this.gaTrackingId, {
                user_properties: properties
            });
        }
    }
    
    /**
     * 跟踪滚动深度
     */
    trackScrollDepth() {
        let maxScroll = 0;
        const milestones = [25, 50, 75, 90, 100];
        const tracked = new Set();
        
        window.addEventListener('scroll', () => {
            const scrollPercent = Math.round(
                (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
            );
            
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                
                milestones.forEach(milestone => {
                    if (scrollPercent >= milestone && !tracked.has(milestone)) {
                        tracked.add(milestone);
                        this.trackUserEngagement('scroll', `${milestone}%`, milestone);
                    }
                });
            }
        });
    }
    
    /**
     * 跟踪页面停留时间
     */
    trackTimeOnPage() {
        const startTime = Date.now();
        
        // 页面卸载时发送停留时间
        window.addEventListener('beforeunload', () => {
            const timeOnPage = Math.round((Date.now() - startTime) / 1000);
            
            if (timeOnPage > 10) { // 只跟踪停留超过10秒的访问
                this.trackUserEngagement('time_on_page', window.location.pathname, timeOnPage);
            }
        });
        
        // 定期发送心跳事件
        setInterval(() => {
            const timeOnPage = Math.round((Date.now() - startTime) / 1000);
            if (timeOnPage % 30 === 0 && timeOnPage > 0) { // 每30秒发送一次
                this.trackUserEngagement('engagement_heartbeat', window.location.pathname, timeOnPage);
            }
        }, 30000);
    }
    
    /**
     * 自动跟踪设置
     */
    setupAutoTracking() {
        // 跟踪滚动深度
        this.trackScrollDepth();
        
        // 跟踪页面停留时间
        this.trackTimeOnPage();
        
        // 跟踪外部链接
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                const url = new URL(link.href, window.location.href);
                if (url.hostname !== window.location.hostname) {
                    this.trackOutboundLink(link.href, link.textContent);
                }
            }
        });
        
        // 跟踪表单提交
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.tagName === 'FORM') {
                const formName = form.name || form.id || 'unnamed_form';
                this.trackFormSubmission(formName);
            }
        });
        
        // 跟踪文件下载
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                const url = new URL(link.href, window.location.href);
                const pathname = url.pathname.toLowerCase();
                const downloadExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.png', '.jpg', '.jpeg', '.gif'];
                
                const isDownload = downloadExtensions.some(ext => pathname.endsWith(ext));
                if (isDownload) {
                    const fileName = pathname.split('/').pop();
                    const fileType = fileName.split('.').pop();
                    this.trackDownload(fileName, fileType);
                }
            }
        });
    }
    
    /**
     * 生成SEO性能报告
     */
    generateSEOReport() {
        const report = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
            pageLoadTime: performance.timing ? performance.timing.loadEventEnd - performance.timing.navigationStart : 0,
            keywords: this.keywordTracking,
            conversionGoals: this.conversionGoals
        };
        
        return report;
    }
    
    /**
     * 初始化所有跟踪
     */
    init() {
        // 初始化GA4
        this.initGA4();
        
        // 设置自动跟踪
        document.addEventListener('DOMContentLoaded', () => {
            this.setupAutoTracking();
            
            // 跟踪初始页面浏览
            this.trackPageView(window.location.pathname, document.title);
            
            // 生成并发送SEO报告
            const seoReport = this.generateSEOReport();
            console.log('SEO Performance Report:', seoReport);
        });
    }
}

// 使用示例
if (typeof window !== 'undefined') {
    window.AnalyticsConfig = AnalyticsConfig;
    
    // 自动初始化
    const analytics = new AnalyticsConfig();
    analytics.init();
    
    // 全局访问
    window.trackConversion = (goalType, value) => analytics.trackConversion(goalType, value);
    window.trackSearch = (query, results) => analytics.trackSearchQuery(query, results);
    window.trackEngagement = (action, element, value) => analytics.trackUserEngagement(action, element, value);
}

// Node.js环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsConfig;
}