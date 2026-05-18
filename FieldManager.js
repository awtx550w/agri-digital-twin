/**
 * FieldManager.js - 田块绘制与编辑管理（完全重写版）
 *
 * 核心功能：
 * - 顶点射线拾取（点击选中/高亮）
 * - 顶点拖拽（实时更新mesh/line）
 * - Delete键删除顶点
 * - 三种方式闭合田块（右击/双击/点击首顶点）
 * - 自相交多边形校验
 * - 实时同步更新ShapeGeometry + 边界线
 *
 * 顶点状态：
 * - drawingPointMeshes[]     : 绘制中的顶点球
 * - editingVertexMeshes{}     : {fieldId: [mesh, ...]} 编辑中的顶点球
 * - selectedVertexInfo        : {mesh, vertexIndex, fieldId, mode} 当前选中顶点
 * - isDraggingVertex         : boolean 是否在拖拽
 * - editingFieldId            : string 当前编辑的田块ID
 */

// ==================== 顶点球创建 ====================

/**
 * 创建顶点标记球体（带编号）
 * 每个球体含 userData 供射线拾取
 */
function makePointMarker(pos, color, number) {
    var group = new THREE.Group();

    // 主体球 - 设置材质：depthTest=false确保不被地面遮挡，renderOrder=10确保最上层渲染
    var geo = new THREE.SphereGeometry(0.5, 16, 16);
    var mat = new THREE.MeshBasicMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 0.9,
        depthTest: false,    // 关键：不被地面网格遮挡
        depthWrite: false    // 关键：不写入深度缓冲区
    });
    var sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(pos.x, 1.0, pos.z);
    sphere.renderOrder = 10; // 关键：比地面(renderOrder=0)更高，优先渲染
    group.add(sphere);

    // 编号标签（CanvasSprite）
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 32, 32);

    var tex = new THREE.CanvasTexture(canvas);
    var labelMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var label = new THREE.Sprite(labelMat);
    label.position.set(pos.x, 1.9, pos.z);
    label.scale.set(1.5, 1.5, 1);
    label.renderOrder = 11; // 标签比球体更高
    group.add(label);

    // 关键修复：给Group设置userData（Group本身也要能被识别为可拾取）
    group.userData.pickable = true;
    group.userData.markerGroup = group;  // 指向自身
    group.userData.sphere = sphere;      // 引用球体Mesh

    // 球体本身也设置userData（双保险）
    sphere.userData.pickable = true;
    sphere.userData.markerGroup = group;
    sphere.userData.vertexIndex = -1;  // 待外部设置
    sphere.userData.fieldId = null;
    sphere.userData.mode = 'draw';

    return group; // 返回Group（Group的userData已设置，射线检测能正确命中）
}

/**
 * 给已存在的 vertex mesh 重新设置 userData（用于编辑模式）
 * 同时设置Group和sphere的userData（双保险）
 */
function tagVertexMesh(mesh, vertexIndex, fieldId, mode) {
    mode = mode || 'draw';
    // 设置Group的userData
    mesh.userData.pickable = true;
    mesh.userData.vertexIndex = vertexIndex;
    mesh.userData.fieldId = fieldId;
    mesh.userData.mode = mode;
    
    // 同时设置球体的userData
    var sphere = mesh.userData.sphere || (mesh.children.length > 0 ? mesh.children[0] : null);
    if (sphere) {
        sphere.userData.pickable = true;
        sphere.userData.vertexIndex = vertexIndex;
        sphere.userData.fieldId = fieldId;
        sphere.userData.mode = mode;
    }
    return mesh;
}

// ==================== 绘制中顶点操作 ====================

/**
 * 添加田块顶点（绘制模式）
 */
