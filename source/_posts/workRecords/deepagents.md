---
title: LangChain DeepAgents 入门到部署实战
date: 2026-04-23 21:00:00
tags:
  - LangChain
  - AI
  - Agent
  - LLM
  - Docker
categories: AI
description: 面向 1-3 年工作经验程序员的 DeepAgents 教程，从零开始、带沙箱、能部署
---

> 本文目标：让一个**有 1~3 年后端经验、写过接口调过 API**、但**没怎么碰过 AI Agent** 的程序员，跟着做完这篇文章，就能搭建出一个**能像 Claude Code / Manus 那样规划任务、跑代码、写文件、自我评审的深度 Agent**，并**用 Docker 部署到服务器**对外提供 HTTP 服务。
>
> 读完需要的前置：Python 基础 + 会用 `pip` + 会用 Docker。不要求会 LangChain。

---

# 一、先搞清楚：DeepAgents 到底是什么？

## 1. 一句话版

**DeepAgents** 是 LangChain 团队在 2025 年开源的 Agent 框架，你可以理解为：**"写 Claude Code / Manus 这类能深度干活的 AI 助手"的官方模板**。

## 2. 和普通 Agent 的区别

可能你之前见过这种写法：

```python
# 普通 LangChain Agent 一把梭
from langchain.agents import create_react_agent
agent = create_react_agent(llm, tools=[search_tool])
agent.invoke({"input": "搜一下向量数据库"})
```

这种 Agent 适合**单轮简单任务**：问问题、搜一下、返回答案。但是你让它写个 500 行报告、重构一个项目、调试一段代码，它就抓瞎了：

- **没有规划能力**：上来就开干，中间迷路
- **上下文会爆**：工具返回几万字直接塞回对话，几轮就 token 爆炸
- **没有工作空间**：所有中间产物都在对话里，没法组织
- **单线程**：没法把子任务交给专门的小弟

DeepAgents 就是来解决这些的，开箱自带"**规划 + 虚拟文件系统 + 子代理 + 可插拔后端**"四件套。

## 3. 形象比喻

| 对比       | 普通 Agent         | DeepAgent                                       |
| :--------- | :----------------- | :---------------------------------------------- |
| 像谁       | 刚入职的实习生     | 有经验的项目经理                                |
| 干活方式   | 让做啥立马做       | 先写 TODO 列表，按计划执行                      |
| 记录       | 全在聊天记录里     | 有自己的"工作目录"可以写文件、读文件、改文件    |
| 遇到大任务 | 一人硬扛           | 派小弟（sub-agent）分担，每个小弟独立上下文      |
| 代码执行   | 靠外部工具         | **内置沙箱**（E2B / Daytona / Modal 任选）      |

---

# 二、四个核心组件，通俗讲一遍

## 1. Planning Tool（规划工具）

给 Agent 装了一个 `write_todos` 工具。Agent 拿到任务先自己列个 TODO：

```
- [ ] 搜索向量数据库相关资料
- [ ] 对比主流产品功能
- [ ] 写一份 markdown 报告
```

每完成一项就勾掉一项。这样做两个好处：**一是 LLM 自己有"进度感"不会跑偏；二是你 debug 时能看到它在想什么。**

## 2. Virtual File System（虚拟文件系统）

Agent 有 `ls / read_file / write_file / edit_file / glob / grep` 工具，**像用电脑一样操作文件**。

但是——默认情况下这些"文件"是**存在程序内存（LangGraph state）里**的，不是真磁盘。这叫**可插拔后端**（Backend）。后面会讲怎么换成真磁盘、存储系统、甚至沙箱。

**这个设计最关键的作用**：工具返回超过 20k tokens 的时候，DeepAgents 会自动把内容 offload 到"文件"里，上下文里只留路径 + 10 行预览。这样 Agent 能跑几十轮不爆上下文。

## 3. Sub-Agent（子代理）

主 Agent 可以通过 `task` 工具派任务给**另一个 Agent**。例如主 Agent 是"写作者"，派一个 "评审员 sub-agent" 审核自己的文档。

两个好处：

- **上下文隔离**：子代理做完即抛，不污染主 Agent
- **角色专业化**：不同子代理可以有不同的系统提示词和工具集

## 4. Backend（后端）⭐

前面 1/2/3 里提到的工具都需要一个"存储 + 执行"的底座，这个底座就是 Backend：

