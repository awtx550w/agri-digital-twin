/**
 * app.js - 农业数字孪生系统主程序
 * 统一数据源：data.js (fieldList, deviceList, pathList, selectedFieldId, drawingMode, drawingPoints, drawingLine, drawingVertexMeshes, editingVertexMeshes, selectedVertexInfo, isDraggingVertex, editingFieldId, isSimulating, simFrameId)
 */

// Three.js 全局对象
var scene, camera, renderer, raycaster, mouse;
var terrainGround = null;

// 相机控制状态
var isDragging = false;
var isDraggingCamera = false;
var previousMousePosition = { x: 0, y: 0 };

// ==================== 初始化 ====================

function init() {
    // 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 80, 250);

    // 相机
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 45, 50);
    camera.lookAt(0, 0, 0);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 射线检测
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 初始化地形
    initTerrain();

    // 事件绑定
    var canvas = renderer.domElement;

    // 点击（仅在非拖拽状态下处理）
    canvas.addEventListener('click', onCanvasClick);

    // 鼠标按下（优先顶点拾取）
    canvas.addEventListener('mousedown', onMouseDown);

    // 鼠标移动（拖拽顶点 或 旋转相机）
    canvas.addEventListener('mousemove', onMouseMove);

    // 鼠标释放
    canvas.addEventListener('mouseup', onMouseUp);

    // 右键菜单
    canvas.addEventListener('contextmenu', onContextMenu);

    // 双击
    canvas.addEventListener('dblclick', onDoubleClick);

    // 滚轮缩放
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // 键盘
    window.addEventListener('keydown', onKeyDown);

    // 窗口大小
    window.addEventListener('resize', onResize);

    // 状态
    refreshPanel();
    setStatus('欢迎！步骤：①绘制田块（多边形）→ ②选中田块 → ③生成弓字形路径 → ④添加设备 → ⑤开始仿真');

    // 渲染循环
    animate();
}

// ==================== 地形 ====================

function initTerrain() {
    // 地面
    var groundGeo = new THREE.PlaneGeometry(200, 200, 50, 50);
    var positions = groundGeo.attributes.position;
    for (var i = 0; i < positions.count; i++) {
        var x = positions.getX(i);
        var z = positions.getY(i);
        var y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.8;
        positions.setZ(i, y);
    }
    groundGeo.computeVertexNormals();

    var groundMat = new THREE.MeshLambertMaterial({ color: 0x8B7355, side: THREE.DoubleSide });
    terrainGround = new THREE.Mesh(groundGeo, groundMat);
    terrainGround.rotation.x = -Math.PI / 2;
    terrainGround.position.y = -0.1;
    terrainGround.receiveShadow = true;
    terrainGround.renderOrder = 0; // 地面在最底层（顶点renderOrder=10在其上层）
    scene.add(terrainGround);

    // 网格
    var gridHelper = new THREE.GridHelper(200, 40, 0x666666, 0x444444);
    gridHelper.position.y = 0.05;
    scene.add(gridHelper);

    // 光源
    var ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    var sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);
}

// ==================== 事件处理 ====================

/**
 * 点击处理：射线检测优先顶点，其次地面
 */
function onCanvasClick(event) {
    if (event.button !== 0) return;
    // 拖拽中不处理
    if (isDragging || isDraggingVertex) return;

    var groundPoint = getGroundPoint(event);
    if (!groundPoint) return;

    console.log('========== onCanvasClick ==========');
    console.log('鼠标位置:', {x: event.clientX, y: event.clientY});
    console.log('地面交点:', groundPoint);
    console.log('当前模式:', drawingMode);

    // 优先检测是否点击了顶点（第一步：顶点射线检测）
    var vertexHit = pickVertex(groundPoint);

    console.log('顶点检测结果:', vertexHit ? '✅ 命中' : '❌ 未命中');

    if (vertexHit) {
        // 点击了顶点：选中/高亮
        console.log('选中顶点:', {index: vertexHit.vertexIndex, fieldId: vertexHit.fieldId, mode: vertexHit.mode});
        selectVertex(vertexHit);
        setStatus('顶点已选中（黄色高亮），可拖拽移动位置');
        console.log('直接return，不执行地面添加顶点逻辑');
        return; // 关键：命中顶点后直接return，不执行后面的地面添加顶点
    }

    // 没有命中顶点：按模式处理（第二步：地面检测）
    console.log('未命中顶点，按模式处理:', drawingMode);
    if (drawingMode === 'draw-field') {
        addFieldVertex(groundPoint);
    } else if (drawingMode === 'draw-path') {
        addPathPoint(groundPoint);
    } else {
        // 空模式：尝试拾取田块（点击田块面选中）
        var fieldHit = pickField(groundPoint);
        if (fieldHit) {
            selectField(fieldHit);
        }
    }
}

/**
 * 射线拾取田块面
 */
function pickField(groundPoint) {
    raycaster.setFromCamera(mouse, camera);
    if (!terrainGround) return null;
    var hits = raycaster.intersectObject(terrainGround);
    if (hits.length > 0) return null;

    // 射线检测田块mesh
    var meshes = [];
    for (var i = 0; i < fieldList.length; i++) {
        if (fieldList[i].mesh) meshes.push(fieldList[i].mesh);
    }
    var fieldHits = raycaster.intersectObjects(meshes);
    if (fieldHits.length > 0) {
        var fid = fieldHits[0].object.userData.fieldId;
        return fid;
    }
    return null;
}

