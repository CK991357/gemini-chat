# Python沙盒文件访问指南

## 背景
Python沙盒出于安全考虑，**移除了内置函数 `open` 及其相关异常**，因此无法使用传统的 `with open(...) as f:` 读取文件。**这是设计使然**，必须使用提供的安全替代方法。

## 文件位置
- **普通模式**：文件保存在 `/data/` 目录，对应宿主机 `temp` 会话目录。
- **Agent模式**：文件保存在 `/data/` 目录，对应宿主机独立会话目录（`session_xxx`）。

## 安全文件读取方法

### 1. 使用 pandas 内部句柄（推荐）
```python
import pandas as pd
import json

file_path = '/data/your_file.json'

try:
    with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
        content = f.handle.read()
        data = json.loads(content)
    print("文件读取成功")
except Exception as e:
    print(f"读取失败: {e}")
```

### 2. 直接使用 pandas 读取结构化数据
```python
# 读取 CSV
df = pd.read_csv('/data/data.csv')

# 读取 Excel
df = pd.read_excel('/data/data.xlsx')

# 读取 Parquet
df = pd.read_parquet('/data/data.parquet')
```

### 3. 读取文本文件
```python
import pandas as pd

file_path = '/data/notes.txt'
with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
    text = f.handle.read()
print(text)
```

### 4. 读取 Markdown 文件
Markdown 文件本质上是文本文件，因此读取方法与普通文本文件完全一致。你可以将 `.md` 文件作为文本读取，然后进行后续处理（如解析 front matter、渲染等）。

```python
import pandas as pd

file_path = '/data/document.md'
with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
    markdown_content = f.handle.read()
print(markdown_content)  # 或进一步处理
```

如果需要提取 Markdown 中的结构化信息（例如 YAML front matter），可以结合其他库（如 `frontmatter`、`markdown` 等），但请注意这些库可能需要额外安装，且在沙盒环境中需确认可用性。

### 5. 读取 JSON 文件（完整示例）
```python
import pandas as pd
import json

def read_json_safe(filepath):
    try:
        with pd.io.common.get_handle(filepath, 'r', is_text=True) as f:
            content = f.handle.read()
            return json.loads(content)
    except json.JSONDecodeError:
        print("JSON 格式错误")
        return None
    except Exception as e:
        print(f"读取失败: {e}")
        return None

data = read_json_safe('/data/financial.json')
if data:
    print("数据加载成功")
```

### 6. 读取大文件（分块）
```python
import pandas as pd

# 分块读取 CSV
chunks = []
for chunk in pd.read_csv('/data/large.csv', chunksize=10000):
    # 处理每个块
    chunks.append(chunk)
result = pd.concat(chunks)
```

### 7. 写入文件
```python
import pandas as pd

# 写入 CSV
df.to_csv('/data/output.csv', index=False)

# 写入 JSON
import json
with pd.io.common.get_handle('/data/output.json', 'w', is_text=True) as f:
    f.handle.write(json.dumps(data, indent=2))
```

## 注意事项
- 始终使用 `/data/` 前缀，不要使用绝对路径。
- 确保文件存在，否则会抛出异常。
- 如果遇到 `FileNotFoundError`，检查文件名和会话 ID 是否一致。
- 对于 Parquet 等二进制格式，使用 `pd.read_parquet` 等方法，无需手动处理二进制流。

## 常见错误及解决

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `NameError: name 'open' is not defined` | 尝试使用 `open` | 改用 `pd.io.common.get_handle` |
| `FileNotFoundError` | 文件路径错误或文件不在 `/data` | 确认文件名，使用 `os.listdir('/data')` 查看目录内容 |
| `JSONDecodeError` | JSON 格式错误 | 检查文件内容，或使用 `try-except` 捕获 |
