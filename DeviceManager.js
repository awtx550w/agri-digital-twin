/**
 * DeviceManager.js - 设备管理 + 仿真驱动
 * 功能：添加拖拉机/无人机模型、路径跟随仿真、模型创建
 * 数据来源：data.js (deviceList, isSimulating, simFrameId)
 */

// ==================== 模型创建 ====================

/**
 * 创建拖拉机3D模型
 */
function createTractorModel() {
    var group = new THREE.Group();

    // 车身主体
    var bodyGeo = new THREE.BoxGeometry(2.5, 1.2, 4);
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0xD32F2F });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    // 驾驶室
    var cabinGeo = new THREE.BoxGeometry(1.8, 1.0, 1.2);
    var cabinMat = new THREE.MeshLambertMaterial({ color: 0x37474F });
    var cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 2.1, -0.3);
    cabin.castShadow = true;
    group.add(cabin);

    // 轮胎
    var wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x212121 });
    var wheelPositions = [
        [-1.0, 0.5, 1.3],
        [1.0, 0.5, 1.3],
        [-1.2, 0.7, -1.3],
        [1.2, 0.7, -1.3]
    ];
    for (var i = 0; i < wheelPositions.length; i++) {
        var wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wheelPositions[i][0], wheelPositions[i][1], wheelPositions[i][2]);
        wheel.castShadow = true;
        group.add(wheel);
    }

    // 标签
    var label = makeDeviceLabel('\uD83D\uDE9C', 2.5);
    label.position.y = 3.2;
    group.add(label);

    group.userData.type = 'tractor';
    return group;
}

/**
 * 创建无人机3D模型
 */
function createDroneModel() {
    var group = new THREE.Group();

    // 机身
    var bodyGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.3, 8);
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x1976D2 });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // 旋翼臂+旋翼
    var armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
    var armMat = new THREE.MeshLambertMaterial({ color: 0x424242 });
    var rotorGeo = new THREE.RingGeometry(0.25, 0.4, 8);
    var rotorMat = new THREE.MeshBasicMaterial({ color: 0x757575, side: THREE.DoubleSide });

    for (var i = 0; i < 4; i++) {
        var angle = (i * Math.PI / 2) + Math.PI / 4;
        var arm = new THREE.Mesh(armGeo, armMat);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(Math.cos(angle) * 0.6, 0, Math.sin(angle) * 0.6);
        group.add(arm);

        var rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.rotation.x = -Math.PI / 2;
        rotor.position.set(Math.cos(angle) * 1.1, 0.1, Math.sin(angle) * 1.1);
        group.add(rotor);
    }

    // 药箱（喷雾器）
    var tankGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 8);
    var tankMat = new THREE.MeshLambertMaterial({ color: 0x388E3C });
    var tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.y = -0.35;
    tank.castShadow = true;
    group.add(tank);

    // 标签
    var label = makeDeviceLabel('\uD83D\uDE81', 1.8);
    label.position.y = 1.5;
    group.add(label);

    group.userData.type = 'drone';
    return group;
}

/**
 * 创建设备emoji标签（CanvasTexture）
 */
function makeDeviceLabel(text, height) {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.font = '80px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);

    var tex = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 1.5, 1);
    return sprite;
}

// ==================== 设备添加/删除 ====================

/**
 * 添加拖拉机设备
 */
function addTractorDevice(pos) {
    var dev = addDevice('tractor', pos);
    dev.mesh = createTractorModel();
    dev.mesh.position.set(pos.x, 0, pos.z);
    scene.add(dev.mesh);
    setStatus('拖拉机 #' + deviceList.length + ' 已添加（需绑定路径后仿真）');
    return dev;
}

/**
 * 添加无人机设备
 */
function addDroneDevice(pos) {
    var dev = addDevice('drone', pos);
    dev.mesh = createDroneModel();
    dev.mesh.position.set(pos.x, 8, pos.z); // 无人机飞行高度8米
    scene.add(dev.mesh);
    setStatus('无人机 #' + deviceList.length + ' 已添加（需绑定路径后仿真）');
    return dev;
}

