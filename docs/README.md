# 项目文档 / Project Documentation

[中文](#中文) · [English](#english)

<a id="中文"></a>

## 中文

这里是 Smart Sidebar Assistant 的文档入口。README 负责项目概览；具体操作、实现约束和维护流程分别记录在下列专题文档中。

| 文档 | 适合谁 | 内容 |
| --- | --- | --- |
| [项目概览](../README.md#chinese) | 新用户 | 功能、安装、权限与版本变化 |
| [使用指南](./user-guide.md) | 插件用户 | 首次配置、页面/链接/图片处理、Prompt、存档、正则多行提取 |
| [架构说明](./architecture.md) | 开发者与审阅者 | 模块边界、数据流、存储模型、链接任务状态与安全边界 |
| [开发与测试](./development.md) | 贡献者 | 本地开发、测试分层、浏览器烟测、CI 与发布前检查 |
| [故障排查](./troubleshooting.md) | 用户与开发者 | 注入、API、链接任务、正则和测试环境问题 |
| [贡献指南](../CONTRIBUTING.md) | 贡献者 | 改动要求、测试选择、安全检查与 PR 清单 |
| [API 配置页源码](../guide/api_guide.html) | 需要 AI 功能的用户 | Gemini 与 OpenAI 兼容配置字段说明 |
| [中文隐私政策](../privacy_policy/privacy_policy_zh.html) | 所有用户 | 数据处理、存储、第三方传输与删除选择 |

快速判断：仅使用“提取全文”和正则预览/复制时不需要 API Key；总结、聊天、AI 设计正则和图片分析会把您主动提交的数据发送到当前激活的 AI 服务。

文档中的数值限制以当前代码为准。调整权限、存储键、超时、容量预算或对外数据流时，应同时更新相关文档和隐私政策。

<a id="english"></a>

## English

This is the documentation hub for Smart Sidebar Assistant. The READMEs provide the project overview; the guides below cover usage, implementation constraints, and maintenance workflows.

| Document | Audience | Covers |
| --- | --- | --- |
| [Project overview](../README.en.md) | New users | Features, installation, permissions, and releases |
| [User guide](./user-guide.md#english) | Extension users | Setup, page/link/image workflows, prompts, archives, and multiline regex extraction |
| [Architecture](./architecture.md#english) | Developers and reviewers | Module boundaries, data flow, storage, link-job state, and trust boundaries |
| [Development and testing](./development.md#english) | Contributors | Local development, test layers, browser smoke tests, CI, and release checks |
| [Troubleshooting](./troubleshooting.md#english) | Users and developers | Injection, API, link-job, regex, and test-environment problems |
| [Contributing](../CONTRIBUTING.md#english) | Contributors | Change requirements, test selection, security checks, and the PR checklist |
| [API setup](./user-guide.md#configure-an-ai-api) | Users of AI features | Gemini and OpenAI-compatible configuration fields and streaming requirements |
| [Privacy policy](../privacy_policy/index.html) | All users | Data processing, storage, third-party transfer, and deletion choices |

No API key is required for local full-visible-text extraction or regex preview/copy. Summaries, chat, AI-assisted regex design, and image analysis send the data you submit to the active AI service.

Numeric limits in these documents describe the current code. Any change to permissions, storage keys, timeouts, capacity budgets, or outbound data flow should update the relevant documentation and privacy policy in the same change.
