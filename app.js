// 农业数字孪生系统 - 主程序
// Three.js 场景初始化与交互逻辑

let scene, camera, renderer, raycaster, mouse;
let mode = 'none';  // 当前模式: draw-field, draw-path, simulate
let fieldPoints = [];  // 田块边界点
let vehicles = [];  // 农机数组
let paths = [];  // 路径数组

// 初始化场景
function init() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);  // 天蓝色背景
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(
        60,  // 视角
        window.innerWidth / window.innerHeight,  // 宽高比
        0.1,  // 近平面
        1000  // 远平面
    );
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // 创建地面
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x8fbc8f });  // 草地绿
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // 添加网格辅助线
    const gridHelper = new THREE.GridHelper(200, 50, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);
    
    // 初始化射线投射器和鼠标坐标
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // 添加鼠标点击事件
    renderer.domElement.addEventListener('click', onCanvasClick, false);
    
    // 添加窗口 resize 事件
    window.addEventListener('resize', onWindowResize, false);
    
    // 添加简单的相机控制（轨道控制）
    addOrbitControl();
    
    updateStatus('场景初始化完成 - 可开始绘制田块');
    
    // 开始渲染循环
    animate();
}

// 简单轨道控制（避免引入额外库）
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

function addOrbitControl() {
    renderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button === 0) {  // 左键
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    renderer.domElement.addEventListener('mousemove', (e) => {
        if (!isDragging || mode !== 'none') return;
        
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        
        camera.position.x -= deltaX * 0.1;
        camera.position.z -= deltaY * 0.1;
        
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // 滚轮缩放
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const scale = 1 + e.deltaY * 0.001;
        camera.position.multiplyScalar(scale);
    });
}

// 鼠标点击事件处理
function onCanvasClick(event) {
    if (mode === 'none') return;
    
    // 计算鼠标在归一化设备坐标中的位置
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // 更新射线投射器
    raycaster.setFromCamera(mouse, camera);
    
    // 计算与地面的交点
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
    
    if (mode === 'draw-field') {
        addFieldPoint(intersectionPoint);
    } else if (mode === 'draw-path') {
        addPathPoint(intersectionPoint);
    }
}

// 添加田块边界点
function addFieldPoint(point) {
    fieldPoints.push(point.clone());
    
    // 可视化点
    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(point);
    scene.add(sphere);
    
    // 如果已有至少3个点，绘制田块面
    if (fieldPoints.length >= 3) {
        drawField();
    }
    
    updateStatus(`已添加 ${fieldPoints.length} 个边界点 - 继续点击添加或切换到路径规划`);
}

// 绘制田块
function drawField() {
    // 移除旧的田块面
    const oldField = scene.getObjectByName('field-mesh');
    if (oldField) scene.remove(oldField);
    
    // 创建田块面
    const shape = new THREE.Shape();
    shape.moveTo(fieldPoints[0].x, fieldPoints[0].z);
    for (let i = 1; i < fieldPoints.length; i++) {
        shape.lineTo(fieldPoints[i].x, fieldPoints[i].z);
    }
    shape.closePath();
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshLambertMaterial({ 
        color: 0x7cfc00,  // 草绿色
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = 'field-mesh';
    mesh.receiveShadow = true;
    scene.add(mesh);
}

// 添加路径点
function addPathPoint(point) {
    paths.push(point.clone());
    
    // 可视化路径点
    const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(point);
    sphere.name = 'path-point';
    scene.add(sphere);
    
    // 如果有至少2个点，绘制路径线
    if (paths.length >= 2) {
        drawPath();
    }
    
    updateStatus(`已添加 ${paths.length} 个路径点`);
}

// 绘制路径
function drawPath() {
    // 移除旧路径
    const oldPath = scene.getObjectByName('path-line');
    if (oldPath) scene.remove(oldPath);
    
    // 创建路径线
    const points = paths.map(p => new THREE.Vector3(p.x, p.y + 0.1, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff4500, linewidth: 3 });
    const line = new THREE.Line(geometry, material);
    line.name = 'path-line';
    scene.add(line);
}

// 设置模式
function setMode(newMode) {
    mode = newMode;
    
    // 更新按钮状态
    document.querySelectorAll('#control-panel button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (newMode === 'draw-field') {
        document.getElementById('btn-draw-field').classList.add('active');
        updateStatus('田块绘制模式 - 在地面上点击添加边界点');
    } else if (newMode === 'draw-path') {
        document.getElementById('btn-draw-path').classList.add('active');
        updateStatus('路径规划模式 - 在地面上点击添加路径点');
    } else {
        updateStatus('就绪');
    }
}

// 添加农机
function addVehicle(type) {
    const geometry = type === 'tractor' 
        ? new THREE.BoxGeometry(3, 2, 4)  // 拖拉机
        : new THREE.SphereGeometry(1, 16, 16);  // 无人机
    
    const material = new THREE.MeshLambertMaterial({ 
        color: type === 'tractor' ? 0xff6347 : 0x4169e1 
    });
    const vehicle = new THREE.Mesh(geometry, material);
    vehicle.castShadow = true;
    vehicle.name = `vehicle-${vehicles.length}`;
    vehicle.userData = { type: type, speed: 0 };
    
    // 放置在随机位置
    vehicle.position.set(
        (Math.random() - 0.5) * 40,
        type === 'tractor' ? 1 : 5,
        (Math.random() - 0.5) * 40
    );
    
    scene.add(vehicle);
    vehicles.push(vehicle);
    
    updateStatus(`已添加 ${type === 'tractor' ? '拖拉机' : '无人机'} #${vehicles.length}`);
}

// 开始仿真
function startSimulation() {
    if (vehicles.length === 0) {
        updateStatus('请先添加至少一台设备');
        return;
    }
    
    mode = 'simulate';
    document.getElementById('btn-start-sim').classList.add('active');
    updateStatus('仿真进行中...');
    
    // 简单移动动画
    vehicles.forEach((vehicle, index) => {
        animateVehicle(vehicle, index);
    });
}

// 农机动画
function animateVehicle(vehicle, index) {
    const type = vehicle.userData.type;
    const direction = new THREE.Vector3(
        Math.random() - 0.5,
        0,
        Math.random() - 0.5
    ).normalize();
    
    function move() {
        if (mode !== 'simulate') return;
        
        vehicle.position.add(direction.clone().multiplyScalar(0.1));
        
        // 边界检查
        if (Math.abs(vehicle.position.x) > 50 || Math.abs(vehicle.position.z) > 50) {
            direction.negate();
        }
        
        requestAnimationFrame(move);
    }
    
    move();
}

// 重置场景
function resetScene() {
    // 移除所有路径点和线
    scene.children.filter(child => 
        child.name === 'path-point' || child.name === 'path-line'
    ).forEach(child => scene.remove(child));
    
    // 移除田块
    const fieldMesh = scene.getObjectByName('field-mesh');
    if (fieldMesh) scene.remove(fieldMesh);
    
    // 移除所有农机
    vehicles.forEach(vehicle => scene.remove(vehicle));
    
    // 重置数据
    fieldPoints = [];
    paths = [];
    vehicles = [];
    mode = 'none';
    
    // 移除按钮 active 状态
    document.querySelectorAll('#control-panel button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    updateStatus('场景已重置');
}

// 更新状态栏
function updateStatus(text) {
    document.getElementById('status').textContent = text;
}

// 窗口大小变化处理
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// 页面加载完成后初始化
window.onload = init;
