# CC Switch 数据库支持范围

CCSwitch Pulse 只读读取本机 SQLite，不执行迁移、不创建表、不写入业务数据。数据库字段属于 CC Switch 的实现细节，升级 CC Switch 后应重新执行本项目测试和真实数据核对。

## 当前支持的结构

### 必需表：`proxy_request_logs`

以下字段必须存在：

| 字段 | 读取方式 | 说明 |
| --- | --- | --- |
| `created_at` | INTEGER | Unix 秒时间戳 |
| `model` | TEXT | 实际模型名称 |
| `data_source` | TEXT | 数据来源标识 |
| `input_tokens` | INTEGER | 输入 Token；空值按 0 处理 |
| `output_tokens` | INTEGER | 输出 Token；空值按 0 处理 |
| `cache_read_tokens` | INTEGER | 缓存读取 Token；空值按 0 处理 |
| `cache_creation_tokens` | INTEGER | 缓存创建 Token；空值按 0 处理 |
| `total_cost_usd` | NUMERIC/TEXT | CC Switch 记录的估算美元费用 |

以下字段为可选：

| 字段 | 缺失时的行为 |
| --- | --- |
| `request_model` | 请求模型口径回退到 `model` |
| `status_code` | 明细中的状态显示为未知 |
| `session_id` | 会话视图显示为不可用 |

### 可选表：`usage_daily_rollups`

只有当该表同时包含以下字段时，才会被当作历史归档读取：

```text
date
model
request_count
input_tokens
output_tokens
cache_read_tokens
cache_creation_tokens
total_cost_usd
```

`request_model` 是可选字段。归档表没有 `data_source` 和 `session_id` 维度，因此来源筛选、近期明细和会话视图只针对保留明细。

## 不支持的情况

- 缺少必需表或字段；
- 加密 SQLite 数据库；
- 把 `created_at` 存成无法转换为 Unix 秒的文本；
- 把归档表的 `date` 存成无法识别的日期格式；
- 需要写入、修复或迁移数据库的场景。

遇到不兼容结构时，应用应返回带缺失字段名称的 schema 错误。不要通过猜测字段、修改数据库或静默丢弃数据来“兼容”。

## 脱敏测试 fixture

仓库中的 `test/fixtures/cc-switch-schema.sql` 只描述表结构，不含个人调用数据。它用于验证：

- 可选字段缺失时仍可读取；
- NULL Token 不会让整行统计失效；
- 没有 `status_code` 时明细仍可展示；
- 有 `session_id` 时会话聚合使用统一的模型口径。
