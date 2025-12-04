# code_interpreter.py - 最终优化确认版 v2.5 - 支持所有图表类型自动捕获

import docker
import asyncio
import logging
from pydantic import BaseModel, Field
from docker.errors import DockerException, ContainerError, ImageNotFound, NotFound
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from contextlib import asynccontextmanager
import json
import os
import shutil
from pathlib import Path
import uuid
from datetime import datetime, timedelta
import threading
import time

# 🎯 为文件管理器功能导入新的依赖
from typing import List
from fastapi.responses import FileResponse
import urllib.parse

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 会话工作区配置 ---
SESSION_WORKSPACE_ROOT = Path("/srv/sandbox_workspaces")
SESSION_WORKSPACE_ROOT.mkdir(exist_ok=True)
SESSION_TIMEOUT_HOURS = 24  # 会话超时时间（小时）

# 为文件管理API定义数据蓝图
class FileInfo(BaseModel):
    name: str
    session_id: str  # 核心修改：让前端知道文件属于哪个会话

class RenameRequest(BaseModel):
    new_filename: str

# --- Pydantic Input Schema ---
class CodeInterpreterInput(BaseModel):
    """Input schema for the Code Interpreter tool."""
    code: str = Field(description="The Python code to be executed in the sandbox.")

# --- Tool Class ---
class CodeInterpreterTool:
    """
    Executes Python code in a secure, isolated Docker sandbox.
    Returns stdout/stderr. No network, no host filesystem, mem+CPU capped.
    """
    name = "python_sandbox"
    description = (
        "Executes a snippet of Python code in a sandboxed environment and returns the output. "
        "This tool is secure and has no access to the internet or the host filesystem."
    )
    input_schema = CodeInterpreterInput

    def __init__(self):
        """简化构造函数，移除后台线程启动"""
        self.docker_client = None
        self.initialize_docker_client()
        # 🚀 关键修复：移除 self.start_cleanup_thread()

    def initialize_docker_client(self):
        """Initialize Docker client with error handling"""
        try:
            self.docker_client = docker.from_env()
            self.docker_client.ping()
            logger.info("Docker client initialized successfully")
        except DockerException as e:
            logger.warning(f"Docker initialization failed: {e}")
            self.docker_client = None

    def check_image(self, image_name):
        """Checks if the Docker image exists locally."""
        if not self.docker_client:
            raise RuntimeError("Docker client not available")
        try:
            self.docker_client.images.get(image_name)
        except ImageNotFound:
            raise RuntimeError(f"Docker image '{image_name}' not found.")

    def cleanup_old_sessions(self):
        """清理过期的会话工作区"""
        try:
            current_time = datetime.now()
            cleaned_count = 0
            
            for session_dir in SESSION_WORKSPACE_ROOT.iterdir():
                if session_dir.is_dir():
                    # 检查目录修改时间
                    stat = session_dir.stat()
                    modify_time = datetime.fromtimestamp(stat.st_mtime)
                    if current_time - modify_time > timedelta(hours=SESSION_TIMEOUT_HOURS):
                        try:
                            shutil.rmtree(session_dir)
                            logger.info(f"Cleaned up expired session: {session_dir.name}")
                            cleaned_count += 1
                        except Exception as e:
                            logger.error(f"Failed to cleanup session {session_dir.name}: {e}")
            
            if cleaned_count > 0:
                logger.info(f"Cleanup completed: {cleaned_count} sessions removed")
                
        except Exception as e:
            logger.error(f"Cleanup process failed: {e}")

    async def execute(self, parameters: CodeInterpreterInput, session_id: str = None) -> dict:
        if not self.docker_client:
            logger.warning("execute called but Docker client is not available.")
            return {"success": False, "error": "Docker daemon not available."}
            
        image_name = "tools-python-sandbox"
        
        try:
            self.check_image(image_name)
        except Exception as e:
            logger.error(f"Image preparation failed: {e}")
            return {"success": False, "error": f"Image preparation failed: {e}"}
        
        # --- 核心修复：将所有图表捕获逻辑整合到 runner_script 内部 ---
        runner_script = f"""
import sys, traceback, io, json, base64, tempfile, os

# 🔥 新增：Plotly 配置
def setup_plotly():
    try:
        import plotly.io as pio
        # 设置默认渲染器为kaleido
        pio.renderers.default = "kaleido"
        # 配置kaleido
        pio.kaleido.scope.default_format = "png"
        pio.kaleido.scope.default_width = 1200
        pio.kaleido.scope.default_height = 800
        
        # 设置中文字体（如果可用）
        try:
            # 检查是否有中文字体
            import matplotlib.font_manager as fm
            available_fonts = set(f.name for f in fm.fontManager.ttflist)
            chinese_fonts = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'SimHei', 'Microsoft YaHei']
            for font in chinese_fonts:
                if font in available_fonts:
                    # Plotly字体配置
                    import plotly.graph_objects as go
                    go.layout.Template.layout.font.family = font
                    break
        except:
            pass
        
        print("[PLOTLY_CONFIG] Plotly配置完成", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[PLOTLY_CONFIG] 配置失败: {{e}}", file=sys.stderr)
        return False

# 执行Plotly配置
setup_plotly()

# --- 统一的图表捕获和字体配置系统 ---
def setup_unified_chart_system():
    try:
        import warnings
        import matplotlib.pyplot as plt
        
        # 🎯 精准屏蔽 Matplotlib 的字体警告
        warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

        import matplotlib.font_manager as fm
        # 字体优先级列表
        font_preferences = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'DejaVu Sans', 'Arial Unicode MS']
        available_fonts = set(f.name for f in fm.fontManager.ttflist)
        
        # 设置找到的第一个偏好字体
        for font_name in font_preferences:
            if font_name in available_fonts:
                plt.rcParams['font.family'] = font_name
                break
        
        # 金融图表常用配置
        plt.rcParams['axes.unicode_minus'] = False
        plt.rcParams['font.size'] = 10
        plt.rcParams['figure.titlesize'] = 12
        plt.rcParams['axes.labelsize'] = 10
        
        # --- 捕获 matplotlib title ---
        title_holder = [None]
        original_title_func = plt.title
        def new_title_func(label, *args, **kwargs):
            title_holder[0] = label
            return original_title_func(label, *args, **kwargs)
        plt.title = new_title_func
        
        return title_holder

    except ImportError:
        return [None]
    except Exception as e:
        print(f"Font setup failed inside sandbox: {{e}}", file=sys.stderr)
        return [None]

# --- Redirect stdout/stderr ---
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = buffer_stdout = io.StringIO()
sys.stderr = buffer_stderr = io.StringIO()

stdout_val = ""
stderr_val = ""

try:
    # 关键：在执行用户代码前，先运行字体和配置
    title_holder = setup_unified_chart_system()

    # 安全的内置函数列表
    safe_builtins = {{
        '__import__': __import__, 'print': print, 'repr': repr, 'bool': bool, 'int': int, 
        'float': float, 'str': str, 'list': list, 'dict': dict, 'set': set, 'tuple': tuple, 
        'type': type, 'len': len, 'range': range, 'sorted': sorted, 'reversed': reversed, 
        'zip': zip, 'enumerate': enumerate, 'slice': slice, 'abs': abs, 'max': max, 
        'min': min, 'sum': sum, 'round': round, 'pow': pow, 'divmod': divmod, 
        'isinstance': isinstance, 'issubclass': issubclass, 'hasattr': hasattr, 
        'getattr': getattr, 'setattr': setattr,
    }}
    
    exec_globals = {{'__builtins__': safe_builtins}}
    
    # 🎯 关键：为 Graphviz 和 NetworkX 提供必要的模块
    exec_globals['graphviz'] = __import__('graphviz')
    exec_globals['Digraph'] = getattr(__import__('graphviz'), 'Digraph')
    exec_globals['nx'] = __import__('networkx')
    exec_globals['plt'] = __import__('matplotlib.pyplot')
    
    # 执行用户代码
    exec({repr(parameters.code)}, exec_globals)
    
    stdout_val = buffer_stdout.getvalue()
    stderr_val = buffer_stderr.getvalue()

except Exception as e:
    stdout_val = buffer_stdout.getvalue()
    stderr_val = buffer_stderr.getvalue() + '\\n' + traceback.format_exc()
finally:
    sys.stdout = old_stdout
    sys.stderr = old_stderr

# --- 智能输出处理系统 ---
output_processed = False
stripped_stdout = stdout_val.strip()

# 智能提取核心内容，兼容模型可能输出的额外包裹
def extract_core_content(s):
    # 移除markdown代码块
    if s.startswith("```") and s.endswith("```"):
        lines = s.split('\\n')
        if len(lines) > 2:
            s = '\\n'.join(lines[1:-1])

    # 移除常见的包裹，例如 '[...]' 或 '(...)'
    if (s.startswith('[') and s.endswith(']')) or \\
       (s.startswith('(') and s.endswith(')')):
        s = s[1:-1].strip()
    return s

core_content = extract_core_content(stripped_stdout)

# 优先检查核心内容是否是任何我们期望的标准 JSON 格式
if core_content.startswith('{{') and core_content.endswith('}}'):
    try:
        parsed = json.loads(core_content)
        # 扩展支持的类型
        supported_types = ['image', 'excel', 'word', 'ppt', 'pdf', 'analysis_report', 'ml_report', 
                          'statistical_analysis', 'scientific_computing', 'scipy_optimization', 
                          'scipy_integration', 'scipy_signal_processing', 'scipy_linear_algebra', 
                          'symbolic_math', 'equation_solutions', 'calculus_results', 
                          'mathematical_proofs', 'linear_algebra', 'numerical_approximations', 
                          'complex_math_solution']
        if parsed.get('type') in supported_types:
            print(core_content, end='')
            output_processed = True
    except json.JSONDecodeError:
        pass

# 如果尚未处理，再检查核心内容是否是裸的 Base64 图片
if not output_processed:
    is_image = False
    if len(core_content) > 100 and (core_content.startswith(('iVBORw0KGgo', '/9j/'))):
        try:
            base64.b64decode(core_content, validate=True)
            is_image = True
        except Exception:
            is_image = False
    
    if is_image:
        captured_title = title_holder[0] if title_holder[0] else "Generated Chart"
        output_data = {{"type": "image", "title": captured_title, "image_base64": core_content}}
        print(json.dumps(output_data), end='')
        output_processed = True

# 🚀🚀🚀 --- 核心修复：统一的图表自动捕获系统 --- 🚀🚀🚀

# 1. 首先尝试捕获 Matplotlib 图表
if not output_processed and 'matplotlib.pyplot' in sys.modules:
    plt = sys.modules['matplotlib.pyplot']
    if plt.get_fignums():
        try:
            # 🔥🔥🔥 终极修正：在保存图片前，强行把字体改回正确的！
            plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei']
            plt.rcParams['axes.unicode_minus'] = False

            fig = plt.gcf()
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            plt.close('all')
            buf.seek(0)
            image_base64 = base64.b64encode(buf.read()).decode('utf-8')
            
            captured_title = title_holder[0] if title_holder[0] else "Auto-Captured Chart"
            output_data = {{"type": "image", "title": captured_title, "image_base64": image_base64}}
            print(json.dumps(output_data), end='')
            output_processed = True
        except Exception as matplotlib_capture_error:
            print(f"\\n[SYSTEM_ERROR] Matplotlib chart capture failed: {{matplotlib_capture_error}}", file=sys.stderr, end='')

# 2. 然后尝试捕获 Graphviz 图表
if not output_processed:
    try:
        # 检查是否有 Graphviz Digraph 对象被创建
        graphviz_objects = []
        for var_name, var_value in exec_globals.items():
            if hasattr(var_value, '__class__') and hasattr(var_value.__class__, '__name__'):
                if var_value.__class__.__name__ == 'Digraph':
                    graphviz_objects.append((var_name, var_value))
        
        if graphviz_objects:
            # 取最后一个创建的图表
            _, digraph_obj = graphviz_objects[-1]
            
            # 使用临时文件渲染 Graphviz
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                temp_filename = tmp.name
            
            try:
                # 渲染为 PNG
                digraph_obj.render(filename=temp_filename, format='png', cleanup=True)
                
                # 读取渲染的图片
                rendered_file = temp_filename + '.png'
                with open(rendered_file, 'rb') as f:
                    image_data = f.read()
                
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                
                # 获取图表标题
                chart_title = getattr(digraph_obj, 'name', 'Graphviz Diagram')
                if not chart_title or chart_title == 'G':
                    chart_title = "Graphviz Flowchart"
                
                output_data = {{"type": "image", "title": chart_title, "image_base64": image_base64}}
                print(json.dumps(output_data), end='')
                output_processed = True
                
                # 清理临时文件
                os.unlink(rendered_file)
                
            except Exception as render_error:
                print(f"\\n[SYSTEM_ERROR] Graphviz render failed: {{render_error}}", file=sys.stderr, end='')
            finally:
                if os.path.exists(temp_filename):
                    os.unlink(temp_filename)
                    
    except Exception as graphviz_error:
        print(f"\\n[SYSTEM_ERROR] Graphviz capture failed: {{graphviz_error}}", file=sys.stderr, end='')

# 3. 最后捕获 NetworkX 图表（通过 Matplotlib）
if not output_processed and 'networkx' in sys.modules and 'matplotlib.pyplot' in sys.modules:
    try:
        plt = sys.modules['matplotlib.pyplot']
        # 检查是否有活动的 NetworkX 图表
        if plt.get_fignums():
            # 应用字体修正
            plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei']
            plt.rcParams['axes.unicode_minus'] = False
            
            # 捕获当前图形
            fig = plt.gcf()
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            plt.close('all')
            buf.seek(0)
            image_base64 = base64.b64encode(buf.read()).decode('utf-8')
            
            captured_title = title_holder[0] if title_holder[0] else "NetworkX Diagram"
            output_data = {{"type": "image", "title": captured_title, "image_base64": image_base64}}
            print(json.dumps(output_data), end='')
            output_processed = True
            
    except Exception as networkx_error:
        print(f"\\n[SYSTEM_ERROR] NetworkX capture failed: {{networkx_error}}", file=sys.stderr, end='')

# 4. 捕获 Plotly 图表
if not output_processed:
    try:
        # 检查是否有 Plotly 图形对象
        plotly_objects = []
        for var_name, var_value in exec_globals.items():
            # 检查对象是否为 Plotly Figure 且具有 to_image 方法
            if hasattr(var_value, '__class__') and var_value.__class__.__name__ == 'Figure' and hasattr(var_value, 'to_image'):
                plotly_objects.append((var_name, var_value))
        
        if plotly_objects:
            # 捕获最后一个创建的 Plotly 图形对象
            _, plotly_fig = plotly_objects[-1]
            
            # 转换为静态图片 (依赖 kaleido)
            img_bytes = plotly_fig.to_image(format="png", width=1200, height=800)
            image_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            # 获取标题
            chart_title = "Plotly Chart"
            if hasattr(plotly_fig, 'layout') and plotly_fig.layout.title and plotly_fig.layout.title.text:
                chart_title = str(plotly_fig.layout.title.text)
            
            output_data = {"type": "image", "title": chart_title, "image_base64": image_base64}
            print(json.dumps(output_data), end='')
            output_processed = True
            
    except Exception as plotly_error:
        # 仅在 stderr 中打印错误，不影响 stdout 的最终输出
        print(f"\\n[SYSTEM_ERROR] Plotly capture failed: {{plotly_error}}", file=sys.stderr, end='')

# 🚀🚀🚀 --- 统一的图表捕获系统结束 --- 🚀🚀🚀

# 如果没有图表被捕获，输出原始 stdout
if not output_processed:
    print(stdout_val, end='')

# 总是输出 stderr
print(stderr_val, file=sys.stderr, end='')
"""
        container = None
        try:
            logger.info(f"Running code in sandbox. Code length: {len(parameters.code)}")
            
            # --- 文件挂载逻辑 ---
            container_config = {
                "image": image_name,
                "command": ["python", "-c", runner_script],
                "network_disabled": True,
                "environment": {'MPLCONFIGDIR': '/tmp'},
                "mem_limit": "1g",
                "cpu_period": 100_000,
                "cpu_quota": 50_000,
                "read_only": True,
                "tmpfs": {'/tmp': 'size=100M,mode=1777'},
                "detach": True
            }
            
            # 如果有 session_id，挂载会话工作区
            if session_id:
                host_session_path = SESSION_WORKSPACE_ROOT / session_id
                # 🎯 核心修复：按需创建会话目录，解耦对文件上传的依赖
                host_session_path.mkdir(exist_ok=True)
                
                # 现在可以安全地挂载
                container_config["volumes"] = {
                    str(host_session_path.resolve()): {
                        'bind': '/data',
                        'mode': 'rw'
                    }
                }
                container_config["working_dir"] = '/data'
                logger.info(f"Mounting session workspace: {host_session_path} -> /data")
            
            container = self.docker_client.containers.create(**container_config)

            container.start()
            result = container.wait(timeout=90)
            exit_code = result.get('StatusCode', -1)

            stdout = container.logs(stdout=True, stderr=False).decode('utf-8', errors='ignore')
            stderr = container.logs(stdout=False, stderr=True).decode('utf-8', errors='ignore')
            
            logger.info(f"Sandbox execution finished. Exit code: {exit_code}")
            if stdout: 
                logger.info(f"Sandbox stdout (first 200 chars): {stdout[:200]}")
            if stderr: 
                logger.warning(f"Sandbox stderr: {stderr}")

            return {
                "success": True,
                "data": {"stdout": stdout, "stderr": stderr, "exit_code": exit_code}
            }
            
        except ContainerError as e:
            logger.error(f"Sandbox ContainerError: {e}")
            stdout = e.stdout.decode('utf-8', errors='ignore') if e.stdout else ""
            stderr = e.stderr.decode('utf-8', errors='ignore') if e.stderr else ""
            return {"success": True, "data": {"stdout": stdout, "stderr": stderr, "exit_code": e.exit_status}}
        except Exception as e:
            logger.error(f"An unexpected error occurred during sandbox execution: {e}")
            return {"success": False, "error": f"Sandbox execution framework error: {e}"}
        finally:
            if container:
                try:
                    container.remove(force=True)
                    logger.info(f"Sandbox container {container.short_id} removed.")
                except NotFound: 
                    pass
                except Exception as e: 
                    logger.error(f"Failed to remove container {container.short_id}: {e}")