function addFieldVertex(point) {
    if (drawingMode !== 'draw-field') return;
    
    // 先检测是否点击了第一个顶点（闭合触发）
    var picked = pickVertexAt(point);
    if (picked && picked.vertexIndex === 0 && drawingPoints.length >= 3) {
        closeField();
        return;
    }

    drawingPoints.push(point.clone());

    // 创建顶点标记（返回Group）
    var mesh = makePointMarker(point, 0xFF4444, drawingPoints.length);
    tagVertexMesh(mesh, drawingPoints.length - 1, null, 'draw');
    
    // 关键：Group整体添加到场景
    scene.add(mesh);
    drawingPointMeshes.push(mesh);
    
    console.log('✅ 添加顶点[' + (drawingPoints.length - 1) + ']:', mesh.type, 'children:', mesh.children.length);

    // 更新预览线
    updateDrawingLine();
    setStatus('田块绘制中：' + drawingPoints.length + ' 个顶点（右键/双击/点击首顶点闭合）');
}

/**
 * 重建所有绘制顶点标记（删除后重建）
 */
function rebuildDrawingMarkers() {
    // 清理旧的
    for (var i = 0; i < drawingPointMeshes.length; i++) {
        scene.remove(drawingPointMeshes[i]);
    }
    drawingPointMeshes = [];

    // 重建
    for (var j = 0; j < drawingPoints.length; j++) {
        var mesh = makePointMarker(drawingPoints[j], 0xFF4444, j + 1);
        tagVertexMesh(mesh, j, null, 'draw');
        scene.add(mesh);
        drawingPointMeshes.push(mesh);
    }
}

// ==================== 射线拾取 ====================

/**
 * 收集场景中所有可拾取的顶点Group
 * 返回Group数组（不是子Mesh），因为Group有完整的userData
 */
function getAllPickableMeshes() {
    var result = [];
    
    // 绘制中的顶点（Group）
    for (var i = 0; i < drawingPointMeshes.length; i++) {
        if (drawingPointMeshes[i] && drawingPointMeshes[i].userData.pickable) {
            result.push(drawingPointMeshes[i]);
            console.log('  绘制顶点[' + i + ']:', drawingPointMeshes[i].type, 'pickable=', drawingPointMeshes[i].userData.pickable);
        }
    }
    
    // 编辑中的顶点（所有田块）
    for (var fid in editingVertexMeshes) {
        var arr = editingVertexMeshes[fid];
        for (var j = 0; j < arr.length; j++) {
            if (arr[j] && arr[j].userData.pickable) {
                result.push(arr[j]);
                console.log('  编辑顶点[' + fid + '][' + j + ']:', arr[j].type, 'pickable=', arr[j].userData.pickable);
            }
        }
    }
    
    console.log('总共可拾取对象:', result.length);
    return result;
}

/**
 * 用射线检测拾取顶点
 * @param {THREE.Vector3} groundPoint — 鼠标射线与地面的交点（用于优先检测地面附近顶点）
 * @returns {Object|null} — {mesh, vertexIndex, fieldId, mode}
 */
function pickVertex(groundPoint) {
    raycaster.setFromCamera(mouse, camera);
    var pickables = getAllPickableMeshes();
    
    // 调试log：检查有多少可拾取对象
    console.log('=== 顶点射线检测 ===');
    console.log('可拾取对象数量:', pickables.length);
    
    var hits = raycaster.intersectObjects(pickables, false); // false=不递归检测子对象
    
    console.log('射线命中数量:', hits.length);
    if (hits.length > 0) {
        console.log('命中对象:', {
            type: hits[0].object.type,
            userData: hits[0].object.userData,
            uuid: hits[0].object.uuid
        });
    }
    
    if (hits.length > 0) {
        // 关键：命中可能是Group（包含球体和标签），需要正确提取userData
        var hitObj = hits[0].object;
        
        // 如果命中的是Group，尝试获取sphere
        var sphere = hitObj;
        if (hitObj.type === 'Group' && hitObj.userData.sphere) {
            sphere = hitObj.userData.sphere;
        }
        
        // 优先从sphere获取userData，其次从Group获取
        var userData = sphere.userData.vertexIndex !== undefined ? sphere.userData : hitObj.userData;
        
        if (userData && userData.pickable) {
            console.log('✅ 命中有效顶点:', {vertexIndex: userData.vertexIndex, fieldId: userData.fieldId, mode: userData.mode});
            return {
                mesh: hitObj,  // 返回被命中的对象（Group或Mesh）
                sphere: sphere, // 球体引用（用于高亮）
                vertexIndex: userData.vertexIndex,
                fieldId: userData.fieldId,
                mode: userData.mode
            };
        }
    }
    
    console.log('❌ 未命中有效顶点');
    return null;
}

