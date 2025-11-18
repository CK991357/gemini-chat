# code_interpreter.py - 最终优化确认版 v2.2

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
        font_preferences = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'DejaVu Sans', 'Arial Unicode MS', 'SimHei']
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
        if parsed.get('type') in ['image', 'excel', 'word', 'ppt', 'pdf', 'analysis_report', 'ml_report', 'statistical_analysis', 'scientific_computing', 'scipy_optimization', 'scipy_integration', 'scipy_signal_processing', 'scipy_linear_algebra', 'symbolic_math', 'equation_solutions', 'calculus_results', 'mathematical_proofs', 'linear_algebra', 'numerical_approximations', 'complex_math_solution']:
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

# 🚀🚀🚀 --- 核心修复：仅当 matplotlib 已导入时才尝试自动捕获 --- 🚀🚀🚀
if not output_processed and 'matplotlib.pyplot' in sys.modules:
    plt = sys.modules['matplotlib.pyplot']
    if plt.get_fignums():
        try:
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
        except Exception as auto_capture_error:
            print(f"\\n[SYSTEM_ERROR] Failed to auto-capture Matplotlib figure: {{auto_capture_error}}", file=sys.stderr, end='')
# 🚀🚀🚀 --- 核心修复结束 --- 🚀🚀🚀

if not output_processed:
    print(stdout_val, end='')

print(stderr_val, file=sys.stderr, end='')
"""
        container = None
        try:
            logger.info(f"Running code in sandbox. Code length: {len(parameters.code)}")
            
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
                detach=True
            )

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
        "version": "2.2",
        "endpoints": {
            "execute_code": "POST /api/v1/python_sandbox",
            "health_check": "GET /health"
        }
    }