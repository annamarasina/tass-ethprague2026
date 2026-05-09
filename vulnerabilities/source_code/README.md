# Solidity Code Retrieval Demo

这个项目演示了如何使用自然语言描述来查找最符合的 Solidity 代码片段。

## 功能特性

- 从 Parquet 文件中读取 Solidity 代码
- 使用 Ollama 的 nomic-embed-text 模型生成向量嵌入
- 基于余弦相似度进行向量检索
- 支持向量缓存以提高查询速度
- 命令行接口，支持多种参数配置

## 安装依赖

首先确保你已经安装了 Python 3.8+，然后安装依赖：

```bash
pip install -r requirements.txt
```

## Ollama 设置

确保你已经安装并运行了 Ollama，并且下载了 nomic-embed-text 模型：

```bash
# 安装 Ollama（如果还没有安装）
# 下载模型
ollama pull nomic-embed-text

# 启动 Ollama 服务（如果没有运行）
ollama serve
```

## 使用方法

### 基本用法

```bash
python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query "ERC20 token transfer function" --top-k 5
```

### 参数说明

- `--file`: Parquet 文件路径（必需）
- `--query`: 自然语言查询描述（如果不提供，会提示输入）
- `--top-k`: 返回结果数量（默认 5）
- `--rebuild-cache`: 强制重新生成向量缓存
- `--content-column`: 包含 Solidity 代码的列名（默认 "content"）
- `--batch-size`: 嵌入生成批量大小，越小越稳定（默认 5）

### 示例查询

```bash
# 查找 ERC20 转账函数
python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query "ERC20 token transfer" --top-k 3

# 查找访问控制相关的代码
python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query "access control modifier" --top-k 5

# 交互式输入查询
python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --top-k 3

# 重新生成向量缓存
python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query "smart contract" --rebuild-cache
```

## 输出格式

程序会输出最匹配的代码片段，包括：
- 相似度分数
- 行号索引
- 代码片段内容（前500字符）

## 缓存机制

为了提高查询速度，程序会自动缓存向量嵌入到 `.npy` 文件中：
- 首次运行会生成向量缓存
- 后续查询会直接加载缓存
- 使用 `--rebuild-cache` 可以强制重新生成缓存

## 技术细节

- **向量模型**: nomic-embed-text (768 维)
- **相似度计算**: 余弦相似度
- **数据格式**: Apache Parquet
- **编程语言**: Python 3.8+

## 故障排除

1. **500 内部服务器错误**: Ollama 内存不足或文本过长
   ```bash
   # 使用更小的批量大小
   python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query "ERC20" --batch-size 1
   ```

2. **模型未找到**: 确保模型已下载
   ```bash
   ollama pull nomic-embed-text
   ```

3. **内存不足**: 对于大型数据集，考虑分批处理
   ```bash
   # 只处理前1000个样本进行测试
   python find_solidity_by_nl.py --file small_dataset.parquet --query "test"
   ```

4. **连接超时**: 增加超时时间或检查 Ollama 服务状态
   ```bash
   ollama serve  # 确保服务正在运行
   ```