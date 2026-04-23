# 博客操作手册

本博客基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 主题，托管在 GitHub Pages。

- **线上地址**：https://ww0791.github.io
- **仓库地址**：https://github.com/ww0791/ww0791.github.io
- **源码分支**：`hexo`（日常开发在这里）
- **发布分支**：`main`（`hexo d` 自动推送的静态产物，不要手动改）

---

## 一、换电脑后的初始化（仅首次）

### 1. 安装 Node.js

推荐 18 或 20 LTS 版本。

```bash
# Mac 推荐用 nvm 管理 Node 版本
brew install nvm
nvm install 20
nvm use 20

# 或者直接装
brew install node@20
```

### 2. 安装 hexo 命令行

```bash
npm install -g hexo-cli
```

### 3. 配置 SSH Key 到 GitHub

```bash
# 生成新 key（如果新电脑没有）
ssh-keygen -t ed25519 -C "你的邮箱"

# 打印公钥，复制内容
cat ~/.ssh/id_ed25519.pub
```

把公钥粘到 https://github.com/settings/ssh/new 保存。

验证：

```bash
ssh -T git@github.com
# 看到 "Hi ww0791! You've successfully authenticated..." 就是成功
```

### 4. 克隆源码

注意一定要拉 `hexo` 分支，不是默认的 `main`：

```bash
git clone -b hexo git@github.com:ww0791/ww0791.github.io.git
cd ww0791.github.io
```

### 5. 安装依赖

```bash
npm install
```

`package.json` 会自动装回所有插件和 Butterfly 主题。

### 6. 本地启动验证

```bash
npx hexo s
```

浏览器打开 http://localhost:4000 能看到博客就算初始化完成。

---

## 二、写文章

### 新建文章

```bash
hexo new post "文章标题"
```

生成路径：`source/_posts/文章标题.md`

也可以手动创建，按子目录分类会更整洁：

```
source/_posts/
├── workRecords/      # 工作记录
│   ├── docker.md
│   ├── k8s.md
│   └── disruptor.md
└── project/          # 项目相关
    └── his.md
```

### Front-matter 模板

每篇文章顶部都要有这段 YAML：

```yaml
---
title: 文章标题
date: 2026-04-23 19:44:32
tags:
  - 标签1
  - 标签2
categories: 分类名
description: 文章简介（显示在列表页和 OG 分享卡片）
---
```

### 常用 Markdown 语法扩展（Butterfly 支持）

````markdown
# 提示块
{% note info %}
info 提示
{% endnote %}

{% note success %}成功{% endnote %}
{% note warning %}警告{% endnote %}
{% note danger %}错误{% endnote %}

# 折叠块
{% folding 点击展开 %}
隐藏内容
{% endfolding %}

# 代码块（带语言高亮）
```java
System.out.println("hello");
```
````

### 本地预览

```bash
npx hexo s
```

修改 Markdown 后浏览器会**自动热重载**，不用重启服务。

---

## 三、发布到线上

### 一条命令搞定

```bash
npx hexo clean && npx hexo g -d
```

- `clean`：清 `public/` 和 `db.json` 缓存
- `g` (generate)：渲染 Markdown 成静态 HTML
- `d` (deploy)：把 `public/` 推到 `main` 分支

等 1~2 分钟刷新 https://ww0791.github.io 即可看到最新版。

### 踩过的坑

| 现象                              | 处理                                                     |
| :-------------------------------- | :------------------------------------------------------- |
| `Permission denied (publickey)`   | SSH Key 没配，参考第一章第 3 步                          |
| 推上去但页面 404                  | GitHub Settings → Pages → Source 选 `main` / `/ (root)`  |
| 访问的还是旧内容                  | 强刷浏览器 `Cmd+Shift+R`，或等几分钟 CDN 缓存过期        |
| 样式全丢                          | `_config.yml` 的 `url` 要是 `https://ww0791.github.io`   |
| Hexo 插件报错                     | 先 `rm -rf node_modules && npm install`                  |

---

## 四、提交源码到 GitHub

发布只是把静态产物推到 `main` 分支，**源码还得提交到 `hexo` 分支**做备份（不然换电脑就拉不到了）。

### 日常提交流程

```bash
# 1. 看改了啥
git status

# 2. 提交
git add .
git commit -m "add: 新增 xxx 文章"

# 3. 推到 hexo 分支
git push origin hexo
```

### 推荐的 commit message 风格

```
add: 新增 xxx 文章
fix: 修复 xxx 文章错别字
docs: 更新博客手册
chore: 升级依赖
style: 调整 Butterfly 主题配色
feat: 接入 xxx 评论系统
```

---

## 五、完整工作流（收藏这段就够）

假设你要写一篇新文章：

```bash
# 1. 切到项目目录
cd ~/path/to/ww0791.github.io

# 2. 拉最新源码（防止和其它电脑冲突）
git pull origin hexo

# 3. 写文章
hexo new post "我的新文章"
# 用编辑器打开 source/_posts/我的新文章.md，开始写...

# 4. 本地预览
npx hexo s
# 浏览器打开 http://localhost:4000 看看效果，没问题 Ctrl+C 退出

# 5. 提交源码
git add .
git commit -m "add: 我的新文章"
git push origin hexo

# 6. 发布到线上
npx hexo clean && npx hexo g -d
```

搞定，https://ww0791.github.io 上就有新文章了。

---

## 六、常用配置文件速查

| 文件                    | 作用                                |
| :---------------------- | :---------------------------------- |
| `_config.yml`           | Hexo 站点配置（标题、URL、部署地址等） |
| `_config.butterfly.yml` | Butterfly 主题配置（导航、头像、评论等） |
| `package.json`          | npm 依赖清单（主题和插件）          |
| `source/_posts/`        | 文章 Markdown 源文件                |
| `source/_data/`         | 自定义数据（友链等，可选）          |
| `source/images/`        | 博客用图片                          |
| `.gitignore`            | 不提交的文件清单                    |

---

## 七、主题与评论相关速查

### 换主题颜色 / 头像 / 导航

全在 `_config.butterfly.yml` 里改，常见锚点：

- `menu:` — 顶部导航菜单
- `avatar:` — 头像
- `index_img:` — 首页 banner
- `highlight_theme:` — 代码高亮主题
- `footer:` — 页脚

### 评论系统（Giscus）

评论数据存在 GitHub 仓库的 **Discussions → Announcements** 分类下。

- 查看/删评论：打开 https://github.com/ww0791/ww0791.github.io/discussions
- 新评论通知：GitHub 默认给你发邮件

---

## 八、参考链接

- [Hexo 官方文档](https://hexo.io/zh-cn/docs/)
- [Butterfly 主题文档](https://butterfly.js.org/)
- [Giscus](https://giscus.app/zh-CN)
- [Markdown 语法速查](https://www.markdownguide.org/cheat-sheet/)