// ==================== 仿真逻辑 ====================

/**
 * 开始仿真：检查前置条件后启动仿真循环
 */
function startDeviceSimulation() {
    // 条件1：必须有设备
    if (deviceList.length === 0) {
        setStatus('请先添加设备（拖拉机/无人机）！');
        return false;
    }

    // 条件2：必须有路径
    if (pathList.length === 0) {
        setStatus('请先生成路径（绘制田块后点击"生成弓字形路径"）！');
        return false;
    }

    // 条件3：必须有设备绑定了路径
    var boundDevice = null;
    for (var i = 0; i < deviceList.length; i++) {
        if (deviceList[i].pathId) {
            boundDevice = deviceList[i];
            break;
        }
    }
    if (!boundDevice) {
        setStatus('没有设备绑定路径！先生成路径，系统将自动绑定');
        // 自动取第一条路径绑定到第一台设备
        if (pathList.length > 0 && deviceList.length > 0) {
            deviceList[0].pathId = pathList[0].id;
            setStatus('已自动绑定路径到设备，请再次点击"开始仿真"');
        }
        return false;
    }

    // 初始化所有设备的路径进度
    for (var j = 0; j < deviceList.length; j++) {
        if (deviceList[j].pathId) {
            deviceList[j].pathProgress = 0;
        }
    }

    isSimulating = true;
    setActiveButton('btn-start-sim');
    setStatus('仿真运行中... 点击"重置场景"可停止');
    runSimulationLoop();
    return true;
}

/**
 * 仿真循环：requestAnimationFrame驱动
 */
function runSimulationLoop() {
    if (!isSimulating) return;

    for (var i = 0; i < deviceList.length; i++) {
        var device = deviceList[i];
        if (!device.pathId || !device.mesh) continue;

        var path = getPath(device.pathId);
        if (!path || path.points.length < 2) continue;

        var pts = path.points;
        var totalPoints = pts.length;

        // 计算当前段索引
        var idx = Math.floor(device.pathProgress);
        if (idx >= totalPoints - 1) {
            // 路径走完，重置
            device.pathProgress = 0;
            continue;
        }

        // 插值计算当前位置
        var t = device.pathProgress - idx;
        var p1 = pts[idx];
        var p2 = pts[Math.min(idx + 1, totalPoints - 1)];

        var newX = p1.x + (p2.x - p1.x) * t;
        var newZ = p1.z + (p2.z - p1.z) * t;

        // 拖拉机贴地，无人机保持高度
        device.mesh.position.x = newX;
        device.mesh.position.z = newZ;
        if (device.type === 'drone') {
            device.mesh.position.y = 8;
        } else {
            device.mesh.position.y = 0;
        }

        // 更新朝向（面向下一个点）
        var dx = p2.x - p1.x;
        var dz = p2.z - p1.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.01) {
            device.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // 前进速度：无人机快一些
        var speed = device.type === 'drone' ? 0.04 : 0.015;
        device.pathProgress += speed;
    }

    simFrameId = requestAnimationFrame(runSimulationLoop);
}

/**
 * 停止仿真：取消动画帧，重置设备位置
 */
function stopDeviceSimulation() {
    isSimulating = false;
    if (simFrameId) {
        cancelAnimationFrame(simFrameId);
        simFrameId = null;
    }

    // 重置所有设备位置和进度
    for (var i = 0; i < deviceList.length; i++) {
        var d = deviceList[i];
        d.pathProgress = 0;
        if (d.mesh && d.initialPosition) {
            d.mesh.position.copy(d.initialPosition);
            if (d.type === 'drone') {
                d.mesh.position.y = 8;
            } else {
                d.mesh.position.y = 0;
            }
            d.mesh.rotation.y = 0;
        }
    }
    setActiveButton(null);
    setStatus('仿真已停止，设备已复位');
}
