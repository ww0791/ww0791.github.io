---
title: 从零手撸 ReAct Agent：原理与 Function Calling 实战
date: 2026-04-15 20:00:00
tags:
  - AI
  - Agent
  - LLM
  - ReAct
  - FunctionCalling
categories: AI
description: 不依赖任何框架，用 100 行代码手写一个 ReAct Agent，讲清楚 Reasoning+Acting 循环和 Function Calling 的底层机制
---

> 这篇不用 LangChain、不用 LlamaIndex、不用任何 Agent 框架。只用 `openai` 或 `anthropic` 官方 SDK，**从零手撸一个 ReAct Agent**。
>
> 读完你会拿到两样东西：
> 1. **心智模型**：ReAct 到底在做什么，为什么所有 Agent 框架本质都是它的变种
> 2. **可跑的代码**：100 行左右的完整实现，能搜天气、查股票、做数学题

---

# 一、先问一个问题：LLM 凭什么能"用工具"？

直接问 GPT："北京今天多少度？" —— 它会胡诌（训练数据截止日期之后的事它不知道）。

但如果你告诉它："你可以调一个 `get_weather(city)` 函数，我会帮你执行并把结果告诉你"，它就能给出正确答案。

**"告诉 LLM 有什么工具 + 让它生成工具调用 + 你执行 + 把结果塞回给它"** —— 这个循环就是 Agent 的本体。

ReAct 是这个循环最经典的实现思路，Function Calling 是这个循环在工程上的最佳实践。

---

# 二、ReAct 是什么

**ReAct = Reasoning + Acting**，2022 年 Google 的论文提出。一句话概括：**让 LLM 交替输出"思考"和"行动"，行动完看结果继续思考，直到任务完成**。

## 1. 经典的 ReAct 输出格式

早期（Function Calling 还没出现时）是纯文本循环：

```
Thought: 用户问北京天气，我需要调用天气工具
Action: get_weather
Action Input: {"city": "北京"}
Observation: {"temp": 15, "weather": "多云"}
Thought: 我拿到了数据，可以回答了
Final Answer: 北京今天 15 度，多云
```

程序用正则解析 `Action: xxx` 和 `Action Input: {...}`，执行工具，把结果塞成 `Observation:` 再丢回给 LLM，LLM 继续往下写。

## 2. 这套有什么问题？

- **解析脆**：LLM 偶尔写成 `Action:get_weather`（少个空格）就炸
- **JSON 不可靠**：Action Input 要 LLM 输出 JSON，经常多个逗号少个引号
- **token 浪费**：每轮都要复述 Thought/Action/Action Input/Observation 这堆关键字

所以 2023 年 OpenAI 上线了 **Function Calling**，把"模型生成工具调用"这件事做成了 API 内置能力。

---

# 三、Function Calling 是什么

Function Calling 本质是**厂商在 API 层面帮你把"要调什么工具、传什么参数"从自然语言里结构化抠出来**。

## 1. 你给 API 传工具定义（JSON Schema 格式）

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询指定城市的实时天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名"}
            },
            "required": ["city"]
        }
    }
}]
```

## 2. 模型会返回结构化的调用请求

```json
{
  "role": "assistant",
  "tool_calls": [{
    "id": "call_abc123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"city\": \"北京\"}"
    }
  }]
}
```

你不用解析纯文本，直接 `json.loads(tool_call.function.arguments)` 就能拿到参数。

## 3. 跟 ReAct 是什么关系？

**ReAct 是思路，Function Calling 是实现**。

- 没有 Function Calling 之前，所有 Agent 框架（比如早期 LangChain）都是**让 LLM 写纯文本**再正则解析
- 有了 Function Calling，同样的 ReAct 循环只是把"Action + Action Input"换成了原生工具调用字段，Reasoning 部分藏在 `content` 里（或者根本不写，直接返回 tool_call）

心智模型还是那个循环：

```
用户输入
  └─> [LLM 思考 + 决定调哪个工具]
         └─> [程序执行工具]
               └─> [工具结果塞回对话]
                     └─> [LLM 继续思考，或直接回答]
                           └─> 完成