| Backend 类型       | 文件存哪   | 能跑代码 | 典型用途                |
| :----------------- | :--------- | :------- | :---------------------- |
| 默认（state）      | 程序内存   | ❌       | 纯文档处理              |
| FilesystemBackend  | 你的磁盘   | ❌       | 本地开发调试            |
| StoreBackend       | LangGraph Store | ❌    | 跨会话长期记忆          |
| **Sandbox**（E2B等）| 沙箱容器内 | ✅       | **让 Agent 跑代码、装包**|

想做"像 Claude Code 一样能自己跑脚本调试"的 Agent，**必须用 Sandbox Backend**，这是本文后面的重点。

---

# 三、环境准备（跟着敲就行）

## 1. Python 环境

```bash
# 检查 Python 版本（需要 3.10+）
python3 --version

# 建个独立目录和虚拟环境
mkdir my-agent && cd my-agent
python3 -m venv .venv
source .venv/bin/activate      # Windows 用 .venv\Scripts\activate
```

## 2. 装依赖

```bash
# 核心
pip install deepagents

# LLM 相关（这里选了 Anthropic Claude 和 OpenAI，二选一或都装）
pip install langchain-anthropic langchain-openai

# 搜索工具（后面实战用）
pip install tavily-python

# 沙箱（我们用 E2B，后面章节用到）
pip install e2b-code-interpreter

# 打包成 HTTP 服务用
pip install fastapi uvicorn
```

## 3. 申请 API Key（都有免费额度）

在项目根目录建个 `.env` 文件：

```bash
# 至少选一个 LLM
ANTHROPIC_API_KEY=sk-ant-xxx         # https://console.anthropic.com/
OPENAI_API_KEY=sk-xxx                # https://platform.openai.com/

# 搜索（免费 1000 次/月）
TAVILY_API_KEY=tvly-xxx              # https://tavily.com/

# 沙箱（免费 100 小时/月）
E2B_API_KEY=e2b-xxx                  # https://e2b.dev/
```

然后装个工具让 Python 能读它：

```bash
pip install python-dotenv
```

---

# 四、Hello World：跑通第一个 Agent

建 `hello.py`：

```python
from dotenv import load_dotenv
load_dotenv()          # 读 .env 里的环境变量

from deepagents import create_deep_agent

# 1. 自定义一个工具（就是个普通 Python 函数）
def calculate_bmi(height_cm: float, weight_kg: float) -> str:
    """计算 BMI 指数并给出健康评价"""
    bmi = weight_kg / (height_cm / 100) ** 2
    if bmi < 18.5:
        advice = "偏瘦"
    elif bmi < 24:
        advice = "正常"
    elif bmi < 28:
        advice = "偏胖"
    else:
        advice = "肥胖"
    return f"BMI={bmi:.2f}, {advice}"

# 2. 创建 Agent
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5",    # 或 "openai:gpt-4o"
    tools=[calculate_bmi],
    instructions="你是一位健康顾问，会用 calculate_bmi 工具评估用户并给出建议。",
)

# 3. 运行
result = agent.invoke({
    "messages": [{"role": "user",
                  "content": "我身高 175，体重 80，帮我看看"}]
})

# 4. 打印最后一条 AI 消息
print(result["messages"][-1].content)
```

跑一下：

```bash
python hello.py
```

能看到 Agent 输出"BMI=26.12，属于偏胖……"之类的回答，恭喜，DeepAgents 跑通了。

> 如果报错 `ImportError: cannot import name ...`，先确认 `pip show deepagents` 版本是最新的，API 迭代较快。

---

# 五、实战项目：做一个"深度研究助手"

目标：给定一个主题，Agent 自动搜索 → 整理笔记 → 写出一份 Markdown 报告。

建 `researcher.py`：

