# 农业数字孪生仿真平台

基于 Three.js 的农业机械数字孪生系统，支持田块绘制、路径规划与设备仿真。

## 功能特性

### 田块管理
- **多边形绘制**：点击地面添加顶点，支持三种闭合方式（右键/双击/点击首顶点）
- **顶点编辑**：点击选中顶点（黄色高亮）、拖拽移动位置、Delete键删除
- **边界校验**：自动检测多边形自相交，防止无效田块

### 弓字形路径规划
- **智能适配**：基于凸包主轴分析，自动适配任意形状田块
- **边界裁剪**：Sutherland-Hodgman算法确保路径完全落在田块内
- **分色渲染**：绿色=作业线，橙色=转弯段

### 设备仿真
- **农机模型**：支持拖拉机、无人机等多种农业机械
- **路径跟踪**：设备沿规划路径自动行驶
- **实时监控**：位置、进度、状态面板展示

## 快速开始

### 本地运行
```bash
# 克隆仓库
git clone https://github.com/AWTX550W/agri-digital-twin.git
cd agri-digital-twin

# 启动本地服务器
python -m http.server 8080
# 或使用 Node.js
npx serve .

# 浏览器打开
http://localhost:8080
```

### 使用流程
1. 点击「绘制田块」进入绘制模式
2. 点击地面添加多边形顶点
3. 右键/双击/点击首顶点闭合田块
4. 选中田块后点击「生成路径」
5. 添加农机设备后点击「开始仿真」

## 技术栈

- **Three.js r128**：3D场景渲染
- **纯前端架构**：无需后端，单HTML文件可运行
- **Sutherland-Hodgman**：多边形裁剪算法
- **Andrew's Monotone Chain**：凸包与主轴计算

## 项目结构

```
agri-digital-twin/
├── index.html          # 主入口
├── app.js              # 主程序（事件处理、渲染循环）
├── data.js              # 数据结构与全局状态
├── FieldManager.js      # 田块绘制与编辑
├── PathManager.js       # 弓字形路径生成
├── DeviceManager.js     # 设备管理
└── Terrain.js           # 地形初始化
```

## 测试截图

### 田块绘制
![田块绘制](./screenshots/field-drawing.png)

### 路径规划
![路径规划](./screenshots/path-planning.png)

### 设备仿真
![设备仿真](./screenshots/device-simulation.png)

## 应用场景

- 农机自动驾驶路径规划验证
- 农田作业覆盖效率分析
- 多机协同调度仿真
- 农业自动化教学演示

## License

MIT License