```

---

# 四、手撸第一版：纯 ReAct（不用 Function Calling）

先做个最朴素的，感受一下原始 ReAct 的样子。

## 1. 准备

```bash
pip install openai
export OPENAI_API_KEY=sk-xxx
```

## 2. 定义工具（普通 Python 函数）

```python
def get_weather(city: str) -> str:
    fake_data = {"北京": "15℃ 多云", "上海": "22℃ 晴", "杭州": "20℃ 小雨"}
    return fake_data.get(city, "未知城市")


def calculator(expression: str) -> str:
    try:
        return str(eval(expression, {"__builtins__": {}}))     # 简单沙箱
    except Exception as e:
        return f"Error: {e}"


TOOLS = {
    "get_weather": get_weather,
    "calculator": calculator,
}
```

## 3. 写 ReAct 系统提示词

```python
SYSTEM_PROMPT = """你是一个 ReAct 风格的 Agent。

可用工具：
- get_weather(city): 查询城市天气
- calculator(expression): 计算数学表达式

严格按以下格式输出，每次只写一个 Thought 和一个 Action（或 Final Answer）：

Thought: 你的思考
Action: 工具名
Action Input: 工具参数（JSON 格式）

等我给你 Observation 后再继续下一轮 Thought。

当可以回答用户时，改为输出：

Thought: 我已经掌握足够信息
Final Answer: 你的最终答案
"""
```

## 4. 核心循环（大概 40 行）

```python
import json
import re
from openai import OpenAI

client = OpenAI()


def parse_action(text: str):
    """从 LLM 输出里解析 Action 和 Action Input"""
    action_match = re.search(r"Action:\s*(\w+)", text)
    input_match = re.search(r"Action Input:\s*(\{.*?\})", text, re.DOTALL)
    if not action_match or not input_match:
        return None, None
    try:
        args = json.loads(input_match.group(1))
    except json.JSONDecodeError:
        return None, None
    return action_match.group(1), args


def run_react_agent(user_input: str, max_steps: int = 5):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_input},
    ]

    for step in range(max_steps):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0,
        )
        output = resp.choices[0].message.content
        print(f"\n--- Step {step + 1} ---\n{output}")

        # 1. 如果模型给出了 Final Answer，结束
        if "Final Answer:" in output:
            answer = output.split("Final Answer:")[-1].strip()
            return answer

        # 2. 否则解析工具调用
        action, args = parse_action(output)
        if not action or action not in TOOLS:
            return f"解析失败: {output}"

        # 3. 执行工具
        observation = TOOLS[action](**args)
        print(f"Observation: {observation}")

        # 4. 把 LLM 的输出和 Observation 都塞回对话
        messages.append({"role": "assistant", "content": output})
        messages.append({"role": "user", "content": f"Observation: {observation}"})

    return "达到最大步数，未能完成"


if __name__ == "__main__":
    print(run_react_agent("北京和上海哪个更冷？温差几度？"))
```

运行一下，你会看到 LLM 先调 `get_weather("北京")`、再调 `get_weather("上海")`、再调 `calculator("22-15")`、最后给出答案。

**这就是一个能用的 Agent，没有任何框架**。

---

# 五、手撸第二版：用 Function Calling 升级

纯文本 ReAct 有前面说的脆弱问题。换成 Function Calling，代码更简洁也更稳。

## 1. 定义工具的 Schema

```python
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的实时天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市中文名"}
                },
                "required": ["city"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "计算一个数学表达式",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "例如 1+2*3"}
                },
                "required": ["expression"],
            },
        },
    },
]
```

## 2. 简化后的循环

```python
import json
from openai import OpenAI

client = OpenAI()


def run_fc_agent(user_input: str, max_steps: int = 5):
    messages = [
        {"role": "system", "content": "你是一个会用工具解决问题的助手，每一步调用工具前简要说明思路。"},
        {"role": "user", "content": user_input},
    ]

    for step in range(max_steps):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOL_SCHEMAS,
            temperature=0,
        )
        msg = resp.choices[0].message

        # 情况 1：没有工具调用 = 最终回答
        if not msg.tool_calls:
            return msg.content

        # 情况 2：有工具调用，先把 assistant 消息加入历史（重要！）
        messages.append(msg.model_dump(exclude_unset=True))

        # 情况 3：逐个执行工具调用
        for call in msg.tool_calls:
            name = call.function.name
            args = json.loads(call.function.arguments)
            print(f"\n>>> 调用 {name}({args})")

            result = TOOLS[name](**args)
            print(f"<<< 结果: {result}")

            # 结果也要以 role=tool 塞回对话
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": str(result),
            })

    return "达到最大步数"


