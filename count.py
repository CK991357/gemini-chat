import os
import sys
from pathlib import Path
import json

def count_chars_in_repo(repo_path=".", extensions=None, exclude_dirs=None, 
                       exclude_extensions=None, exclude_paths=None, max_file_size_mb=10):
    """统计代码仓库的字符数
    
    Args:
        repo_path: 仓库路径
        extensions: 要统计的文件扩展名集合
        exclude_dirs: 要排除的目录名集合
        exclude_extensions: 要排除的文件扩展名集合
        exclude_paths: 要排除的完整路径集合
        max_file_size_mb: 最大文件大小(MB)，超过的文件跳过
    """
    if extensions is None:
        extensions = {
            # JavaScript/TypeScript
            '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
            # Python
            '.py', '.pyx', '.pyi', 
            # Java/Kotlin
            '.java', '.kt', '.kts', '.scala',
            # C/C++
            '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx',
            # Go/Rust
            '.go', '.rs',
            # PHP
            '.php', 
            # Swift
            '.swift',
            # Objective-C
            '.m', '.mm',
            # .NET
            '.cs', '.fs', '.vb',
            # Ruby/Perl
            '.rb', '.pl', '.pm',
            # 其他语言
            '.lua', '.dart', '.elm', '.ex', '.exs', '.r', '.rmd', '.jl',
            # Shell脚本
            '.sh', '.bash', '.zsh', '.fish', '.ps1',
            # Web相关
            '.html', '.htm', '.xhtml',
            '.css', '.scss', '.sass', '.less', '.styl',
            '.xml', '.svg',
            # 配置文件
            '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties',
            # 文档
            '.md', '.markdown', '.txt', '.rst', '.tex',
            # 数据文件
            '.csv', '.tsv', '.sql'
        }
    
    # 根据您提供的列表，完全排除这些目录
    if exclude_dirs is None:
        exclude_dirs = {
            # Git相关
            '.git',
            # Node.js相关
            'node_modules', 'node_modules/', 'jspm_packages', 'web_modules',
            # 构建输出
            'dist', 'build', 'build/Release', 'release', 'out',
            '.next', '.nuxt', '.vuepress/dist', '.docusaurus',
            # 缓存目录
            '.cache', '.parcel-cache', '.npm', '.eslintcache', '.stylelintcache',
            '.rpt2_cache', '.rts2_cache_cjs', '.rts2_cache_es', '.rts2_cache_umd',
            '.fusebox', '.dynamodb',
            # 测试相关
            'coverage', '.nyc_output', 'lib-cov',
            # IDE相关
            '.idea', '.vscode', '.vs',
            # 日志
            'logs',
            # 临时文件
            '.temp', '.tmp', 'temp', 'tmp',
            # 包管理
            'bower_components', '.grunt', '.serverless',
            # 环境
            '.env', '.env.local', '.env.development.local', '.env.test.local', '.env.production.local',
            # 其他
            '.pnpm-debug.log*', '.yarn', '.pnp.*', '.wrangler', '.kilocode', '.claude',
        }
    
    # 您特别指定的要排除的路径
    if exclude_paths is None:
        exclude_paths = {
            # 您明确指定的目录
            '项目信息_非实现',
            'specs_framework',
            'specs',
            'mcp',
            'backendserver_Tools',
            'docs',  # 根目录下的docs
            '.vscode/launch.json',  # 特定文件
            'bmain.js',  # 特定文件
        }
    
    if exclude_extensions is None:
        exclude_extensions = {'.min.js', '.min.css', '.bundle.js'}
    
    repo_path = Path(repo_path).resolve()
    print(f"正在统计目录: {repo_path}")
    print(f"排除目录: {len(exclude_dirs)} 个通用目录 + {len(exclude_paths)} 个指定路径")
    
    total_chars = 0
    total_files = 0
    skipped_files = 0
    skipped_large_files = 0
    file_types = {}
    dir_stats = {}
    excluded_paths_count = 0
    
    for root, dirs, files in os.walk(repo_path):
        root_path = Path(root)
        rel_root = root_path.relative_to(repo_path) if root_path != repo_path else Path('.')
        
        # 检查是否在排除路径中
        skip_this_dir = False
        for exclude_path in exclude_paths:
            # 如果是相对路径，检查是否匹配
            exclude_path_obj = Path(exclude_path)
            try:
                # 检查当前目录是否以排除路径开头
                if str(rel_root).startswith(str(exclude_path_obj)) or str(exclude_path_obj) in str(rel_root):
                    skip_this_dir = True
                    excluded_paths_count += 1
                    break
            except:
                pass
        
        if skip_this_dir:
            dirs[:] = []  # 清空目录列表，不再深入遍历
            continue
        
        # 排除指定目录
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            filepath = root_path / file
            rel_filepath = rel_root / file if rel_root != Path('.') else Path(file)
            
            # 检查特定文件是否在排除列表中
            if str(rel_filepath) in exclude_paths:
                skipped_files += 1
                continue
            
            ext = filepath.suffix.lower()
            full_ext = ''.join(filepath.suffixes).lower() if len(filepath.suffixes) > 1 else ext
            
            # 检查是否需要排除扩展名
            if any(full_ext.endswith(exclude_ext) for exclude_ext in exclude_extensions):
                skipped_files += 1
                continue
            
            # 检查扩展名
            if ext in extensions:
                try:
                    # 检查文件大小
                    file_size_mb = filepath.stat().st_size / (1024 * 1024)
                    if file_size_mb > max_file_size_mb:
                        skipped_large_files += 1
                        continue
                    
                    # 读取文件内容
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        chars = len(content)
                        total_chars += chars
                        total_files += 1
                        
                        # 按文件类型统计
                        file_types[ext] = file_types.get(ext, {'count': 0, 'chars': 0})
                        file_types[ext]['count'] += 1
                        file_types[ext]['chars'] += chars
                        
                        # 按目录统计
                        dir_key = str(rel_root)
                        dir_stats[dir_key] = dir_stats.get(dir_key, {'count': 0, 'chars': 0})
                        dir_stats[dir_key]['count'] += 1
                        dir_stats[dir_key]['chars'] += chars
                        
                except (IOError, PermissionError, UnicodeDecodeError) as e:
                    skipped_files += 1
                except Exception as e:
                    skipped_files += 1
    
    return total_files, total_chars, skipped_files, skipped_large_files, excluded_paths_count, file_types, dir_stats

