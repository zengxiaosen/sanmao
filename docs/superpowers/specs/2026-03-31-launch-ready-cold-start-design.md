# Launch-Ready Cold Start and Chat Polish Design

## Goal
把当前 Sanmao 从“能跑的演示”打磨成“能给真实用户看”的早期产品版本，解决密码输入异常、冷启动资料过少、聊天活性不足，以及页面文案测试味过重的问题。

## Scope
- 修复登录/注册页密码输入时的异常刷新或闪动
- 将冷启动假用户扩充到约 100 个，并保证资料观感真实
- 为 seed 假用户增加规则式自动回复能力
- 将首页、登录页、空状态、消息区中的开发态/测试态文案替换为正式产品文案

## Non-goals
- 不接入真实大模型聊天回复
- 不做图片、语音、已读未读、在线状态
- 不做后台运营配置系统
- 不做推荐算法重构
- 不做复杂异步任务系统

## Design

### 1. Password input bug fix
当前登录/注册区的密码输入异常，优先按前端状态更新与整页重渲染问题处理，而不是先推翻 UI 架构。

处理原则：
- 保持现有单页结构
- 定位密码输入是否导致 `root.innerHTML` 重绘后焦点丢失
- 最小化修复输入框状态绑定和事件处理
- 不顺手大改 auth 流程

成功标准：
- 输入密码时页面不整页刷新
- 焦点不跳
- 输入内容不丢失

### 2. Seed user expansion
当前只有极少量 seed 用户，容易在 discover 很快刷空，缺少真实感。第一版将 seed 用户扩展到约 100 个，按“真人感资料”标准组织。

每个 seed 用户包含两层数据：

**展示层字段**
- username
- name
- age
- city
- company
- role
- school
- avatar_url
- tags
- bio

**行为层字段**
- persona_type
- reply_style
- opener_style
- active_window
- conversation_topics

建议将 seed 数据从 `server/app.py` 抽离到独立文件，例如 `server/seed_data.py`，避免主服务文件继续膨胀。

目标不是绝对随机，而是“像 100 个真的人”：
- 职业分布多样
- 学校与城市合理
- 标签、bio、语气有差异
- 不能一眼看出模板味

### 3. Rule-based auto reply
第一版不接 LLM，而是做规则式自动回复引擎。

#### Trigger
- 用户向某个匹配对象发送消息后
- 服务端在写入用户消息后检查该对象是否为 seed 用户
- 若是，则自动插入一条该 seed 用户的回复消息

#### Reply generation
回复由三部分共同决定：
1. 用户消息类型
   - 打招呼
   - 提问工作/学校
   - 提问兴趣
   - 夸赞/拉近关系
   - 邀约
   - 泛聊
2. seed 用户 persona
3. 最近少量上下文（仅用于避免明显答非所问和重复）

#### Constraints
- 一次用户消息最多触发一条自动回复
- 不做 seed 对 seed 的自发对话
- 不做无限链式回复
- 第一版允许“即时回复”，不强制做延迟队列

#### Benefit
这种方式可以在不引入模型成本和风控复杂度的前提下，让聊天区明显更像活的产品。

### 4. Production-facing copy cleanup
当前文案带有明显开发/演示语气，必须整体替换。

需要移除的类型：
- “现在这版”
- “CURRENT FLOW”
- “SQLite MVP”
- “演示账号统一测试密码”
- “后端 session 会记住你的登录状态”
- “等后端逻辑继续补完后”

文案替换方向：
- 强调认真交友、真实表达、轻量进入
- 强调体验本身，而不是技术实现
- 空状态也要像产品提示，不像开发备注

### 5. File structure
建议结构：

- `src/app.js`
  - 修密码输入问题
  - 替换文案
  - 保持现有页面骨架
- `server/app.py`
  - 接入 seed 自动回复触发逻辑
  - 保持现有消息写入流程不被推翻
- `server/seed_data.py`（新建）
  - 存 100 个 seed 用户资料
  - 存 persona 和回复模板配置
- `tests/app.test.js`
  - 如需要，补充密码输入状态或文案辅助函数相关测试
- 后端测试暂以现有 E2E/手动验证为主，必要时补最小单元测试

### 6. Implementation order
推荐实现顺序：
1. 修密码输入异常
2. 替换测试味文案
3. 扩充 100 个 seed 用户并接入 discover/state
4. 增加规则式自动回复
5. 做全量验证

## Acceptance criteria
- 密码输入时页面不刷新、不丢焦点
- discover 列表拥有约 100 个高质量冷启动对象，不再迅速刷空
- 对至少 3 类不同 persona，聊天回复风格明显不同
- 关键页面不再出现测试/演示/开发态措辞
- `npm test` 通过
- `npm run build` 通过
- 手动验证消息自动回复链路可用