if __name__ == "__main__":
    print(run_fc_agent("北京和上海哪个更冷？温差几度？"))
```

对比第一版：

- 不用写繁琐的 `SYSTEM_PROMPT` 限定格式
- 不用写 `parse_action` 正则解析
- LLM 原生保证 arguments 是合法 JSON
- 支持**并行工具调用**（一次响应返回多个 `tool_calls`）

---

# 六、关键机制拆解

## 1. 为什么要把 assistant 消息 append 回去？

```python
messages.append(msg.model_dump(exclude_unset=True))    # 这一步不能漏
```

因为下一轮 LLM 要看到自己之前说过"我要调 xxx"，才能理解接下来 `role=tool` 的消息是在回答哪个调用。这是 OpenAI API 硬性要求：`tool_call_id` 必须和 assistant 之前返回的 `tool_calls[].id` 对得上。

## 2. `tool_call_id` 是什么？

一个调用的唯一标识符。LLM 一次响应可能想同时调用多个工具（比如"查北京和上海的天气"），每个工具结果要通过 `tool_call_id` 明确绑定到对应的调用。

## 3. `role="tool"` 和 `role="user"` 差在哪？

- `role=user` 是用户说的话
- `role=tool` 是工具返回的数据

模型看到 `role=tool` 会明确知道"这是我刚才调用的工具的结果"，不会误解成用户又问了新问题。

## 4. 什么时候 LLM 停止调工具？

当它觉得信息够了，**返回的 message 里 `tool_calls` 字段为空**、只有 `content`。这时 `content` 就是最终回答。

---

# 七、常见陷阱

## 1. 陷阱：无限循环

LLM 可能陷入 "我再调一次看看" 的循环。对策：

- 设 `max_steps` 上限
- 在工具描述里写明"调用过一次就不要重复调用"
- 监控连续相同的 tool_call，碰到就强制退出

## 2. 陷阱：工具返回内容太长

比如 `get_documents()` 返回 5 万字，直接塞回对话会**立刻爆 token**。对策：

- 工具内部做截断（比如只返回前 2000 字符 + 说明"剩余可按 N 关键词检索"）
- 或者返回摘要 + 文件路径，让 LLM 需要时再读

## 3. 陷阱：JSON 参数不合法

Function Calling 大幅度降低了这个问题，但偶尔还有。对策：

```python
try:
    args = json.loads(call.function.arguments)
except json.JSONDecodeError:
    # 把错误塞回去，让 LLM 自己修
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": "参数 JSON 不合法，请重试"
    })
    continue
```

## 4. 陷阱：工具抛异常没兜住

一个 `raise` 就能把整个 Agent 搞崩。**所有工具执行都要包 try/except**，把错误信息作为 observation 塞回去，让 LLM 看到 "上次调用失败了" 并自己决策。

```python
try:
    result = TOOLS[name](**args)
except Exception as e:
    result = f"工具执行出错: {type(e).__name__}: {e}"
```

---

# 八、完整 Demo：给 LLM 装 3 个工具

合并上面的代码，加一个"查股价"的假工具，支持多工具协作：

```python
import json
from openai import OpenAI

client = OpenAI()


# ---------- 工具实现 ----------
def get_weather(city: str) -> str:
    data = {"北京": "15℃ 多云", "上海": "22℃ 晴", "杭州": "20℃ 小雨"}
    return data.get(city, "未知城市")


def calculator(expression: str) -> str:
    try:
        return str(eval(expression, {"__builtins__": {}}))
    except Exception as e:
        return f"Error: {e}"


def get_stock_price(symbol: str) -> str:
    data = {"AAPL": 230.5, "TSLA": 285.1, "MSFT": 420.8}
    return f"{symbol}: ${data.get(symbol, '未知')}"