# --- FastAPI Application ---

# 🚀🚀🚀 --- 核心修复：使用 lifespan 事件安全地启动后台任务 --- 🚀🚀🚀
cleanup_thread = None
cleanup_stop_event = threading.Event()

def cleanup_worker(tool_instance):
    """后台清理工作线程"""
    logger.info("Cleanup worker thread started")
    
    while not cleanup_stop_event.is_set():
        try:
            tool_instance.cleanup_old_sessions()
        except Exception as e:
            logger.error(f"Cleanup thread error: {e}")
        
        # 等待1小时或直到停止事件被设置
        cleanup_stop_event.wait(3600)
    
    logger.info("Cleanup worker thread stopped")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global code_interpreter_instance, cleanup_thread
    
    # --- 应用启动时 ---
    logger.info("Application starting up...")
    code_interpreter_instance = CodeInterpreterTool()
    
    # 启动后台清理线程
    cleanup_thread = threading.Thread(
        target=cleanup_worker, 
        args=(code_interpreter_instance,),
        daemon=True,
        name="SessionCleanupThread"
    )
    cleanup_thread.start()
    logger.info("Session cleanup thread started via lifespan event")
    
    yield
    
    # --- 应用关闭时 ---
    logger.info("Application shutting down. Stopping cleanup thread...")
    cleanup_stop_event.set()
    
    # 等待线程安全退出（最多等待5秒）
    if cleanup_thread and cleanup_thread.is_alive():
        cleanup_thread.join(timeout=5.0)
        if cleanup_thread.is_alive():
            logger.warning("Cleanup thread did not stop gracefully")
        else:
            logger.info("Cleanup thread stopped gracefully")
    
    if code_interpreter_instance and code_interpreter_instance.docker_client:
        code_interpreter_instance.docker_client.close()
        logger.info("Docker client closed")
    
    logger.info("Application shutdown complete")

