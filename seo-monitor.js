/**
 * SEO监控脚本 - EmojiFace.US
 * 用于监控网站SEO健康状况和关键词排名
 */

class SEOMonitor {
    constructor() {
        this.targetKeywords = [
            'mask face',
            'emoji face generator',
            'face ai',
            'labubu emoji',
            'emoji face maker',
            'ai face mask',
            'face to emoji',
            'emoji face filter'
        ];
        
        this.siteUrl = 'https://EmojiFace.US';
        this.checkInterval = 24 * 60 * 60 * 1000; // 24小时
    }
    
    /**
     * 检查页面SEO基础元素
     */
    checkPageSEO() {
        const results = {
            title: this.checkTitle(),
            metaDescription: this.checkMetaDescription(),
            headings: this.checkHeadings(),
            images: this.checkImages(),
            internalLinks: this.checkInternalLinks(),
            structuredData: this.checkStructuredData(),
            performance: this.checkPerformance()
        };
        
        return results;
    }
    
    /**
     * 检查页面标题
     */
    checkTitle() {
        const title = document.title;
        const hasKeyword = this.targetKeywords.some(keyword => 
            title.toLowerCase().includes(keyword.toLowerCase())
        );
        
        return {
            content: title,
            length: title.length,
            hasKeyword: hasKeyword,
            optimal: title.length >= 30 && title.length <= 60 && hasKeyword,
            score: this.calculateTitleScore(title)
        };
    }
    
    /**
     * 检查Meta描述
     */
    checkMetaDescription() {
        const metaDesc = document.querySelector('meta[name="description"]');
        const content = metaDesc ? metaDesc.getAttribute('content') : '';
        const hasKeyword = this.targetKeywords.some(keyword => 
            content.toLowerCase().includes(keyword.toLowerCase())
        );
        
        return {
            content: content,
            length: content.length,
            hasKeyword: hasKeyword,
            optimal: content.length >= 120 && content.length <= 160 && hasKeyword,
            score: this.calculateDescriptionScore(content)
        };
    }
    
    /**
     * 检查标题结构
     */
    checkHeadings() {
        const headings = {
            h1: document.querySelectorAll('h1'),
            h2: document.querySelectorAll('h2'),
            h3: document.querySelectorAll('h3'),
            h4: document.querySelectorAll('h4'),
            h5: document.querySelectorAll('h5'),
            h6: document.querySelectorAll('h6')
        };
        
        const h1Count = headings.h1.length;
        const h1HasKeyword = h1Count > 0 && this.targetKeywords.some(keyword => 
            headings.h1[0].textContent.toLowerCase().includes(keyword.toLowerCase())
        );
        
        return {
            h1Count: h1Count,
            h1HasKeyword: h1HasKeyword,
            totalHeadings: Object.values(headings).reduce((sum, nodes) => sum + nodes.length, 0),
            structure: this.analyzeHeadingStructure(headings),
            score: this.calculateHeadingScore(headings)
        };
    }
    
    /**
     * 检查图片优化
     */
    checkImages() {
        const images = document.querySelectorAll('img');
        let withAlt = 0;
        let withKeywords = 0;
        
        images.forEach(img => {
            const alt = img.getAttribute('alt');
            if (alt) {
                withAlt++;
                if (this.targetKeywords.some(keyword => 
                    alt.toLowerCase().includes(keyword.toLowerCase())
                )) {
                    withKeywords++;
                }
            }
        });
        
        return {
            total: images.length,
            withAlt: withAlt,
            withKeywords: withKeywords,
            altOptimization: images.length > 0 ? (withAlt / images.length) * 100 : 100,
            keywordOptimization: withAlt > 0 ? (withKeywords / withAlt) * 100 : 0,
            score: this.calculateImageScore(images.length, withAlt, withKeywords)
        };
    }
    