def print_report(total_files, total_chars, skipped_files, skipped_large_files, excluded_paths_count,
                 file_types, dir_stats, top_n=15):
    """打印统计报告"""
    print("\n" + "="*80)
    print("📊 代码仓库字符统计报告 (排除指定目录)")
    print("="*80)
    
    # 总体统计
    print(f"\n📈 总体统计:")
    print(f"   ├─ 统计文件数: {total_files:,}")
    print(f"   ├─ 总字符数: {total_chars:,}")
    print(f"   ├─ 跳过的文件: {skipped_files:,}")
    print(f"   ├─ 跳过大文件(>{10}MB): {skipped_large_files:,}")
    print(f"   └─ 排除的路径: {excluded_paths_count:,}")
    
    print(f"\n📊 字符量统计:")
    print(f"   ├─ 相当于 {total_chars/1000:,.1f} 千字符")
    print(f"   ├─ 相当于 {total_chars/10000:,.1f} 万字（中文标准）")
    if total_files > 0:
        print(f"   └─ 平均每个文件: {total_chars/total_files:,.0f} 字符")
    else:
        print(f"   └─ 平均每个文件: 0 字符")
    
    # 按文件类型汇总
    if file_types:
        print(f"\n📁 按文件类型汇总 (前{top_n}种):")
        print("-"*70)
        print(f"{'扩展名':<10} {'文件数':<10} {'字符数':<15} {'占比':<8} {'平均大小':<10}")
        print("-"*70)
        
        sorted_types = sorted(file_types.items(), key=lambda x: x[1]['chars'], reverse=True)
        
        # 前top_n种类型
        for i, (ext, data) in enumerate(sorted_types[:top_n], 1):
            percent = (data['chars'] / total_chars * 100) if total_chars > 0 else 0
            avg_chars = data['chars'] / data['count'] if data['count'] > 0 else 0
            print(f"{i:2}. {ext:<8} {data['count']:<10,} {data['chars']:<15,} {percent:<7.1f}% {avg_chars:<10,.0f}")
        
        # 其他类型汇总
        if len(sorted_types) > top_n:
            other_count = sum(data['count'] for _, data in sorted_types[top_n:])
            other_chars = sum(data['chars'] for _, data in sorted_types[top_n:])
            other_percent = (other_chars / total_chars * 100) if total_chars > 0 else 0
            print("-"*70)
            print(f"   其他类型 {len(sorted_types)-top_n:>2}种 {other_count:<10,} {other_chars:<15,} {other_percent:<7.1f}%")
    
    # 按目录汇总
    if dir_stats:
        print(f"\n📂 按目录汇总 (字符量前{top_n}个目录):")
        print("-"*70)
        print(f"{'目录':<40} {'文件数':<8} {'字符数':<15} {'占比':<8}")
        print("-"*70)
        
        sorted_dirs = sorted(dir_stats.items(), key=lambda x: x[1]['chars'], reverse=True)
        
        for i, (dir_path, data) in enumerate(sorted_dirs[:top_n], 1):
            percent = (data['chars'] / total_chars * 100) if total_chars > 0 else 0
            display_dir = dir_path if dir_path != '.' else '[根目录]'
            # 截断过长的目录名
            if len(display_dir) > 38:
                display_dir = '...' + display_dir[-35:]
            print(f"{i:2}. {display_dir:<38} {data['count']:<8,} {data['chars']:<15,} {percent:<7.1f}%")
    
    # JavaScript特别统计
    js_extensions = {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue'}
    js_stats = {ext: file_types.get(ext, {'count': 0, 'chars': 0}) for ext in js_extensions}
    
    if any(js_stats[ext]['count'] > 0 for ext in js_extensions):
        print(f"\n🔍 JavaScript/TypeScript相关文件详细统计:")
        print("-"*50)
        print(f"{'类型':<10} {'文件数':<10} {'字符数':<15} {'占比':<8}")
        print("-"*50)
        
        js_total_count = 0
        js_total_chars = 0
        
        for ext in sorted(js_extensions):
            if file_types.get(ext, {}).get('count', 0) > 0:
                data = file_types[ext]
                percent = (data['chars'] / total_chars * 100) if total_chars > 0 else 0
                print(f"  {ext:<8} {data['count']:<10,} {data['chars']:<15,} {percent:<7.1f}%")
                js_total_count += data['count']
                js_total_chars += data['chars']
        
        if js_total_count > 0:
            js_percent = (js_total_chars / total_chars * 100) if total_chars > 0 else 0
            print("-"*50)
            print(f"  {'合计':<8} {js_total_count:<10,} {js_total_chars:<15,} {js_percent:<7.1f}%")
    
    print(f"\n📋 已排除的目录/路径:")
    print("   - 项目信息_非实现")
    print("   - specs_framework, specs")
    print("   - mcp, backendserver_Tools")
    print("   - docs (根目录)")
    print("   - .vscode/launch.json, bmain.js")
    print("   - 以及标准的.gitignore排除项")

def export_to_json(filename, total_files, total_chars, file_types, dir_stats):
    """导出统计结果到JSON文件"""
    data = {
        "summary": {
            "total_files": total_files,
            "total_chars": total_chars,
            "chars_in_k": total_chars / 1000,
            "chars_in_10k_words": total_chars / 10000
        },
        "file_types": {ext: dict(data) for ext, data in file_types.items()},
        "directories": {dir_path: dict(data) for dir_path, data in dir_stats.items()}
    }
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ 统计结果已导出到: {filename}")

def main():
    # 检查是否传入路径参数
    if len(sys.argv) > 1:
        repo_path = sys.argv[1]
    else:
        repo_path = input("请输入仓库路径（直接回车使用当前目录）: ").strip()
        if not repo_path:
            repo_path = "."
    
    try:
        print("🔍 正在统计（已启用自定义排除规则），请稍候...")
        total_files, total_chars, skipped_files, skipped_large_files, excluded_paths_count, file_types, dir_stats = \
            count_chars_in_repo(repo_path)
        
        print_report(total_files, total_chars, skipped_files, skipped_large_files, 
                    excluded_paths_count, file_types, dir_stats, top_n=15)
        
        # 询问是否导出结果
        export_choice = input("\n📤 是否导出统计结果为JSON文件？(y/n): ").strip().lower()
        if export_choice in ['y', 'yes', '是']:
            export_file = input("请输入导出文件名（默认: code_stats_filtered.json）: ").strip()
            if not export_file:
                export_file = "code_stats_filtered.json"
            export_to_json(export_file, total_files, total_chars, file_types, dir_stats)
        
    except KeyboardInterrupt:
        print("\n\n❌ 用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()