```python
import os
from dotenv import load_dotenv
load_dotenv()

from deepagents import create_deep_agent
from tavily import TavilyClient

tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def web_search(query: str, max_results: int = 5) -> str:
    """搜索互联网，返回关键结果的摘要"""
    resp = tavily.search(
        query=query,
        max_results=max_results,
        search_depth="advanced",
    )
    # 精简输出，别把全部 HTML 都塞给 LLM
    results = [
        {"title": r["title"], "url": r["url"], "content": r["content"][:500]}
        for r in resp["results"]
    ]
    return str(results)

RESEARCHER_INSTRUCTIONS = """你是一位专业的技术研究员。

## 工作流程
1. 收到主题后，先用 write_todos 工具写一份 3~6 步的调研提纲
2. 按提纲逐步调用 web_search 搜集资料
3. 把每一小节的要点用 write_file 写到 notes_章节名.md
4. 最终把所有笔记汇总，写到 report.md（markdown 格式，带二级/三级标题）
5. 返回消息里只说"已完成，请查看 report.md"

## 原则
- 不臆造事实，每个结论都来自 web_search
- 报告要给 1~3 年工作经验的程序员看得懂
"""

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5",
    tools=[web_search],
    instructions=RESEARCHER_INSTRUCTIONS,
)

# 跑起来
result = agent.invoke({
    "messages": [{"role": "user",
                  "content": "调研 2026 年主流开源向量数据库（Milvus/Qdrant/Weaviate 等）的对比"}]
})

# 从结果里取出 Agent 写的文件
files = result.get("files", {})
print("=== Agent 生成了这些文件 ===")
for name in files:
    print(f"  - {name} ({len(files[name])} 字符)")

print("\n=== 最终 report.md ===\n")
print(files.get("report.md", "报告没生成，看看 message 日志："))

# 把最终报告写到真实磁盘
if "report.md" in files:
    with open("output_report.md", "w", encoding="utf-8") as f:
        f.write(files["report.md"])
    print("\n已保存到 ./output_report.md")
```

跑完你会看到 Agent 搜了 5~10 次、写了好几个笔记文件、最后整合出了一份像模像样的对比报告。

---

# 六、加入沙箱：让 Agent 能真正跑代码

前面的 Agent 只会"查 + 写"，但像 **Claude Code / 龙虾那一套**真正厉害的地方是 Agent **自己写代码、自己跑、自己看错误、自己修**。这就需要沙箱 Backend。

## 1. 为什么不让它直接跑本机？

- **安全**：LLM 可能 `rm -rf /`（虽然概率低但你赌不赌？）
- **环境隔离**：Agent 装的依赖不污染你本机
- **可复现**：每次启动都是干净环境

所以标准做法是：**用 E2B / Daytona / Modal 这种远程沙箱**，几行代码拉起一个 Linux 容器给 Agent 用。

## 2. 用 E2B 给 Agent 装沙箱

建 `coder.py`：

```python
from dotenv import load_dotenv
load_dotenv()

from deepagents import create_deep_agent
from e2b_code_interpreter import Sandbox

# 开一个沙箱
sandbox = Sandbox()

# 自定义一个"在沙箱里执行 Python"的工具
def execute_python(code: str) -> str:
    """
    在隔离沙箱里执行 Python 代码，返回 stdout/stderr/异常。
    Agent 可以用这个工具验证算法、处理数据、调试代码。
    """
    execution = sandbox.run_code(code)
    parts = []
    if execution.logs.stdout:
        parts.append("STDOUT:\n" + "".join(execution.logs.stdout))
    if execution.logs.stderr:
        parts.append("STDERR:\n" + "".join(execution.logs.stderr))
    if execution.error:
        parts.append(f"ERROR: {execution.error.name}: {execution.error.value}")
    if execution.results:
        parts.append("RESULT: " + str(execution.results[0]))
    return "\n".join(parts) if parts else "(no output)"


CODER_INSTRUCTIONS = """你是一位会写代码、会跑代码的 Python 工程师。

## 工作模式
1. 先用 write_todos 列出要做的事
2. 写代码时，**每次都要** execute_python 跑一下验证
3. 报错就读错误信息修正，重新跑
4. 中间产物（如清洗过的数据、阶段性代码）用 write_file 保存
5. 最终答复里说清楚解决方案和验证过的结论
"""

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5",
    tools=[execute_python],
    instructions=CODER_INSTRUCTIONS,
)

try:
    result = agent.invoke({
        "messages": [{"role": "user",
                      "content": "帮我用 Python 算出 2025 年所有是素数的日期（YYYYMMDD 形式），"
                                 "并保存成 primes.txt，验证一下结果。"}]
    })
    print(result["messages"][-1].content)
finally:
    sandbox.kill()        # 用完关，省额度
```

跑起来你会看到 Agent 自己写了段代码→用 `execute_python` 跑→发现 bug→改→再跑→确认→最后把结果报给你。**这就是"龙虾那一套"的本体**。

## 3. 进阶：整个 Backend 都放到沙箱里