/**
 * 查找指定位置的顶点（精确匹配，阈值0.8米）
 */
function pickVertexAt(point) {
    var pickables = getAllPickableMeshes();
    var minDist = Infinity, nearest = null;
    for (var i = 0; i < pickables.length; i++) {
        var m = pickables[i];
        if (!m.userData.pickable) continue;
        var dx = m.position.x - point.x;
        var dz = m.position.z - point.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.8 && d < minDist) {
            minDist = d;
            nearest = {
                mesh: m,
                vertexIndex: m.userData.vertexIndex,
                fieldId: m.userData.fieldId,
                mode: m.userData.mode
            };
        }
    }
    return nearest;
}

// ==================== 顶点选中与高亮 ====================

/**
 * 选中顶点（高亮）
 */
function selectVertex(info) {
    // 取消旧的
    deselectVertex();

    selectedVertexInfo = info;
    if (info && info.mesh) {
        // 获取球体Mesh（可能是Group或直接是Mesh）
        var sphere = info.sphere || info.mesh;
        if (info.mesh.type === 'Group') {
            // 从Group获取球体
            for (var i = 0; i < info.mesh.children.length; i++) {
                var child = info.mesh.children[i];
                if (child.type === 'Mesh') {
                    sphere = child;
                    break;
                }
            }
        }
        
        // 存原始颜色并高亮
        sphere.userData._origColor = sphere.material.color.getHex();
        sphere.material.color.setHex(0xFFFF00); // 黄色高亮
        sphere.scale.set(1.4, 1.4, 1.4); // 放大

        // 标签也放大
        var group = info.mesh.userData.markerGroup || info.mesh;
        if (group.children) {
            for (var j = 0; j < group.children.length; j++) {
                if (group.children[j] !== sphere) {
                    group.children[j].scale.set(2.0, 2.0, 1);
                }
            }
        }
    }
}

/**
 * 取消选中顶点
 */
function deselectVertex() {
    if (selectedVertexInfo && selectedVertexInfo.mesh) {
        var mesh = selectedVertexInfo.mesh;
        
        // 获取球体Mesh
        var sphere = selectedVertexInfo.sphere || mesh;
        if (mesh.type === 'Group') {
            for (var k = 0; k < mesh.children.length; k++) {
                if (mesh.children[k].type === 'Mesh') {
                    sphere = mesh.children[k];
                    break;
                }
            }
        }
        
        if (sphere && sphere.userData._origColor !== undefined) {
            sphere.material.color.setHex(sphere.userData._origColor);
        }
        if (sphere) sphere.scale.set(1, 1, 1);
        
        var group = mesh.userData.markerGroup || mesh;
        if (group.children) {
            for (var i = 0; i < group.children.length; i++) {
                if (group.children[i] !== sphere) {
                    group.children[i].scale.set(1.5, 1.5, 1);
                }
            }
        }
    }
    selectedVertexInfo = null;
}

// ==================== 顶点拖拽 ====================

/**
 * 开始拖拽顶点
 */
function startDragVertex(event) {
    if (event.button !== 0) return;
    var groundPoint = getGroundPoint(event);
    if (!groundPoint) return;

    var picked = pickVertex(groundPoint);
    if (picked) {
        isDraggingVertex = true;
        selectVertex(picked);
        setStatus('拖拽顶点中... 释放鼠标确认位置');
        event.stopPropagation(); // 阻止传播，不触发相机旋转
    }
}

/**
 * 拖拽中更新顶点位置
 */
