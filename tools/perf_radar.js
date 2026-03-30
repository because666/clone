const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend', 'src');
const BACKEND_DIR = path.join(ROOT_DIR, 'trajectory_lab');

const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";

console.log(`${BLUE}🚀=============================================🚀${RESET}`);
console.log(`${BLUE}   AetherWeave 全栈性能雷达 v2.0 (Pro Max)   ${RESET}`);
console.log(`${BLUE}🚀=============================================🚀${RESET}\n`);

// 扫描器配置
const SCANNERS = [
  // ---------- 前端：React 渲染层 ----------
  {
    id: 'JSX_INLINE_FUNC',
    level: RED,
    desc: 'React 渲染炸弹: 顶层节点传递内联箭头函数 (会导致下层 memo 防御网被彻底击穿)',
    regex: /\b(?:onClick|onChange|onClose|on[A-Z]\w*)=\{\s*(?:\([^)]*\)\s*=>|[\w]+\s*=>|function\s*\()/g,
    exts: ['.tsx', '.jsx']
  },
  {
    id: 'JSX_INLINE_OBJ',
    level: YELLOW,
    desc: 'React 强行实例化陷阱: 传递行内生成的 Object/Array (其内存指针每一次 render 都在瞬移)',
    regex: /\b(?:style|data|options)=\{\{\s*[^}]*\s*\}\}/g,
    exts: ['.tsx', '.jsx']
  },
  {
    id: 'USE_EFFECT_MISSING_DEPS',
    level: RED,
    desc: 'React 生命周期泄漏: useEffect 忘记了尾部的依赖数组 []，极度容易引发死循环',
    // 简易探测：useEffect(() => { ... }) 结尾没有 , [] 或者类似依赖项
    regex: /useEffect\s*\(\s*(?:\([^)]*\)|[\w]+)\s*=>\s*\{[\s\S]*?\}\s*\)/g,
    exts: ['.tsx', '.jsx']
  },
  {
    id: 'USE_MEMO_COMPLEX_CALC',
    level: YELLOW,
    desc: 'React 主进程拉跨: 渲染流里存在了高耗能 Array 方法 (例如 map/filter/reduce) 且没有被 useMemo 庇护',
    regex: /=>\s*[^<]*?\.(filter|reduce|sort)\(/g,
    exts: ['.tsx', '.jsx']
  },
  {
    id: 'DYNAMIC_STYLE_TAG',
    level: MAGENTA,
    desc: 'CSSOM 碎片化震荡: 组件渲染循环中强行打出 <style> 标签，浏览器将被迫重算 StyleSheet',
    regex: /<style>[\s\S]*?\{[\s\S]*?\}[\s\S]*?<\/style>/g,
    exts: ['.tsx', '.jsx']
  },
  {
    id: 'LAYOUT_THRASHING_CSS',
    level: RED,
    desc: 'GPU 合成层退化: 强制使用 CPU 去干预盒模型过渡动画 (width/height/top)，必须替换为 transform',
    regex: /transition(-property)?:\s*.*?\b(width|height|padding|margin|top|left|bottom|right)\b/gi,
    exts: ['.css', '.tsx', '.jsx']
  },
  {
    id: 'OVERSIZED_BUNDLING',
    level: YELLOW,
    desc: 'Webpack 模块窒息: 不要直接使用 import _ from "lodash" 或者全量引入 UI 库，请使用具名导入或子包解构',
    regex: /import\s+_\s+from\s+['"]lodash['"]/g,
    exts: ['.ts', '.tsx']
  },

  // ---------- 后端：Python 引擎层 ----------
  {
    id: 'PYTHON_LOOP_JSON',
    level: RED,
    desc: 'Python 帧率克星: 深层循环体内重复发生 json.loads 反序列化，导致进程卡顿数秒',
    regex: null, // 通过 AST/缩进 特殊逻辑检查
    exts: ['.py']
  },
  {
    id: 'PYTHON_LOOP_QUERY',
    level: RED,
    desc: 'Python N+1 数据库风暴: 在 for 循环中执行了 SQL query 获取级联数据 (未采用 joinedload)',
    regex: null, // 通过 AST/缩进 特殊逻辑检查
    exts: ['.py']
  },
  {
    id: 'PYTHON_MISSING_LRU',
    level: YELLOW,
    desc: 'IO 锁死风险: 文件读取流 open() 函数裸奔在外 (极易被高并发请求打穿磁盘 IO，建议上 @lru_cache)',
    regex: /def\s+\w+\([^)]*\):(?:(?!\bdef\b)[\s\S])*?(?:with\s+open\b|\bopen\()/g,
    exts: ['.py']
  }
];

let totalIssues = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    // 智能剔除不相关的文件和重度依赖
    if (stat.isDirectory()) {
      const ignored = ['node_modules', '.git', 'dist', 'build', 'data', '__pycache__', '.venv', 'venv'];
      if (!ignored.includes(file)) {
        scanDir(fullPath);
      }
    } else {
      const ext = path.extname(fullPath);
      let content = null;
      let lines = null;

      SCANNERS.forEach(scanner => {
        if (scanner.exts.includes(ext)) {
          if (!content) {
            content = fs.readFileSync(fullPath, 'utf8');
            lines = content.split('\n');
          }

          if (scanner.id === 'PYTHON_LOOP_JSON' || scanner.id === 'PYTHON_LOOP_QUERY') {
            // 特殊的 Python for loop 缩进追踪探测器
            let inLoop = false;
            let loopIndent = 0;
            lines.forEach((line, i) => {
              // 忽略纯注释或空行
              if (line.trim().startsWith('#') || line.trim() === '') return;

              const loopMatch = line.match(/^(\s*)for\s+.*:/);
              if (loopMatch) {
                inLoop = true;
                loopIndent = loopMatch[1].length;
              } else if (inLoop) {
                const currentIndent = line.search(/\S/);
                if (currentIndent !== -1 && currentIndent <= loopIndent) {
                  inLoop = false;
                } else {
                  // 深层循环体内容检查
                  if (scanner.id === 'PYTHON_LOOP_JSON' && (line.includes('json.loads(') || line.includes('json.load('))) {
                    reportIssue(scanner, fullPath, i + 1, line);
                  }
                  if (scanner.id === 'PYTHON_LOOP_QUERY' && (line.includes('.query.filter') || line.includes('.all()') || line.includes('.first()'))) {
                    reportIssue(scanner, fullPath, i + 1, line);
                  }
                }
              }
            });
          } else if (scanner.regex) {
            // 标准的多行/单行正则引擎
            let match;
            scanner.regex.lastIndex = 0;
            while ((match = scanner.regex.exec(content)) !== null) {
              const matchIndex = match.index;
              const lineNum = content.substring(0, matchIndex).split('\n').length;
              const lineContent = lines[lineNum - 1].trim();
              
              // 过滤掉注释区域（简易过滤）
              if (lineContent.startsWith('//') || lineContent.startsWith('/*') || lineContent.startsWith('*') || lineContent.startsWith('#')) {
                continue;
              }

              reportIssue(scanner, fullPath, lineNum, lineContent);
            }
          }
        }
      });
    }
  }
}