上面是 "沙箱当作一个工具"。更彻底的做法是 **把 Agent 的虚拟文件系统整体扔进沙箱**，这样 `write_file / read_file` 都在沙箱里，`execute` 命令也在沙箱里，Agent 真的像"在一台远程 Linux 机器上工作"。

```python
# 示例（E2B 的 sandbox backend 集成仍在快速迭代，以官方 README 为准）
from deepagents import create_deep_agent
from deepagents.backends import SandboxBackend   # 命名以实际版本为准
from e2b import Sandbox as E2BSandbox

sandbox = E2BSandbox()
backend = SandboxBackend(sandbox=sandbox)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5",
    instructions="你是一个完整的编程助手，工作在隔离 Linux 环境中。",
    backend=backend,
)
```

实际 import 路径请 `pip show deepagents` 后查对应版本的 [GitHub README](https://github.com/langchain-ai/deepagents)。

---

# 七、加入 Sub-Agent：让它自己给自己挑刺

Agent 写完代码，自己评审一遍往往能大幅提升质量。写一个 critic sub-agent：

```python
critic_subagent = {
    "name": "critic",
    "description": "代码/文档评审员，用来找 bug 和改进点",
    "prompt": (
        "你是一位严格的 code reviewer。"
        "接到代码或文档后，用列表指出："
        "1) 潜在 bug；2) 边界情况没考虑到的；3) 可读性/命名问题；"
        "4) 可以简化的地方。只罗列问题，不要写修改方案。"
    ),
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5",
    tools=[execute_python],
    instructions=(
        CODER_INSTRUCTIONS
        + "\n\n代码写完且跑通后，调用 task 工具把代码发给 critic 评审，"
        "拿到意见后再修订一版。"
    ),
    subagents=[critic_subagent],
)
```

主 Agent 会在合适的时机调用：

```
主 → task(description="评审这段代码", subagent_type="critic")
critic → "1. 第 12 行没处理空列表..."
主 → 根据意见修改 → 最终交付
```

**主 agent 的上下文里只看到一句"critic 的意见如下..."**，critic 内部的思考过程完全隔离。

---

# 八、工程化：打包成 HTTP 服务

前面都在命令行跑，实际交付要做成服务。我们用 FastAPI。

建 `app.py`：

```python
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from pydantic import BaseModel
from deepagents import create_deep_agent
from e2b_code_interpreter import Sandbox


# ---------- 工具定义 ----------
_sandbox_pool = {}          # 简单粗暴的 session -> sandbox 映射

def get_sandbox(session_id: str) -> Sandbox:
    if session_id not in _sandbox_pool:
        _sandbox_pool[session_id] = Sandbox()
    return _sandbox_pool[session_id]


def make_execute_python(session_id: str):
    """每个 session 绑定一个独立沙箱的 execute_python"""
    def execute_python(code: str) -> str:
        sandbox = get_sandbox(session_id)
        exe = sandbox.run_code(code)
        out = "".join(exe.logs.stdout) if exe.logs.stdout else ""
        err = "".join(exe.logs.stderr) if exe.logs.stderr else ""
        if exe.error:
            err += f"\nERROR: {exe.error.name}: {exe.error.value}"
        return out + ("\n" + err if err else "")
    return execute_python


# ---------- API ----------
app = FastAPI(title="Deep Agent API")


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    files: dict


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    agent = create_deep_agent(
        model="anthropic:claude-sonnet-4-5",
        tools=[make_execute_python(req.session_id)],
        instructions="你是会写代码、会跑代码的 Python 工程师。",
    )
    result = agent.invoke({
        "messages": [{"role": "user", "content": req.message}]
    })
    return ChatResponse(
        reply=result["messages"][-1].content,
        files=result.get("files", {}),
    )


@app.delete("/session/{session_id}")
def close_session(session_id: str):
    """释放沙箱"""
    sb = _sandbox_pool.pop(session_id, None)
    if sb:
        sb.kill()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok"}
```

本地启动：

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

测试一下：

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"user-001","message":"算一下 100 以内素数的和"}'
```

---

# 九、部署：Docker + 服务器

## 1. 写 Dockerfile

项目根目录新建 `Dockerfile`：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 装依赖（先装再拷代码，利用 Docker 缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷代码
COPY . .

# 环境变量在 docker run 时注入，不要写进镜像！
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 2. 写 requirements.txt

```
deepagents
langchain-anthropic
langchain-openai
tavily-python
e2b-code-interpreter
python-dotenv
fastapi
uvicorn[standard]
```

## 3. 写 .dockerignore

```
.venv
__pycache__
*.pyc
.env
.git
.idea
*.md
```

（`.env` **一定要 ignore**，不然 API Key 会打进镜像）

## 4. 构建 & 本地跑通

```bash
docker build -t my-deepagent:0.1 .

