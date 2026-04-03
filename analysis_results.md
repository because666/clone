# AetherWeave 项目问题分析报告

经过对项目前后端代码的全面审查，发现以下 **6 大类、20+ 个问题**，按严重性排序如下。

---

## 🔴 严重问题（安全 & 正确性）

### 1. 硬编码密钥泄露
**文件**: [config.py](file:///d:/develop/AetherWeave-1/backend/config.py#L25) | [.env.example](file:///d:/develop/AetherWeave-1/.env.example#L4)

```python
SECRET_KEY = os.environ.get('SECRET_KEY', 'AetherWeave-SuperSecretKey-2026')
```

> [!CAUTION]
> JWT 签名密钥 `AetherWeave-SuperSecretKey-2026` 同时出现在源码和 `.env.example` 中。如果部署环境未设置 `SECRET_KEY` 环境变量，攻击者可直接用此默认值伪造任意用户的 JWT Token，获取完整系统控制权。

---

### 2. SSE Token 通过 URL 查询参数传输
**文件**: [auth.py (middleware)](file:///d:/develop/AetherWeave-1/backend/middleware/auth.py#L25) | [useSSESubscription.ts](file:///d:/develop/AetherWeave-1/frontend/src/hooks/useSSESubscription.ts#L28)

```typescript
// 前端: Token 暴露在 URL 中
const es = new EventSource(`/api/tasks/stream?token=${token}`);
```
```python
# 后端: 允许从 query param 读 token
token = request.args.get('token', '')
```

> [!WARNING]
> JWT Token 通过 URL 查询参数传输会被浏览器历史记录、代理日志、Nginx 访问日志等明文记录。这是 [OWASP 安全反模式](https://owasp.org/)。虽然 `EventSource` API 不支持自定义 Header，但应考虑使用短期一次性 ticket 或 Cookie 认证替代。

---

### 3. SSE 流轮询数据库 — 性能 & 并发定时炸弹
**文件**: [tasks.py](file:///d:/develop/AetherWeave-1/backend/api/tasks.py#L150-L167)

```python
def generate():
    while True:
        with app.app_context():
            latest_task = Task.query.order_by(Task.updated_at.desc()).first()
            # ...
        time.sleep(1.0)  # 每秒查询一次数据库
```

> [!WARNING]
> 每个 SSE 客户端连接独占一个 Flask worker 线程，并每秒执行一次 `SELECT ... ORDER BY updated_at DESC` 查询。在 `gunicorn --workers 2` 配置下，仅 2 个浏览器标签页就能耗尽全部 worker，导致所有其他 API 请求阻塞。应改用 Redis Pub/Sub 或内存事件通知机制。

---

### 4. 批量生成端点缺少鉴权
**文件**: [trajectories.py](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L37-L38)

```python
@trajectories_bp.route("/batch", methods=["POST"])
def batch_generate():     # ⚠️ 没有 @role_required 装饰器！
```

同理，[single_generate](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L130)、[get_trajectories](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L223)、[get_trajectories_binary](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L303) 也均无鉴权。

> [!CAUTION]
> `/api/batch` 会触发大量 CPU 密集型路径规划并写入数据库。任何匿名用户均可调用此接口，可能被恶意利用进行 DoS 攻击。

---

### 5. 任务 ID 碰撞风险
**文件**: [tasks.py](file:///d:/develop/AetherWeave-1/backend/api/tasks.py#L59) | [trajectories.py](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L164)

```python
fid = f"task_{int(time.time())}"      # 任务创建
fid = f"single_{int(time.time())}"    # 单条生成
```

> [!IMPORTANT]
> `time.time()` 精度为秒级。同一秒内的多次请求将生成相同的 `flight_id`，导致数据库 `UNIQUE` 约束冲突或数据覆盖。应使用 `uuid.uuid4()` 或加入随机后缀。

---

## 🟡 架构 & 设计问题

### 6. JSON 手动拼接 — 注入风险 & 维护噩梦
**文件**: [tasks.py](file:///d:/develop/AetherWeave-1/backend/api/tasks.py#L134-L139)

```python
# "直接切割组装字符串，跳过 json.loads() 对 CPU 的锁死"
base_json = json.dumps(base_dict)
traj_str = t.trajectory_data if t.trajectory_data else "null"
final_task_json = base_json[:-1] + f', "trajectory_data": {traj_str}}}'
```

> [!WARNING]
> 手动拼接 JSON 绕过了序列化安全检查。如果 `trajectory_data` 包含恶意数据（如未转义的引号），将产生畸形 JSON 注入。建议使用 `orjson`（项目已引入）代替手工拼接，性能相当但安全。

---

### 7. `datetime.utcnow()` 已弃用
**文件**: [user.py](file:///d:/develop/AetherWeave-1/backend/models/user.py) (5处) | [auth.py](file:///d:/develop/AetherWeave-1/backend/api/auth.py#L38) | mobile.py

```python
default=datetime.utcnow          # 模型字段
datetime.datetime.utcnow()       # JWT payload
```

Python 3.12 起 `datetime.utcnow()` 已被标记为 deprecated，因为它返回 **naive datetime**（无时区信息），容易在时区处理中引发隐蔽 bug。应改用 `datetime.now(timezone.utc)`。

---

### 8. `lru_cache` 在 Flask 请求上下文中使用数据库查询
**文件**: [analytics.py](file:///d:/develop/AetherWeave-1/backend/api/analytics.py#L36-L43)

```python
@lru_cache(maxsize=32)
def _load_city_trajectories(city: str):
    logs = FlightLog.query.filter_by(city=city).all()  # 需要 app context！
```

> [!IMPORTANT]
> `lru_cache` 是进程级缓存，缓存的数据永远不会自动失效（除了 `batch_generate` 手动调用 `cache_clear()`）。若通过其他途径修改数据库（如直接 SQL、其他 worker 进程），缓存将返回陈旧数据。更严重的是，被缓存的 SQLAlchemy 对象会持有过期的 session 引用。

---

### 9. 全局可变状态通过 `global` 注入蓝图依赖
**文件**: [tasks.py](file:///d:/develop/AetherWeave-1/backend/api/tasks.py#L21-L27) | [trajectories.py](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L28-L34) | [analysis.py](file:///d:/develop/AetherWeave-1/backend/api/analysis.py#L18-L26) | [analytics.py](file:///d:/develop/AetherWeave-1/backend/api/analytics.py#L27-L33)

```python
_get_city_pois = None

def init_tasks_bp(get_city_pois_fn):
    global _get_city_pois
    _get_city_pois = get_city_pois_fn
```

4 个蓝图都使用 `global` 变量注入依赖，在多进程 (`gunicorn --workers N`) 环境下需要确保每个 worker 都执行初始化。建议改用 Flask 的 `app.config` 或 Extension 模式。

---

### 10. `MapContainer.tsx` 上帝组件 — 587 行
**文件**: [MapContainer.tsx](file:///d:/develop/AetherWeave-1/frontend/src/components/MapContainer.tsx) — **587 行**

这个组件管理了：地图渲染、SSE 订阅、任务自动完成、城市切换、飞行追踪、沙盘模式、航线选点、Toast 通知、进度条、锚点导航等十多项职责。任何一个 state 变化都可能触发整棵子树的重渲染。尽管已做了大量 `useCallback/useMemo` 优化，但核心问题是**职责过重**。

---

## 🟠 前端质量问题

### 11. TypeScript `any` 类型泛滥
几乎所有核心文件都大量使用 `any` 类型：

| 文件 | `any` 出现次数（估计） |
|------|---------------------|
| useUAVAnimation.ts | 10+ |
| useMapLayers.ts | 15+ |
| useCityData.ts | 10+ |
| MapContainer.tsx | 8+ |
| TaskManagementPanel.tsx | 5+ |

这消除了 TypeScript 的类型安全保障，常见的运行时错误（如 `undefined is not a function`）将无法在编译期捕获。

---

### 12. AuthContext 初始化竞态
**文件**: [AuthContext.tsx](file:///d:/develop/AetherWeave-1/frontend/src/contexts/AuthContext.tsx#L27-L55)

```typescript
useEffect(() => {
    if (token && storedUser) {
        setUser(parsed);           // ① 立即设置 user
        fetch('/api/users/me')     // ② 异步验证 token
            .then(res => {
                if (res.status === 401) setUser(null);  // ③ 可能清除
            });
    }
    setLoading(false);             // ④ 立即设置 loading=false
}, []);
```

> [!IMPORTANT]
> `setLoading(false)` 在 token 验证请求未返回前就已执行。这意味着 `ProtectedRoute` 会放行用户进入 dashboard，然后 ① 验证失败后突然被踢出。正确做法是在 `fetch().finally()` 中设置 `setLoading(false)`。

---

### 13. `EnvironmentProvider` 不在组件树中
**文件**: [App.tsx](file:///d:/develop/AetherWeave-1/frontend/src/App.tsx)

`App.tsx` 使用 `AuthProvider` 包裹了整个应用，但 `EnvironmentProvider` 并未出现在组件树中。然而 `MapContainer` 组件通过 `useEnvironment()` 消费了 `EnvironmentContext`：

```typescript
const { windSpeed } = useEnvironment();  // MapContainer.tsx:132
```

这意味着 `useEnvironment()` 只能取到 `createContext` 的默认值，`setWindSpeed` 等更新方法将是 no-op，天气/风速仿真功能**完全失效**。

---

### 14. 坐标零值校验缺陷
**文件**: [tasks.py](file:///d:/develop/AetherWeave-1/backend/api/tasks.py#L43-L46) | [trajectories.py](file:///d:/develop/AetherWeave-1/backend/api/trajectories.py#L144-L147)

```python
if start_lat == 0 and start_lon == 0:
    return jsonify(...), 400
```

这个校验将 `(0, 0)` 视为无效坐标，但 `(0, 0)` 是有效的地理坐标（几内亚湾）。虽然本项目场景中不太可能用到，但更正确的做法是检查参数是否存在（`is None`），而非检查值是否为零。

---

## 🔵 运维 & 工程化问题

### 15. 测试覆盖几乎为零
**目录**: [backend/tests/](file:///d:/develop/AetherWeave-1/backend/tests/)

仅有 `test_algo.py` 一个测试文件（3.7KB），前端完全没有测试。核心路径规划、禁飞区检测、任务状态流转、认证流程等关键业务逻辑均无测试保障。

---

### 16. Gunicorn 与 SSE 不兼容
**文件**: [Dockerfile](file:///d:/develop/AetherWeave-1/Dockerfile#L41)

```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "120", ...]
```

Gunicorn 的同步 worker（默认）在 SSE 长连接下会阻塞整个 worker 进程。`--workers 2` 意味着最多支持 **2 个并发 SSE 客户端**，第 3 个连接将超时。需要切换为 `gevent` 或 `eventlet` 异步 worker。

---

### 17. `requirements.txt` 缺少 `werkzeug`
**文件**: [requirements.txt](file:///d:/develop/AetherWeave-1/backend/requirements.txt) | [user.py](file:///d:/develop/AetherWeave-1/backend/models/user.py#L4)

```python
from werkzeug.security import generate_password_hash, check_password_hash
```

`werkzeug` 虽然是 Flask 的隐式依赖，但 `requirements.txt` 未显式声明。同样未声明 `requests`（被 [ai.py](file:///d:/develop/AetherWeave-1/backend/api/ai.py#L4) 使用）。这在版本锁定和独立安装时可能出问题。

---

### 18. 前后端禁飞区参数不一致
**文件**: [no_fly_zones.py](file:///d:/develop/AetherWeave-1/backend/core/no_fly_zones.py#L12-L21) vs [useUAVAnimation.ts](file:///d:/develop/AetherWeave-1/frontend/src/hooks/useUAVAnimation.ts#L29-L34) vs [ai.py](file:///d:/develop/AetherWeave-1/backend/api/ai.py#L42-L45)

| 类别 | 后端 planner | 前端告警 | AI 预审 |
|------|-------------|---------|---------|
| hospital | 125m | 150m | 300m |
| school | 125m | 150m | 300m |
| police | 125m | 80m | 150m |
| clinic | 125m | 100m | 250m |

三个子系统对同一类敏感区域使用的缓冲半径完全不同，这会导致：前端告警了，但后端没有避开；AI 判定高风险，但 planner 认为安全。

---

### 19. `dist` 目录被版本控制
**文件**: [frontend/.gitignore](file:///d:/develop/AetherWeave-1/frontend/.gitignore)

`frontend/dist` 目录存在于项目中（作为前端构建产物）。应确认 `.gitignore` 中已排除此目录，避免构建产物污染仓库。

---

### 20. AI 禁飞区检测逻辑与核心系统重复
**文件**: [ai.py](file:///d:/develop/AetherWeave-1/backend/api/ai.py#L23-L52)

`check_nofly_zones()` 函数使用 `shapely.geometry` 重新实现了一套独立的禁飞区检测逻辑，与 `core/no_fly_zones.py` 的 `NoFlyZoneIndex` 完全独立。参数不同、算法不同、精度不同，维护成本翻倍，且极易产生不一致的判断结果。

---

## 📊 问题汇总

| 严重级别 | 数量 | 关键词 |
|---------|------|-------|
| 🔴 严重 | 5 | 密钥泄露、SSE Token、数据库轮询、无鉴权、ID碰撞 |
| 🟡 设计 | 5 | JSON注入、deprecated API、缓存失效、全局状态、上帝组件 |
| 🟠 前端 | 4 | any泛滥、认证竞态、Provider缺失、零值校验 |
| 🔵 运维 | 6 | 无测试、SSE阻塞、依赖缺失、参数不一致、构建产物、逻辑重复 |

> [!TIP]
> 建议优先修复 🔴 级别问题（尤其是 #1 密钥泄露和 #4 无鉴权端点）和 #13 `EnvironmentProvider` 缺失（功能完全失效）。如需我逐一修复其中某些问题，请告诉我。