    /**
     * 检查内部链接
     */
    checkInternalLinks() {
        const links = document.querySelectorAll('a[href]');
        let internalLinks = 0;
        let keywordAnchors = 0;
        
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && (href.startsWith('/') || href.includes(this.siteUrl))) {
                internalLinks++;
                const anchorText = link.textContent.toLowerCase();
                if (this.targetKeywords.some(keyword => 
                    anchorText.includes(keyword.toLowerCase())
                )) {
                    keywordAnchors++;
                }
            }
        });
        
        return {
            total: links.length,
            internal: internalLinks,
            keywordAnchors: keywordAnchors,
            internalRatio: links.length > 0 ? (internalLinks / links.length) * 100 : 0,
            score: this.calculateLinkScore(internalLinks, keywordAnchors)
        };
    }
    
    /**
     * 检查结构化数据
     */
    checkStructuredData() {
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        const schemas = [];
        
        jsonLdScripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                schemas.push(data['@type'] || 'Unknown');
            } catch (e) {
                console.warn('Invalid JSON-LD:', e);
            }
        });
        
        return {
            count: jsonLdScripts.length,
            schemas: schemas,
            hasOrganization: schemas.includes('Organization'),
            hasWebsite: schemas.includes('WebSite'),
            hasFAQ: schemas.includes('FAQPage'),
            score: this.calculateStructuredDataScore(schemas)
        };
    }
    
    /**
     * 检查页面性能
     */
    checkPerformance() {
        const navigation = performance.getEntriesByType('navigation')[0];
        const loadTime = navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0;
        
        return {
            loadTime: loadTime,
            domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : 0,
            firstContentfulPaint: this.getFirstContentfulPaint(),
            score: this.calculatePerformanceScore(loadTime)
        };
    }
    
    /**
     * 获取首次内容绘制时间
     */
    getFirstContentfulPaint() {
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        return fcp ? fcp.startTime : 0;
    }
    
    /**
     * 计算各项得分
     */
    calculateTitleScore(title) {
        let score = 0;
        if (title.length >= 30 && title.length <= 60) score += 40;
        if (this.targetKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()))) score += 60;
        return Math.min(score, 100);
    }
    
    calculateDescriptionScore(description) {
        let score = 0;
        if (description.length >= 120 && description.length <= 160) score += 40;
        if (this.targetKeywords.some(k => description.toLowerCase().includes(k.toLowerCase()))) score += 60;
        return Math.min(score, 100);
    }
    
    calculateHeadingScore(headings) {
        let score = 0;
        if (headings.h1.length === 1) score += 30;
        if (headings.h1.length > 0 && this.targetKeywords.some(k => 
            headings.h1[0].textContent.toLowerCase().includes(k.toLowerCase())
        )) score += 40;
        if (headings.h2.length > 0) score += 30;
        return Math.min(score, 100);
    }
    
    calculateImageScore(total, withAlt, withKeywords) {
        if (total === 0) return 100;
        const altScore = (withAlt / total) * 70;
        const keywordScore = withAlt > 0 ? (withKeywords / withAlt) * 30 : 0;
        return Math.min(altScore + keywordScore, 100);
    }
    
    calculateLinkScore(internal, keywordAnchors) {
        let score = 0;
        if (internal > 0) score += 50;
        if (keywordAnchors > 0) score += 50;
        return Math.min(score, 100);
    }
    
    calculateStructuredDataScore(schemas) {
        let score = 0;
        if (schemas.length > 0) score += 25;
        if (schemas.includes('Organization')) score += 25;
        if (schemas.includes('WebSite')) score += 25;
        if (schemas.includes('FAQPage')) score += 25;
        return Math.min(score, 100);
    }
    
    calculatePerformanceScore(loadTime) {
        if (loadTime < 1000) return 100;
        if (loadTime < 2000) return 80;
        if (loadTime < 3000) return 60;
        if (loadTime < 5000) return 40;
        return 20;
    }
    
    /**
     * 分析标题结构
     */
    analyzeHeadingStructure(headings) {
        const structure = [];
        Object.keys(headings).forEach(level => {
            if (headings[level].length > 0) {
                structure.push({
                    level: level,
                    count: headings[level].length,
                    texts: Array.from(headings[level]).map(h => h.textContent.substring(0, 50))
                });
            }
        });
        return structure;
    }
    
    /**
     * 生成SEO报告
     */
    generateReport() {
        const results = this.checkPageSEO();
        const overallScore = this.calculateOverallScore(results);
        
        const report = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            overallScore: overallScore,
            details: results,
            recommendations: this.generateRecommendations(results)
        };
        
        return report;
    }
    
    /**
     * 计算总体得分
     */
    calculateOverallScore(results) {
        const weights = {
            title: 0.2,
            metaDescription: 0.15,
            headings: 0.15,
            images: 0.1,
            internalLinks: 0.1,
            structuredData: 0.15,
            performance: 0.15
        };
        
        let totalScore = 0;
        Object.keys(weights).forEach(key => {
            if (results[key] && results[key].score !== undefined) {
                totalScore += results[key].score * weights[key];
            }
        });
        
        return Math.round(totalScore);
    }
    
    /**
     * 生成优化建议
     */
    generateRecommendations(results) {
        const recommendations = [];
        
        if (results.title.score < 80) {
            recommendations.push('优化页面标题，确保包含主要关键词且长度在30-60字符之间');
        }
        
        if (results.metaDescription.score < 80) {
            recommendations.push('优化Meta描述，确保包含关键词且长度在120-160字符之间');
        }
        
        if (results.headings.score < 80) {
            recommendations.push('优化标题结构，确保有且仅有一个H1标签，并包含主要关键词');
        }
        
        if (results.images.score < 80) {
            recommendations.push('为所有图片添加Alt属性，并在Alt文本中包含相关关键词');
        }
        
        if (results.internalLinks.score < 80) {
            recommendations.push('增加内部链接，使用包含关键词的锚文本');
        }
        
        if (results.structuredData.score < 80) {
            recommendations.push('添加更多结构化数据，如Organization、WebSite、FAQPage等');
        }
        
        if (results.performance.score < 80) {
            recommendations.push('优化页面加载速度，压缩图片和CSS/JS文件');
        }
        
        return recommendations;
    }
    
    /**
     * 启动监控
     */
    startMonitoring() {
        console.log('SEO监控已启动');
        
        // 立即执行一次检查
        const report = this.generateReport();
        console.log('SEO报告:', report);
        
        // 定期检查
        setInterval(() => {
            const report = this.generateReport();
            console.log('定期SEO检查:', report);
            
            // 可以在这里添加发送报告到服务器的逻辑
            this.sendReportToServer(report);
        }, this.checkInterval);
    }
    
    /**
     * 发送报告到服务器（示例）
     */
    sendReportToServer(report) {
        // 这里可以实现发送报告到服务器的逻辑
        console.log('发送SEO报告到服务器:', report);
    }
}

// 使用示例
if (typeof window !== 'undefined') {
    window.SEOMonitor = SEOMonitor;
    
    // 页面加载完成后启动监控
    document.addEventListener('DOMContentLoaded', () => {
        const monitor = new SEOMonitor();
        const report = monitor.generateReport();
        console.log('页面SEO分析报告:', report);
    });
}

// Node.js环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SEOMonitor;
}