function updateDragVertex(event) {
    if (!isDraggingVertex || !selectedVertexInfo) return;
    var groundPoint = getGroundPoint(event);
    if (!groundPoint) return;

    var info = selectedVertexInfo;
    var newPos = new THREE.Vector3(groundPoint.x, 1.0, groundPoint.z);

    if (info.mode === 'draw') {
        // 绘制中：更新 drawingPoints 和 mesh 位置
        if (info.vertexIndex < drawingPoints.length) {
            drawingPoints[info.vertexIndex].set(groundPoint.x, 0, groundPoint.z);
            
            // 更新Group位置
            info.mesh.position.set(groundPoint.x, 0, groundPoint.z);
            
            // 更新Group内所有子对象位置
            if (info.mesh.children) {
                for (var i = 0; i < info.mesh.children.length; i++) {
                    var child = info.mesh.children[i];
                    if (child.type === 'Mesh') {
                        child.position.set(groundPoint.x, 1.0, groundPoint.z);
                    } else if (child.type === 'Sprite') {
                        child.position.set(groundPoint.x, 1.9, groundPoint.z);
                    }
                }
            }
            updateDrawingLine();
        }
    } else if (info.mode === 'edit' && info.fieldId) {
        // 编辑中：更新 field.points 和田块 mesh/line
        var field = getField(info.fieldId);
        if (field && info.vertexIndex < field.points.length) {
            field.points[info.vertexIndex].set(groundPoint.x, 0, groundPoint.z);
            
            // 更新Group位置
            info.mesh.position.set(groundPoint.x, 0, groundPoint.z);
            
            // 更新Group内所有子对象位置
            if (info.mesh.children) {
                for (var j = 0; j < info.mesh.children.length; j++) {
                    var child = info.mesh.children[j];
                    if (child.type === 'Mesh') {
                        child.position.set(groundPoint.x, 1.0, groundPoint.z);
                    } else if (child.type === 'Sprite') {
                        child.position.set(groundPoint.x, 1.9, groundPoint.z);
                    }
                }
            }
            // 重建田块 mesh + line
            redrawFieldMesh(field);
            redrawFieldBorder(field);
            refreshPanel();
        }
    }
}

/**
 * 结束拖拽
 */
function endDragVertex(event) {
    if (!isDraggingVertex) return;
    isDraggingVertex = false;
    if (selectedVertexInfo) {
        setStatus('顶点位置已更新');
    }
}

// ==================== 顶点删除 ====================

/**
 * 删除当前选中的顶点（Delete / Backspace）
 */
function deleteSelectedVertex() {
    if (!selectedVertexInfo) {
        // 如果没有选中，尝试删除最后一个顶点
        if (drawingMode === 'draw-field' && drawingPoints.length > 0) {
            var lastIndex = drawingPoints.length - 1;
            drawingPoints.pop();
            // 重新构建顶点标记
            rebuildDrawingMarkers();
            updateDrawingLine();
            setStatus('已删除末尾顶点，剩余 ' + drawingPoints.length + ' 个');
            refreshPanel();
        }
        return;
    }

    var info = selectedVertexInfo;

    if (info.mode === 'draw') {
        // 绘制中：从 drawingPoints 删除
        if (info.vertexIndex < drawingPoints.length) {
            drawingPoints.splice(info.vertexIndex, 1);
            rebuildDrawingMarkers();
            updateDrawingLine();
            setStatus('已删除顶点，剩余 ' + drawingPoints.length + ' 个');
        }
    } else if (info.mode === 'edit' && info.fieldId) {
        // 编辑中：从 field.points 删除
        var field = getField(info.fieldId);
        if (field && info.vertexIndex < field.points.length) {
            field.points.splice(info.vertexIndex, 1);
            if (field.points.length < 3) {
                // 顶点数不足，删除整个田块
                removeField(info.fieldId);
                hideEditingMarkers(info.fieldId);
                setStatus('田块顶点数不足，已删除田块');
                editingFieldId = null;
            } else {
                // 重建田块 mesh + line
                redrawFieldMesh(field);
                redrawFieldBorder(field);
                // 重建编辑标记
                rebuildEditingMarkers(info.fieldId);
                setStatus('已删除顶点，田块剩余 ' + field.points.length + ' 个顶点');
            }
        }
    }

    deselectVertex();
    refreshPanel();
}

