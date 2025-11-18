# code_interpreter.py - 最终修复版

import docker
import asyncio
import logging
from pydantic import BaseModel, Field
from docker.errors import DockerException, ContainerError, ImageNotFound, NotFound
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
import json

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        self.docker_client = None
        self.initialize_docker_client()

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

    async def execute(self, parameters: CodeInterpreterInput) -> dict:
        if not self.docker_client:
            logger.warning("execute called but Docker client is not available.")
            return {"success": False, "error": "Docker daemon not available."}
            
        image_name = "tools-python-sandbox"
        
        try:
            self.check_image(image_name)
        except Exception as e:
            logger.error(f"Image preparation failed: {e}")
            return {"success": False, "error": f"Image preparation failed: {e}"}
        
        # --- 核心修复：将字体设置逻辑移动到 runner_script 内部 ---
        runner_script = f"""
import sys, traceback, io, json, base64

# --- Matplotlib Font and Style Setup (runs inside the sandbox) ---
def setup_matplotlib_config():
    try:
        import matplotlib.pyplot as plt
        import matplotlib.font_manager as fm

        # 字体优先级列表
        font_preferences = [
            'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'DejaVu Sans', 
            'Arial Unicode MS', 'SimHei'
        ]
        
        # 查找系统中可用的字体
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
        
        # --- Capture matplotlib title ---
        title_holder = [None]
        original_title_func = plt.title
        def new_title_func(label, *args, **kwargs):
            title_holder[0] = label
            return original_title_func(label, *args, **kwargs)
        plt.title = new_title_func
        return title_holder

    except ImportError:
        return [None] # Matplotlib not available
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
    title_holder = setup_matplotlib_config()

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

# --- Format output ---
stripped_stdout = stdout_val.strip()
output_processed = False

# 1. 优先检查输出是否已经是我们期望的JSON格式
if stripped_stdout.startswith('{') and stripped_stdout.endswith('}'):
    try:
        # 验证它是否是合法的JSON
        parsed = json.loads(stripped_stdout)
        # 如果它已经是图片或文件JSON，直接打印并标记为已处理
        if parsed.get('type') in ['image', 'excel', 'word', 'ppt', 'pdf', 'plotly_advanced_dashboard']:
            print(stripped_stdout, end='')
            output_processed = True
    except json.JSONDecodeError:
        # 如果解析失败，说明它不是JSON，继续往下走
        pass

# 2. 如果尚未处理，再检查它是否是裸的Base64图片
if not output_processed:
    is_image = False
    if stripped_stdout.startswith(('iVBORw0KGgo', '/9j/')):
        try:
            base64.b64decode(stripped_stdout, validate=True)
            is_image = True
        except Exception:
            is_image = False

    if is_image:
        # 🔥 核心保障：将裸的 base64 封装成标准 JSON
        captured_title = title_holder[0] if title_holder[0] else "Generated Chart"
        output_data = {{
            "type": "image",
            "title": captured_title,
            "image_base64": stripped_stdout
        }}
        print(json.dumps(output_data), end='')
    else:
        # 3. 如果都不是，则作为原始文本输出
        print(stdout_val, end='')

# 始终打印标准错误流的内容
print(stderr_val, file=sys.stderr, end='')
"""
        container = None # 初始化 container 变量
        try:
            logger.info(f"Running code in sandbox. Code length: {len(parameters.code)}")
            
            # 🔥🔥🔥【最终修复的核心逻辑】🔥🔥🔥
            # 步骤 1: 创建容器但不立即运行，以便我们能获取流
            container = self.docker_client.containers.create(
                image=image_name,
                command=["python", "-c", runner_script],
                network_disabled=True,
                environment={'MPLCONFIGDIR': '/tmp'},
                mem_limit="1g",
                cpu_period=100_000,
                cpu_quota=50_000,
                read_only=True,
                tmpfs={'/tmp': 'size=100M,mode=1777'},
                detach=True # 👈 关键：以分离模式启动
            )

            # 步骤 2: 启动容器
            container.start()
            
            # 步骤 3: 等待容器执行完成，并获取退出码
            # 设置一个合理的超时，例如90秒
            result = container.wait(timeout=90)
            exit_code = result.get('StatusCode', -1)

            # 步骤 4: 无论成功与否，都分别获取 stdout 和 stderr 的日志
            stdout = container.logs(stdout=True, stderr=False).decode('utf-8', errors='ignore')
            stderr = container.logs(stdout=False, stderr=True).decode('utf-8', errors='ignore')
            
            logger.info(f"Sandbox execution finished. Exit code: {exit_code}")
            if stdout:
                logger.info(f"Sandbox stdout (first 200 chars): {stdout[:200]}")
            if stderr:
                logger.warning(f"Sandbox stderr: {stderr}")

            # 步骤 5: 统一返回结构
            return {
                "success": True, # 'success' 表示工具本身成功运行，而不是代码没错误
                "data": {
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": exit_code
                }
            }
            
        except ContainerError as e:
            # 这种方式下，ContainerError 理论上不应再被触发，但保留以防万一
            logger.error(f"Sandbox ContainerError: {e}")
            stdout = e.stdout.decode('utf-8', errors='ignore') if e.stdout else ""
            stderr = e.stderr.decode('utf-8', errors='ignore') if e.stderr else ""
            return {
                "success": True,
                "data": {"stdout": stdout, "stderr": stderr, "exit_code": e.exit_status}
            }
        except Exception as e:
            logger.error(f"An unexpected error occurred during sandbox execution: {e}")
            return {"success": False, "error": f"Sandbox execution framework error: {e}"}
        finally:
            # 步骤 6: 确保容器总是被清理
            if container:
                try:
                    container.remove(force=True)
                    logger.info(f"Sandbox container {container.short_id} removed.")
                except NotFound:
                    pass # 容器可能已经被自动移除
                except Exception as e:
                    logger.error(f"Failed to remove container {container.short_id}: {e}")

# --- FastAPI Application ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global code_interpreter_instance
    code_interpreter_instance = CodeInterpreterTool()
    yield
    if code_interpreter_instance and code_interpreter_instance.docker_client:
        code_interpreter_instance.docker_client.close()

app = FastAPI(lifespan=lifespan)

@app.post('/api/v1/python_sandbox')
async def run_python_sandbox(request_data: dict):
    try:
        code_to_execute = request_data.get('parameters', {}).get('code')
        if not code_to_execute:
            raise HTTPException(status_code=422, detail="Missing 'code' field.")

        input_data = CodeInterpreterInput(code=code_to_execute)
        result = await code_interpreter_instance.execute(input_data)
        
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
            return {"status": "healthy", "docker": "connected"}
        else:
            return {"status": "degraded", "docker": "not_available"}
    except Exception as e:
        return {"status": "degraded", "docker": f"error: {e}"}

@app.get('/')
async def root():
    """Root endpoint with basic info"""
    return {
        "message": "Python Sandbox API",
        "version": "1.0",
        "endpoints": {
            "execute_code": "POST /api/v1/python_sandbox",
            "health_check": "GET /health"
        }
    }