/**
 * 鼠标按下：优先检测顶点（开始拖拽），其次右键相机旋转
 */
function onMouseDown(event) {
    if (event.button === 0) {
        // 左键：优先顶点拖拽
        var groundPoint = getGroundPoint(event);
        if (groundPoint) {
            var vertexHit = pickVertex(groundPoint);
            if (vertexHit) {
                // 命中顶点 → 开始拖拽
                isDraggingVertex = true;
                selectVertex(vertexHit);
                event.stopPropagation(); // 关键：阻止传播，不触发相机旋转
                return;
            }
        }
    }

    if (event.button === 2) {
        // 右键：开始相机旋转
        isDragging = true;
        isDraggingCamera = true;
        previousMousePosition = { x: event.clientX, y: event.clientY };
        event.preventDefault();
    }
}

/**
 * 鼠标移动：顶点拖拽 或 相机旋转
 */
function onMouseMove(event) {
    if (isDraggingVertex) {
        // 顶点拖拽中
        updateDragVertex(event);
        return;
    }

    if (isDragging && isDraggingCamera) {
        // 相机旋转
        var dx = event.clientX - previousMousePosition.x;
        var dy = event.clientY - previousMousePosition.y;
        var spherical = new THREE.Spherical();
        spherical.setFromVector3(camera.position);
        spherical.theta -= dx * 0.01;
        spherical.phi -= dy * 0.01;
        spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, spherical.phi));
        camera.position.setFromSpherical(spherical);
        camera.lookAt(0, 0, 0);
        previousMousePosition = { x: event.clientX, y: event.clientY };
    }
}

/**
 * 鼠标释放
 */
function onMouseUp(event) {
    if (isDraggingVertex) {
        endDragVertex(event);
    }
    isDragging = false;
    isDraggingCamera = false;
}

/**
 * 右键菜单
 */
function onContextMenu(event) {
    event.preventDefault();
    if (drawingMode === 'draw-field' && drawingPoints.length >= 3) {
        closeField();
    } else if (drawingMode === 'draw-path' && drawingPoints.length >= 2) {
        closePath();
    }
}

/**
 * 双击：闭合田块
 */
function onDoubleClick(event) {
    if (drawingMode === 'draw-field' && drawingPoints.length >= 3) {
        closeField();
    } else if (drawingMode === 'draw-path' && drawingPoints.length >= 2) {
        closePath();
    }
}

/**
 * 键盘按键
 */
function onKeyDown(event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
        // 阻止默认行为（避免页面后退）
        event.preventDefault();
        deleteSelectedVertex();
    }
    // ESC：取消当前绘制
    if (event.key === 'Escape') {
        if (drawingMode === 'draw-field' || drawingMode === 'draw-path') {
            cancelDrawing();
        }
    }
}

/**
 * 获取射线与地面交点
 */
function getGroundPoint(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (!terrainGround) return null;
    var hits = raycaster.intersectObject(terrainGround);
    if (hits.length > 0) return hits[0].point;
    return null;
}

/**
 * 滚轮缩放
 */
function onWheel(event) {
    event.preventDefault();
    var dist = camera.position.length();
    var newDist = dist * (1 + event.deltaY * 0.001);
    camera.position.normalize().multiplyScalar(Math.max(15, Math.min(200, newDist)));
}

/**
 * 窗口大小变化
 */
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== 模式切换 ====================

function setDrawFieldMode() {
    if (drawingMode === 'draw-path') cleanupPathDrawing();
    deselectVertex();
    deselectAllFields();
    startDrawField();
}

function setDrawPathMode() {
    if (drawingMode === 'draw-field') cleanupDrawing();
    startDrawPath();
}

function generatePath() {
    var path = generateBoustrophedonPath();
    if (path && deviceList.length > 0) {
        bindFirstDeviceToPath(path.id);
    }
}

function startSim() {
    startDeviceSimulation();
}

function resetScene() {
    stopDeviceSimulation();

    // 清理绘制状态
    if (drawingMode === 'draw-field') cleanupDrawing();
    if (drawingMode === 'draw-path') cleanupPathDrawing();
    drawingMode = 'none';

    // 清理编辑状态
    deselectVertex();
    deselectAllFields();
    for (var fid in editingVertexMeshes) {
        hideEditingMarkers(fid);
    }
    editingVertexMeshes = {};
    editingFieldId = null;

    // 清空所有数据
    clearAllFields();
    clearAllPaths();
    clearAllDevices();

    setActiveButton(null);
    setStatus('场景已重置，所有数据已清空');
}

function addTractor() {
    var pos = new THREE.Vector3(
        (Math.random() - 0.5) * 40, 0,
        (Math.random() - 0.5) * 40
    );
    addTractorDevice(pos);
}

function addDrone() {
    var pos = new THREE.Vector3(
        (Math.random() - 0.5) * 40, 0,
        (Math.random() - 0.5) * 40
    );
    addDroneDevice(pos);
}

// ==================== 渲染循环 ====================

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// 启动
window.onload = init;