// ==================== 田块闭合 ====================

/**
 * 闭合田块，生成正式多边形
 * 三种触发方式：
 *   1. 右键菜单 -> onContextMenu -> closeField()
 *   2. 双击     -> onDoubleClick  -> closeField()
 *   3. 点击首顶点 -> addFieldVertex -> 检测到首顶点 -> closeField()
 */
function closeField() {
    if (drawingMode !== 'draw-field') return;
    if (drawingPoints.length < 3) {
        setStatus('田块至少需要3个顶点！');
        return;
    }

    // 校验多边形有效性
    if (!isSimplePolygon(drawingPoints)) {
        setStatus('田块绘制无效：多边形存在自相交，请重新绘制！');
        return;
    }

    // 创建田块
    var field = addField(drawingPoints);

    // 渲染
    drawFieldMesh(field);
    drawFieldBorder(field);

    // 选中新田块
    selectField(field.id);

    // 清理绘制状态
    cleanupDrawing();
    drawingMode = 'none';
    setActiveButton(null);
    setStatus('田块已创建（' + field.points.length + ' 个顶点），点击田块可进入编辑模式');
    refreshPanel();
}

// ==================== 多边形校验 ====================

/**
 * 检测多边形是否有自相交（排除共享端点）
 */
function isSimplePolygon(points) {
    var n = points.length;
    if (n < 4) return true; // 三角形不可能自相交

    for (var i = 0; i < n; i++) {
        var a1 = points[i];
        var a2 = points[(i + 1) % n];
        for (var j = i + 2; j < n; j++) {
            // 跳过相邻边
            if (j === (i + n - 1) % n) continue;
            var b1 = points[j];
            var b2 = points[(j + 1) % n];
            if (segmentsIntersect(a1, a2, b1, b2)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * 判断两条线段是否相交（不含端点）
 */
function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(A, B, C) {
        return (C.z - A.z) * (B.x - A.x) > (B.z - A.z) * (C.x - A.x);
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

// ==================== 田块选择与编辑 ====================

/**
 * 选中田块（用于路径生成）
 */
function selectField(id) {
    deselectAllFields();
    selectedFieldId = id;
    var field = getField(id);
    if (!field) return;

    if (field.mesh) {
        field.mesh.material.color.setHex(0x81C784);
        field.mesh.material.opacity = 0.7;
    }
    if (field.line) {
        field.line.material.color.setHex(0xFFEB3B);
    }

    // 进入编辑模式：显示顶点标记
    showEditingMarkers(id);
    editingFieldId = id;

    setStatus('已选中田块（' + field.points.length + ' 个顶点），可直接拖拽顶点编辑形状');
}

/**
 * 取消所有田块选中
 */
function deselectAllFields() {
    if (selectedFieldId) {
        var f = getField(selectedFieldId);
        if (f) {
            if (f.mesh) {
                f.mesh.material.color.setHex(0x4CAF50);
                f.mesh.material.opacity = 0.5;
            }
            if (f.line) f.line.material.color.setHex(0x2E7D32);
        }
    }
    selectedFieldId = null;

    // 隐藏编辑标记
    if (editingFieldId) {
        hideEditingMarkers(editingFieldId);
    }
    editingFieldId = null;
    deselectVertex();
}

/**
 * 显示田块顶点标记（编辑模式）
 */
function showEditingMarkers(fieldId) {
    hideEditingMarkers(fieldId); // 先清理
    var field = getField(fieldId);
    if (!field) return;

    var meshes = [];
    for (var i = 0; i < field.points.length; i++) {
        var p = field.points[i];
        var mesh = makePointMarker(p, 0x9C27B0, i + 1); // 紫色 = 编辑中
        tagVertexMesh(mesh, i, fieldId, 'edit');
        scene.add(mesh);
        meshes.push(mesh);
        console.log('✅ 添加编辑顶点[' + i + ']:', mesh.type, 'fieldId:', fieldId);
    }
    editingVertexMeshes[fieldId] = meshes;
}

/**
 * 隐藏田块顶点标记
 */
function hideEditingMarkers(fieldId) {
    var meshes = editingVertexMeshes[fieldId];
    if (meshes) {
        for (var i = 0; i < meshes.length; i++) {
            scene.remove(meshes[i]);
        }
        delete editingVertexMeshes[fieldId];
    }
}

// ==================== 田块渲染更新 ====================

/**
 * 重建田块面（ShapeGeometry）
 */
function redrawFieldMesh(field) {
    if (field.mesh) { scene.remove(field.mesh); field.mesh = null; }
    if (field.points.length < 3) return;

    var shape = new THREE.Shape();
    shape.moveTo(field.points[0].x, field.points[0].z);
    for (var i = 1; i < field.points.length; i++) {
        shape.lineTo(field.points[i].x, field.points[i].z);
    }
    shape.closePath();

    var geo = new THREE.ShapeGeometry(shape);
    var mat = new THREE.MeshLambertMaterial({
        color: 0x4CAF50, side: THREE.DoubleSide, transparent: true, opacity: 0.5
    });
    field.mesh = new THREE.Mesh(geo, mat);
    field.mesh.rotation.x = -Math.PI / 2;
    field.mesh.position.y = 0.15;
    field.mesh.userData.fieldId = field.id;
    field.mesh.userData.pickable = true;
    scene.add(field.mesh);
}

/**
 * 重建田块边界线
 */
function redrawFieldBorder(field) {
    if (field.line) { scene.remove(field.line); field.line = null; }
    if (field.points.length < 2) return;

    var pts = [];
    for (var i = 0; i < field.points.length; i++) {
        pts.push(new THREE.Vector3(field.points[i].x, 0.5, field.points[i].z));
    }
    pts.push(pts[0].clone());

    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0x2E7D32, linewidth: 3 });
    field.line = new THREE.Line(geo, mat);
    field.line.userData.fieldId = field.id;
    scene.add(field.line);
}

/**
 * 绘制田块面（新建时）
 */
function drawFieldMesh(field) {
    redrawFieldMesh(field);
}

/**
 * 绘制田块边界（新建时）
 */
function drawFieldBorder(field) {
    redrawFieldBorder(field);
}

/**
 * 重建指定田块的编辑顶点标记
 */
function rebuildEditingMarkers(fieldId) {
    hideEditingMarkers(fieldId);
    showEditingMarkers(fieldId);
}

// ==================== 绘制线更新 ====================

/**
 * 更新绘制预览线（橙色）
 */
function updateDrawingLine() {
    if (drawingLine) { scene.remove(drawingLine); drawingLine = null; }
    if (drawingPoints.length < 2) return;

    var pts = [];
    for (var i = 0; i < drawingPoints.length; i++) {
        pts.push(new THREE.Vector3(drawingPoints[i].x, 0.5, drawingPoints[i].z));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0xFF6600, linewidth: 2 });
    drawingLine = new THREE.Line(geo, mat);
    scene.add(drawingLine);
}

// ==================== 清理 ====================

/**
 * 清理绘制临时状态
 */
function cleanupDrawing() {
    // 清理顶点标记
    for (var i = 0; i < drawingPointMeshes.length; i++) {
        scene.remove(drawingPointMeshes[i]);
    }
    drawingPointMeshes = [];

    // 清理预览线
    if (drawingLine) { scene.remove(drawingLine); drawingLine = null; }

    drawingPoints = [];
    deselectVertex();
}

/**
 * 取消绘制
 */
function cancelDrawing() {
    cleanupDrawing();
    drawingMode = 'none';
    setActiveButton(null);
    setStatus('绘制已取消');
}

// ==================== 开始绘制 ====================

/**
 * 开始绘制田块
 */
function startDrawField() {
    cancelDrawing();
    deselectVertex();
    deselectAllFields();

    drawingMode = 'draw-field';
    setActiveButton('btn-draw-field');
    setStatus('绘制田块：左键点击添加顶点（点击首顶点/右键/双击均可闭合）');
}