docker run -d \
  --name deepagent \
  -p 8000:8000 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e TAVILY_API_KEY=$TAVILY_API_KEY \
  -e E2B_API_KEY=$E2B_API_KEY \
  my-deepagent:0.1

docker logs -f deepagent
```

## 5. 推到服务器

### 方案 A：镜像仓库

```bash
# 打 tag
docker tag my-deepagent:0.1 registry.example.com/you/my-deepagent:0.1

# 推
docker login registry.example.com
docker push registry.example.com/you/my-deepagent:0.1

# 服务器上拉
ssh server "docker pull registry.example.com/you/my-deepagent:0.1 && \
            docker run -d -p 8000:8000 --env-file /etc/deepagent.env \
            registry.example.com/you/my-deepagent:0.1"
```

### 方案 B：直接在服务器上 build

代码推到 git，在服务器上 `git pull && docker build && docker run`，同样可以。

## 6. 加 Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl;
    server_name agent.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/agent.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 300s;          # Agent 可能跑很久，超时要给够
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

# 十、常见报错 & 排查

| 报错                                   | 原因                                  | 解决                                            |
| :------------------------------------- | :------------------------------------ | :---------------------------------------------- |
| `ImportError: create_deep_agent`       | deepagents 版本不对                   | `pip install -U deepagents` 然后看官方 README 最新 API |
| `AuthenticationError` (401)            | API Key 没加载                        | 检查 `.env` 是否存在，`load_dotenv()` 是否调用  |
| `RateLimitError`                       | 短时间调用太多                        | LLM 降级到更便宜的模型，或加退避重试            |
| Agent 一直在循环跑同一个工具           | 系统提示词太宽泛                      | 在 `instructions` 里加"完成 XX 后直接返回"等停止条件 |
| 工具返回内容太长导致 token 爆炸        | 没让 Agent 用 write_file              | 工具内部先截断，或系统提示词明确要求长结果落盘  |
| Docker 容器里 E2B 连不上               | 网络问题                              | 确认容器能访问 `*.e2b.dev`，必要时配代理        |
| 沙箱挂了但 `_sandbox_pool` 没释放      | 进程异常退出                          | 加 `atexit.register(cleanup)` 兜底              |

## 调试技巧

1. **开 LangSmith**（免费额度 5k traces/月）：`pip install langsmith` + `export LANGSMITH_API_KEY=...`，每步 tool_call 在网页上看得清清楚楚
2. **拉低模型温度**：`temperature=0`，让 Agent 行为更稳定
3. **小步快跑**：别上来就写 200 行代码 + 5 个工具 + 3 个 subagent，先单工具跑通再加

---

# 十一、往后怎么学

1. **玩熟 Hello World**：改改 prompt、换换工具，感受 Agent 的行为
2. **跑通研究助手**：体会"规划+虚拟文件系统"的威力
3. **接通沙箱**：这是从"聊天机器人"进化成"生产力工具"的分水岭
4. **加 sub-agent**：尝试让两个角色协作（作者+评审员、开发+测试）
5. **部署上线**：按第九章走一遍 Docker
6. **读官方源码**：[deepagents/prompts.py](https://github.com/langchain-ai/deepagents) 里有那份著名的 Claude Code 风格 prompt，值得精读
7. **进阶方向**：
   - **LangGraph Studio** 可视化 debug
   - **Checkpointer** 做断点续跑（参考 LangGraph 文档）
   - **A2A 协议**让多个 Agent 互相调用
   - **MCP** 接入外部工具（GitHub、Slack 等）

---

# 十二、参考资料

- [deepagents GitHub](https://github.com/langchain-ai/deepagents)
- [官方博客：Introducing Deep Agents](https://blog.langchain.com/deep-agents/)
- [官方 Backends 文档](https://docs.langchain.com/oss/python/deepagents/backends)
- [The two patterns by which agents connect sandboxes](https://www.langchain.com/blog/the-two-patterns-by-which-agents-connect-sandboxes)
- [E2B 文档](https://e2b.dev/docs)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [FastAPI 文档](https://fastapi.tiangolo.com/zh/)

---

> 有问题直接在文章下面 Giscus 评论区提，我看到会回。
