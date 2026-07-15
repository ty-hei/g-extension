'use strict';

const i18n = {
    zh: {
        title: '智能侧边栏助手', install: '免费安装', heroTitle: '浏览器里的 AI 共驾驶', heroDesc: '集成 Gemini 与 OpenAI。不打断浏览流，一键总结、分析、对话。', apiGuide: 'API 指南',
        feature1Title: '智能侧边栏对话', feature1Desc: '无需离开当前页面，随时唤起 AI 助手。支持上下文对话、代码解释、翻译润色等多种任务。',
        feature2Title: '多模型自由切换', feature2Desc: '支持 Google Gemini 和 OpenAI 兼容接口。在选项页轻松配置多个 API，根据任务需求灵活切换模型。',
        feature3Title: '对话存档与回溯', feature3Desc: '话题结束了？一键“分割”并存档当前对话。随时在历史记录中回溯过往知识。',
        langBtn: 'EN'
    },
    en: {
        title: 'Smart Sidebar Assistant', install: 'Install Free', heroTitle: 'Your Browser AI Co-pilot', heroDesc: 'Integrate Gemini & OpenAI. Summarize, analyze, and chat without breaking your flow.', apiGuide: 'API Guide',
        feature1Title: 'Smart Sidebar Chat', feature1Desc: 'Chat with AI without leaving your current page. Supports context-aware conversations, code explanation, translation, and more.',
        feature2Title: 'Multi-Model Support', feature2Desc: 'Switch between Google Gemini and OpenAI compatible APIs. Configure multiple models in options and switch instantly.',
        feature3Title: 'Conversation Archive', feature3Desc: 'Finished a topic? Split and archive the chat. Access your knowledge history anytime.',
        langBtn: '中'
    }
};

let currentLang = 'zh';
const steps = document.querySelectorAll('.step');
const featureImg = document.getElementById('feature-img');
const languageButton = document.getElementById('langBtn');
const images = {
    zh: ['ZH_MAIN.jpg', 'ZH-OP.jpg', 'ZH_AR.jpg'],
    en: ['EN-MAIN.jpg', 'EN-OP.jpg', 'EN-AR.jpg']
};

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        steps.forEach(step => step.classList.remove('active'));
        entry.target.classList.add('active');
        const index = entry.target.getAttribute('data-index');
        if (!featureImg || !images[currentLang]) return;
        featureImg.src = images[currentLang][index];
        featureImg.style.opacity = 0;
        setTimeout(() => { featureImg.style.opacity = 1; }, 50);
    });
}, { threshold: 0.6 });

steps.forEach(step => observer.observe(step));

languageButton?.addEventListener('click', () => {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    const data = i18n[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (data[key]) element.textContent = data[key];
    });
    languageButton.textContent = data.langBtn;
    languageButton.setAttribute('aria-label', currentLang === 'zh' ? 'Switch to English' : '切换到中文');
    const activeStep = document.querySelector('.step.active');
    if (activeStep && featureImg) featureImg.src = images[currentLang][activeStep.getAttribute('data-index')];
});
