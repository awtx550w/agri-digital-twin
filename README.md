# 农业数字孪生系统

基于 Web 的农业机械与无人机协同作业 3D 仿真平台

## 功能模块

| 模块 | 状态 | 描述 |
|------|------|------|
| 3D 地形与田块 | 待开发 | Three.js  terrain + 田块边界绘制 |
| 路径规划可视化 | 待开发 | 集成 agri-machinery-path-planner |
| 无人机喷洒仿真 | 待开发 | 基于 drone-spray-planner |
| 采摘机器人仿真 | 待开发 | 基于 agriculture-robot-planner |
| 多机协同调度 | 待开发 | 多台农机任务分配与防碰撞 |

## 技术栈

- **前端**: Three.js + HTML5 + CSS3
- **路径规划**: 复用 agri-machinery-path-planner (Python) 或移植为 JS
- **部署**: GitHub Pages

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/AWTX550W/agri-digital-twin.git
cd agri-digital-twin

# 本地预览（需要 Python 3）
python -m http.server 8080
# 访问 http://localhost:8080
```

## 开发计划

1. **Phase 1**: 基础 3D 场景 + 田块绘制
2. **Phase 2**: 路径规划集成与可视化
3. **Phase 3**: 无人机喷洒动画
4. **Phase 4**: 机器人仿真与多机协同

## 校招展示重点

- 完整的技术栈整合能力
- 3D 可视化与算法结合
- 模块化设计与代码规范