app = FastAPI(
    lifespan=lifespan,
    title="Python Sandbox API",
    description="Secure Python code execution environment with file upload support",
    version="2.5"
)

# --- 文件上传API ---
@app.post("/api/v1/files/upload")
async def upload_file(session_id: str = Form(...), file: UploadFile = File(...)):
    """上传文件到会话工作区"""
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID is required.")

    # 验证文件类型
    allowed_extensions = {'.xlsx', '.xls', '.parquet', '.csv', '.json', '.txt'}
    mime_to_extension = {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'application/octet-stream': '.parquet',  # Parquet 文件可能使用这个MIME类型
        'text/csv': '.csv',
        'application/json': '.json',
        'text/plain': '.txt'
    }

    file_extension = Path(file.filename).suffix.lower()
    mime_type = file.content_type

    # 🎯 核心修复：更清晰的验证逻辑
    is_allowed = False
    # 1. 优先检查文件扩展名
    if file_extension in allowed_extensions:
        is_allowed = True
        logger.info(f"File allowed by extension: {file.filename}")
    # 2. 如果扩展名不匹配，再检查MIME类型作为后备方案
    elif mime_type in mime_to_extension:
        is_allowed = True
        logger.info(f"File allowed by MIME type: {file.filename} (MIME: {mime_type})")

    if not is_allowed:
        logger.error(f"Unsupported file type rejected: {file.filename}, ext: {file_extension}, mime: {mime_type}")
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_extension} (MIME: {mime_type})。支持的类型: {', '.join(allowed_extensions)}"
        )

    session_dir = SESSION_WORKSPACE_ROOT / session_id
    session_dir.mkdir(exist_ok=True)
    
    file_path = session_dir / file.filename
    
    try:
        # 保存文件
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 更新目录修改时间
        file_path.touch()
        
        container_path = f"/data/{file.filename}"
        file_size = file_path.stat().st_size
        
        logger.info(f"File '{file.filename}' ({file_size} bytes) uploaded for session '{session_id}' -> '{container_path}'")
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "filename": file.filename,
            "container_path": container_path,
            "file_size": file_size,
            "session_id": session_id
        }
    except Exception as e:
        logger.error(f"File upload failed for session '{session_id}': {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

# --- 清理会话API ---
@app.delete("/api/v1/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """清理指定会话的工作区"""
    session_dir = SESSION_WORKSPACE_ROOT / session_id
    
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        shutil.rmtree(session_dir)
        logger.info(f"Session workspace cleaned up: {session_id}")
        return {
            "success": True,
            "message": f"Session {session_id} cleaned up successfully"
        }
    except Exception as e:
        logger.error(f"Failed to cleanup session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {e}")

# --- 代码执行API ---
@app.post('/api/v1/python_sandbox')
async def run_python_sandbox(request_data: dict):
    try:
        # 从请求中获取 session_id
        session_id = request_data.get('session_id')
        code_to_execute = request_data.get('parameters', {}).get('code')
        
        if not code_to_execute:
            raise HTTPException(status_code=422, detail="Missing 'code' field.")
        
        input_data = CodeInterpreterInput(code=code_to_execute)
        
        # 将 session_id 传递给 execute 方法
        result = await code_interpreter_instance.execute(input_data, session_id)
        
        if result.get("success"):
            return result.get("data")
        else:
            raise HTTPException(status_code=500, detail=result.get("error"))
    except Exception as e:
        logger.error(f"Internal server error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/health')
async def health_check():
    """Health check endpoint"""
    try:
        if code_interpreter_instance and code_interpreter_instance.docker_client:
            code_interpreter_instance.docker_client.ping()
            return {
                "status": "healthy", 
                "docker": "connected",
                "version": "2.5",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {"status": "degraded", "docker": "not_available"}
    except Exception as e:
        return {"status": "degraded", "docker": f"error: {e}"}

@app.get('/')
async def root():
    """Root endpoint with basic info"""
    return {
        "message": "Python Sandbox API with File Upload",
        "version": "2.5",
        "endpoints": {
            "execute_code": "POST /api/v1/python_sandbox",
            "upload_file": "POST /api/v1/files/upload",
            "cleanup_session": "DELETE /api/v1/sessions/{session_id}",
            "list_files_session": "GET /api/v1/files/list/{session_id}",
            "download_file_session": "GET /api/v1/files/download/{session_id}/{filename}",
            "list_files_global": "GET /api/v1/files/global/list-all",
            "download_file_global": "GET /api/v1/files/global/download/{filename}",
            "delete_file_global": "DELETE /api/v1/files/global/delete/{filename}",
            "rename_file_global": "PATCH /api/v1/files/global/rename/{filename}",
            "health_check": "GET /health"
        }
    }

# --- 安全性辅助函数 (保持不变) ---
def get_safe_path(session_id: str, filename: str = None) -> Path:
    """构造并验证特定会话的文件/目录路径。"""
    if ".." in session_id or "/" in session_id:
        raise HTTPException(status_code=400, detail="Invalid session ID format.")
    session_path = (SESSION_WORKSPACE_ROOT / session_id).resolve()
    if not str(session_path).startswith(str(SESSION_WORKSPACE_ROOT.resolve())):
        raise HTTPException(status_code=400, detail="Invalid session ID (Path traversal attempt).")
    if filename:
        decoded_filename = urllib.parse.unquote(filename)
        if ".." in decoded_filename or "/" in decoded_filename:
            raise HTTPException(status_code=400, detail="Invalid filename format.")
        file_path = (session_path / decoded_filename).resolve()
        if not str(file_path).startswith(str(session_path)):
            raise HTTPException(status_code=400, detail="Invalid filename (Path traversal attempt).")
        return file_path
    return session_path

# --- 针对模型的、会话内的 API (Session-Specific) ---

@app.get("/api/v1/files/list/{session_id}", response_model=List[FileInfo])
async def list_files_for_session(session_id: str):
    """列出指定会话工作区中的所有文件。"""
    session_path = get_safe_path(session_id)
    if not session_path.is_dir():
        return [] # 如果目录不存在，返回空列表而不是404
    
    # 🎯 采纳您的修复：为返回的每个文件对象都补上 session_id 字段
    files = [{"name": f.name, "session_id": session_id} for f in session_path.iterdir() if f.is_file()]
    return files

@app.get("/api/v1/files/download/{session_id}/{filename}")
async def download_session_file(session_id: str, filename: str):
    file_path = get_safe_path(session_id, filename)
    if not file_path.is_file(): raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path=file_path, filename=file_path.name, media_type='application/octet-stream')

# ... (delete_session_file, rename_session_file 等，如果存在的话) ...

# --- 针对前端UI的、全局的管理 API (Global Admin) ---

def find_file_globally(filename: str) -> Path:
    """在整个工作区内安全地查找并返回文件的绝对路径。"""
    decoded_filename = urllib.parse.unquote(filename)
    if ".." in decoded_filename or "/" in decoded_filename:
        raise HTTPException(status_code=400, detail="Invalid filename format.")
    for session_dir in SESSION_WORKSPACE_ROOT.iterdir():
        if session_dir.is_dir():
            potential_path = (session_dir / decoded_filename).resolve()
            if potential_path.is_file() and str(potential_path).startswith(str(SESSION_WORKSPACE_ROOT.resolve())):
                return potential_path
    raise HTTPException(status_code=404, detail=f"File '{decoded_filename}' not found in any session.")

@app.get("/api/v1/files/global/list-all", response_model=List[FileInfo])
async def list_all_global_files():
    """列出所有会话中的所有文件。"""
    all_files = []
    for session_dir in SESSION_WORKSPACE_ROOT.iterdir():
        if session_dir.is_dir():
            session_id = session_dir.name
            files_in_session = [{"name": f.name, "session_id": session_id} for f in session_dir.iterdir() if f.is_file()]
            all_files.extend(files_in_session)
    return all_files

@app.get("/api/v1/files/global/download/{filename}")
async def download_global_file(filename: str):
    file_path = find_file_globally(filename)
    return FileResponse(path=file_path, filename=file_path.name, media_type='application/octet-stream')

@app.delete("/api/v1/files/global/delete/{filename}")
async def delete_global_file(filename: str):
    file_path = find_file_globally(filename)
    file_path.unlink(); return {"success": True}

@app.patch("/api/v1/files/global/rename/{filename}")
async def rename_global_file(filename: str, request: RenameRequest):
    old_path = find_file_globally(filename)
    new_path = old_path.parent / request.new_filename
    if new_path.exists(): raise HTTPException(status_code=409, detail="File with new name already exists.")
    old_path.rename(new_path); return {"success": True}