TOOLS = {"get_weather": get_weather,
         "calculator": calculator,
         "get_stock_price": get_stock_price}


# ---------- Schema ----------
TOOL_SCHEMAS = [
    {"type": "function", "function": {"name": "get_weather",
        "description": "查询城市天气", "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"]}}},
    {"type": "function", "function": {"name": "calculator",
        "description": "计算数学表达式", "parameters": {
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"]}}},
    {"type": "function", "function": {"name": "get_stock_price",
        "description": "查询美股实时价格", "parameters": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "如 AAPL"}},
            "required": ["symbol"]}}},
]


# ---------- Agent 主循环 ----------
def run_agent(user_input: str, max_steps: int = 8):
    messages = [
        {"role": "system", "content": "你是一个会调用工具的助手。"},
        {"role": "user", "content": user_input},
    ]

    for step in range(max_steps):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOL_SCHEMAS,
            temperature=0,
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            return msg.content

        messages.append(msg.model_dump(exclude_unset=True))

        for call in msg.tool_calls:
            name = call.function.name
            try:
                args = json.loads(call.function.arguments)
                result = TOOLS[name](**args)
            except Exception as e:
                result = f"执行出错: {e}"

            print(f"  🔧 {name}({args}) → {result}")
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": str(result),
            })

    return "超过最大步数"


if __name__ == "__main__":
    tasks = [
        "AAPL 和 TSLA 哪个贵？差多少？",
        "北京和上海温差几度？哪个更适合户外活动？",
        "TSLA 现价的 1.2 倍是多少？",
    ]
    for t in tasks:
        print(f"\n=== 任务: {t} ===")
        print("答案:", run_agent(t))
```

跑起来：

```bash
python agent.py
```

你会看到第一个任务连跑 3 步：`get_stock_price(AAPL)` → `get_stock_price(TSLA)` → `calculator(285.1-230.5)` → 给出答案。

**这个 200 行不到的脚本，已经是一个生产可用的 Agent 内核。所有 Agent 框架（LangChain / AutoGPT / DeepAgents）本质都是在这个循环上加各种工程糖（记忆、规划、子代理、虚拟文件系统等等）。**

---

# 九、Anthropic Claude 的 API 差异

切到 Claude 只改两个地方：

```python
from anthropic import Anthropic
client = Anthropic()

# Claude 的 tools schema 略有不同
TOOL_SCHEMAS = [
    {
        "name": "get_weather",
        "description": "查询城市天气",
        "input_schema": {       # 注意是 input_schema 不是 parameters
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
]

# 调用
resp = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=TOOL_SCHEMAS,
    messages=messages,
)

# 判定是否工具调用
if resp.stop_reason == "tool_use":
    for block in resp.content:
        if block.type == "tool_use":
            name = block.name
            args = block.input       # 已经是 dict，不用 json.loads
            # ...
```

循环结构一模一样，只是字段名换了。**心智模型是通用的。**

---

# 十、延伸阅读

搞懂了这篇，你再去看下面这些就像翻译练习：

- [**ReAct 原论文**：ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [**OpenAI Function Calling 文档**](https://platform.openai.com/docs/guides/function-calling)
- [**Anthropic Tool Use 文档**](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use)
- [**LangChain 源码里的 AgentExecutor**](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/agents/agent.py)：对照这篇看完全能读懂
- [**DeepAgents 源码**](https://github.com/langchain-ai/deepagents)：同上

---

# 十一、小结

| 概念 | 一句话 |
| :--- | :--- |
| **ReAct** | LLM 交替"思考 + 行动"，直到任务完成 |
| **Function Calling** | 厂商帮你在 API 层结构化地拿到"要调什么工具" |
| **Agent** | 就是上面这个循环，再加点工程糖 |
| **记忆 / 规划 / 子代理 / 沙箱** | 糖，很重要，但不是本质 |

把这 100 行代码读三遍、改两遍、加一个自己的工具，你就算是 Agent 入门了。之后再看 LangChain / DeepAgents 那些框架，它们做的事情你都能预测出来。
