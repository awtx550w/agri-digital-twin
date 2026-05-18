// data.js - 数据结构与全局状态管理

// 田块列表 [{id, points:[Vector3], mesh, line}]
const fieldList = [];

// 设备列表 [{id, type, position, mesh, pathId}]
const deviceList = [];

// 路径列表 [{id, fieldId, points:[Vector3], line}]
const pathList = [];

let selectedFieldId = null;

// 绘制临时状态
let drawingMode = 'none';  // none | draw-field | draw-path
let drawingPoints = [];
let drawingLine = null;
let drawingPointMeshes = [];

// 顶点编辑状态（由FieldManager.js使用）
let editingVertexMeshes = {};  // {fieldId: [mesh, ...]}
let selectedVertexInfo = null;  // {mesh, vertexIndex, fieldId, mode}
let isDraggingVertex = false;
let editingFieldId = null;

// 仿真状态
let isSimulating = false;
let simFrameId = null;

// 生成唯一ID
function uid() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

// ==================== 田块操作 ====================

function addField(points) {
    var field = {
        id: uid(),
        points: points.map(function(p) { return p.clone(); }),
        mesh: null,
        line: null
    };
    fieldList.push(field);
    refreshPanel();
    return field;
}

function removeField(id) {
    var idx = -1;
    for (var i = 0; i < fieldList.length; i++) {
        if (fieldList[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var f = fieldList[idx];
    if (f.mesh) scene.remove(f.mesh);
    if (f.line) scene.remove(f.line);
    // 删除关联路径
    var toRemove = [];
    for (var j = 0; j < pathList.length; j++) {
        if (pathList[j].fieldId === id) toRemove.push(pathList[j].id);
    }
    toRemove.forEach(function(pid) { removePath(pid); });
    fieldList.splice(idx, 1);
    if (selectedFieldId === id) selectedFieldId = null;
    refreshPanel();
}

function getField(id) {
    for (var i = 0; i < fieldList.length; i++) {
        if (fieldList[i].id === id) return fieldList[i];
    }
    return null;
}

function clearAllFields() {
    var allIds = fieldList.map(function(f) { return f.id; });
    allIds.forEach(function(id) { removeField(id); });
}

// ==================== 设备操作 ====================

function addDevice(type, pos) {
    var dev = {
        id: uid(),
        type: type,
        position: pos.clone(),
        initialPosition: pos.clone(),
        mesh: null,
        pathId: null,
        pathProgress: 0
    };
    deviceList.push(dev);
    refreshPanel();
    return dev;
}

function removeDevice(id) {
    var idx = -1;
    for (var i = 0; i < deviceList.length; i++) {
        if (deviceList[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var d = deviceList[idx];
    if (d.mesh) scene.remove(d.mesh);
    deviceList.splice(idx, 1);
    refreshPanel();
}

function getDevice(id) {
    for (var i = 0; i < deviceList.length; i++) {
        if (deviceList[i].id === id) return deviceList[i];
    }
    return null;
}

function clearAllDevices() {
    stopSimulation();
    deviceList.forEach(function(d) { if (d.mesh) scene.remove(d.mesh); });
    deviceList.length = 0;
}

// ==================== 路径操作 ====================

function addPath(fieldId, points, type) {
    var path = {
        id: uid(),
        fieldId: fieldId,
        type: type || 'work',
        points: points.map(function(p) { return p.clone(); }),
        line: null
    };
    pathList.push(path);
    refreshPanel();
    return path;
}

function removePath(id) {
    var idx = -1;
    for (var i = 0; i < pathList.length; i++) {
        if (pathList[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var p = pathList[idx];
    if (p.line) scene.remove(p.line);
    // 解绑设备
    deviceList.forEach(function(d) { if (d.pathId === id) d.pathId = null; });
    pathList.splice(idx, 1);
    refreshPanel();
}

function getPath(id) {
    for (var i = 0; i < pathList.length; i++) {
        if (pathList[i].id === id) return pathList[i];
    }
    return null;
}

function getFieldPaths(fieldId) {
    var result = [];
    for (var i = 0; i < pathList.length; i++) {
        if (pathList[i].fieldId === fieldId) result.push(pathList[i]);
    }
    return result;
}

function clearAllPaths() {
    for (var i = 0; i < pathList.length; i++) {
        var p = pathList[i];
        if (p.line) scene.remove(p.line);
        if (p.workLine) scene.remove(p.workLine);
        if (p.workMeshes) { for (var w = 0; w < p.workMeshes.length; w++) scene.remove(p.workMeshes[w]); }
        if (p.turnLine) scene.remove(p.turnLine);
        if (p.turnMeshes) { for (var j = 0; j < p.turnMeshes.length; j++) scene.remove(p.turnMeshes[j]); }
    }
    deviceList.forEach(function(d) { d.pathId = null; });
    pathList.length = 0;
    refreshPanel();
}

function totalPathPoints() {
    var sum = 0;
    for (var i = 0; i < pathList.length; i++) {
        var p = pathList[i];
        if (p.workSegments) {
            for (var j = 0; j < p.workSegments.length; j++) {
                sum += p.workSegments[j].length;
            }
        } else {
            sum += p.points ? p.points.length : 0;
        }
    }
    return sum;
}

// ==================== UI更新 ====================

function refreshPanel() {
    var fc = document.getElementById('field-count');
    var pc = document.getElementById('path-count');
    var dc = document.getElementById('device-count');
    if (fc) {
        // 显示当前选中田块的顶点数（从 field.points.length 动态读取）
        if (selectedFieldId) {
            var f = getField(selectedFieldId);
            fc.textContent = f ? f.points.length : 0;
        } else {
            fc.textContent = 0;
        }
    }
    if (pc) pc.textContent = totalPathPoints();
    if (dc) dc.textContent = deviceList.length;
}

function setStatus(text) {
    var el = document.getElementById('status');
    if (el) el.textContent = text;
}

function setActiveButton(activeId) {
    var ids = ['btn-draw-field', 'btn-draw-path', 'btn-start-sim'];
    ids.forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', id === activeId);
    });
}