function reportIssue(scanner, fullPath, lineNum, lineContent) {
  const relativePath = path.relative(ROOT_DIR, fullPath);
  console.log(`[${scanner.level}${scanner.id}${RESET}] -> ${relativePath}:${lineNum}`);
  console.log(`      \x1b[90m> ${lineContent.trim()}${RESET}`);
  console.log(`      \x1b[3m${scanner.desc}\x1b[0m\n`);
  totalIssues++;
}

console.log(`\n${YELLOW}>> 正在全息投影并锁定前端渲染图谱...${RESET}`);
scanDir(FRONTEND_DIR);

console.log(`${YELLOW}>> 正在降维穿透分析后端微线程黑腔...${RESET}`);
scanDir(BACKEND_DIR);

console.log(`\n${GREEN}====== [AetherWeave Pro Max] 性能雷达扫掠结束 ======${RESET}`);
if (totalIssues > 0) {
  console.log(`系统掩体下共隐匿了: ${RED}${totalIssues}${RESET} 只隐藏在暗处的“性能水蛭”`);
  console.log(`${YELLOW}提示: 这些代码从微观视角来看是合法的，但在大数据高频访问下会呈几何级数消耗算力，请遵循高级架构守则予以重构！${RESET}\n`);
} else {
  console.log(`卓越之作！您的应用程序内再也找不出任何可以引发降频的卡脖子代码了！纯钢打造的性能城墙！\n`);
}
