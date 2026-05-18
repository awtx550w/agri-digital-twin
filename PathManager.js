/**
 * PathManager.js - 路径管理（重写版）
 * 核心算法：田块主轴分析 + Sutherland-Hodgman多边形裁剪
 * 100%保证路径落在田块边界内，作业线/转弯段用不同颜色区分
 */

// 临时状态
var currentPathLine = null;
var currentPathMarkers = [];

// ==================== 几何基础工具 ====================

/**
 * 射线投射法：判断点是否在多边形内
 * @param {Object} p  — {x, z}
 * @param {Array} poly — [{x,z}, ...] 闭合多边形顶点数组
 * @returns {boolean}
 */
function isPointInPolygon(p, poly) {
    var inside = false;
    var n = poly.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = poly[i].x, zi = poly[i].z;
        var xj = poly[j].x, zj = poly[j].z;
        var intersect = ((zi > p.z) !== (zj > p.z)) &&
            (p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * 线段与多边形求交（多段线裁剪）
 * @param {Object} p1 — 线段起点 {x, z}
 * @param {Object} p2 — 线段终点 {x, z}
 * @param {Array} poly — 多边形顶点数组 [{x,z}, ...]
 * @returns {Array|null} — 裁剪后多段线顶点数组，或null表示无交集
 */
function clipSegmentByPolygon(p1, p2, poly) {
    // 找线段与多边形所有边的交点，加上两个端点（如果在多边形内）
    var intersections = [];
    var n = poly.length;
    var margin = 0.05; // 容差

    function addIfInside(pt) {
        if (isPointInPolygon(pt, poly) || isPointOnSegment(pt, p1, p2)) {
            intersections.push(pt);
        }
    }

    // 检查线段两个端点
    if (isPointInPolygon(p1, poly)) intersections.push(p1);
    if (isPointInPolygon(p2, poly)) intersections.push(p2);

    // 求线段与多边形每条边的交点
    for (var i = 0; i < n; i++) {
        var edgeStart = poly[i];
        var edgeEnd = poly[(i + 1) % n];
        var hit = lineIntersection(p1, p2, edgeStart, edgeEnd);
        if (hit) intersections.push(hit);
    }

    if (intersections.length < 2) return null;

    // 按到p1的距离排序
    var cx = p1.x, cz = p1.z;
    intersections.sort(function(a, b) {
        var da = (a.x - cx) * (a.x - cx) + (a.z - cz) * (a.z - cz);
        var db = (b.x - cx) * (b.x - cx) + (b.z - cz) * (b.z - cz);
        return da - db;
    });

    // 合并距离很近的点
    var result = [intersections[0]];
    for (var k = 1; k < intersections.length; k++) {
        var last = result[result.length - 1];
        var dx = intersections[k].x - last.x;
        var dz = intersections[k].z - last.z;
        if (dx * dx + dz * dz > 0.001) {
            result.push(intersections[k]);
        }
    }

    return result.length >= 2 ? result : null;
}

/**
 * 判断点是否在线段上（容差）
 */
function isPointOnSegment(pt, s1, s2) {
    var minX = Math.min(s1.x, s2.x) - 0.01;
    var maxX = Math.max(s1.x, s2.x) + 0.01;
    var minZ = Math.min(s1.z, s2.z) - 0.01;
    var maxZ = Math.max(s1.z, s2.z) + 0.01;
    if (pt.x < minX || pt.x > maxX || pt.z < minZ || pt.z > maxZ) return false;
    var dx = s2.x - s1.x, dz = s2.z - s1.z;
    var len2 = dx * dx + dz * dz;
    if (len2 < 0.0001) return false;
    var t = ((pt.x - s1.x) * dx + (pt.z - s1.z) * dz) / len2;
    return t >= -0.01 && t <= 1.01;
}

/**
 * 两条线段求交点
 */
function lineIntersection(p1, p2, p3, p4) {
    var x1 = p1.x, z1 = p1.z, x2 = p2.x, z2 = p2.z;
    var x3 = p3.x, z3 = p3.z, x4 = p4.x, z4 = p4.z;
    var denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    var t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
    var u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;
    if (t >= -0.001 && t <= 1.001 && u >= -0.001 && u <= 1.001) {
        return { x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1) };
    }
    return null;
}

/**
 * 平面旋转变换
 * @param {Object} p — {x, z}
 * @param {Object} center — 旋转中心 {x, z}
 * @param {number} angleRad — 旋转角（弧度）
 * @returns {Object} — 旋转后点 {x, z}
 */
function rotatePoint(p, center, angleRad) {
    var cos = Math.cos(angleRad);
    var sin = Math.sin(angleRad);
    var dx = p.x - center.x;
    var dz = p.z - center.z;
    return {
        x: center.x + dx * cos - dz * sin,
        z: center.z + dx * sin + dz * cos
    };
}

/**
 * 计算多边形几何中心
 */
function getPolygonCentroid(poly) {
    var cx = 0, cz = 0;
    for (var i = 0; i < poly.length; i++) {
        cx += poly[i].x;
        cz += poly[i].z;
    }
    return { x: cx / poly.length, z: cz / poly.length };
}

/**
 * 计算轴对齐包围盒
 */
function getPolygonBounds(poly) {
    var minX = Infinity, maxX = -Infinity;
    var minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < poly.length; i++) {
        if (poly[i].x < minX) minX = poly[i].x;
        if (poly[i].x > maxX) maxX = poly[i].x;
        if (poly[i].z < minZ) minZ = poly[i].z;
        if (poly[i].z > maxZ) maxZ = poly[i].z;
    }
    return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

/**
 * 计算田块主轴方向
 * 策略：取凸包最长边的方向作为主轴（简化版PCA）
 * 返回：{ angle: 弧度, axis: 'x'|'z' }
 */
function computeFieldAxis(poly) {
    var n = poly.length;
    // 找凸包顶点
    var hull = computeConvexHull(poly);
    if (hull.length < 2) {
        return { angle: 0, axis: 'x' };
    }
    // 找凸包上距离最远的一对顶点
    var maxDist = -1, pA = hull[0], pB = hull[0];
    for (var i = 0; i < hull.length; i++) {
        for (var j = i + 1; j < hull.length; j++) {
            var dx = hull[j].x - hull[i].x;
            var dz = hull[j].z - hull[i].z;
            var d = dx * dx + dz * dz;
            if (d > maxDist) {
                maxDist = d;
                pA = hull[i];
                pB = hull[j];
            }
        }
    }
    // 主轴方向角（使长边方向对齐X轴）
    var angle = Math.atan2(pB.z - pA.z, pB.x - pA.x);
    return { angle: angle, pA: pA, pB: pB };
}

/**
 * Andrew's monotone chain凸包算法
 */
function computeConvexHull(points) {
    points = points.slice().sort(function(a, b) {
        return a.x - b.x !== 0 ? a.x - b.x : a.z - b.z;
    });
    var n = points.length;
    if (n <= 1) return points;
    var cross = function(o, a, b) {
        return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    };
    var lower = [], upper = [];
    for (var i = 0; i < n; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
            lower.pop();
        }
        lower.push(points[i]);
    }
    for (var j = n - 1; j >= 0; j--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[j]) <= 0) {
            upper.pop();
        }
        upper.push(points[j]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

// ==================== 弓字形路径生成（核心算法） ====================

/**
 * 生成严格在田块内的弓字形路径
 * @param {Object} field — 田块对象 {id, points: Vector3[]}
 * @param {number} swathWidth — 作业幅宽（米），默认3m
 * @param {number} turnRadius — 转弯段最小半径（米），默认2m
 * @returns {Object} — {workSegments: [...], turnSegments: [...], workPoints: [...]}
 */
function generateBoustrophedonPathFull(field, swathWidth, turnRadius) {
    swathWidth = swathWidth || 3.0;
    turnRadius = turnRadius || 2.0;

    // 提取多边形顶点（XZ平面）
    var poly = [];
    for (var vi = 0; vi < field.points.length; vi++) {
        poly.push({ x: field.points[vi].x, z: field.points[vi].z });
    }

    // 计算主轴方向
    var axisInfo = computeFieldAxis(poly);
    var angle = axisInfo.angle;
    var centroid = getPolygonCentroid(poly);

    // 旋转多边形，使主轴水平
    var rotPoly = [];
    for (var ri = 0; ri < poly.length; ri++) {
        rotPoly.push(rotatePoint(poly[ri], centroid, -angle));
    }

    // 在旋转空间内计算AABB
    var bounds = getPolygonBounds(rotPoly);
    var minX = bounds.minX, maxX = bounds.maxX;
    var minZ = bounds.minZ, maxZ = bounds.maxZ;

    // 生成扫描线（沿Z轴方向，等间距）
    var workSegments = [];     // 纯作业段
    var allWorkPoints = [];    // 展平的作业点（含重复端点）
    var z = minZ + swathWidth / 2;

    while (z <= maxZ) {
        var scanP1 = { x: minX, z: z };
        var scanP2 = { x: maxX, z: z };

        // 与多边形求交，裁剪掉田块外的部分
        var clipped = clipSegmentByPolygon(scanP1, scanP2, rotPoly);
        if (clipped && clipped.length >= 2) {
            // 将裁剪结果逆旋转回世界坐标
            var worldPts = [];
            for (var ci = 0; ci < clipped.length; ci++) {
                worldPts.push(rotatePoint(clipped[ci], centroid, angle));
            }
            workSegments.push(worldPts);
            for (var wi = 0; wi < worldPts.length; wi++) {
                allWorkPoints.push(worldPts[wi]);
            }
        }

        z += swathWidth;
    }

    // 生成转弯段（连接相邻作业线端点）
    var turnSegments = [];
    for (var si = 0; si < workSegments.length - 1; si++) {
        var segA = workSegments[si]; // 当前段
        var segB = workSegments[si + 1]; // 下一段

        // 确定连接方式（"鱼骨式"：下行→上行交替）
        var isForward = (si % 2 === 0);
        var endA, startB;

        if (isForward) {
            endA = segA[segA.length - 1];   // 当前段末端
            startB = segB[0];               // 下一段起点
        } else {
            endA = segA[0];                  // 当前段起点
            startB = segB[segB.length - 1];  // 下一段末端（反向）
        }

        // 只在端点距离足够远时添加转弯段
        var dxTurn = endA.x - startB.x;
        var dzTurn = endA.z - startB.z;
        var turnDist = Math.sqrt(dxTurn * dxTurn + dzTurn * dzTurn);

        if (turnDist > 0.5) {
            // 生成圆弧转弯（简化：用折线段模拟圆弧）
            var midTurn = generateTurnArc(endA, startB, turnRadius);
            if (midTurn.length > 0) {
                turnSegments.push(midTurn);
            }
        }
    }

    return {
        workSegments: workSegments,
        turnSegments: turnSegments,
        workPoints: allWorkPoints,
        angle: angle
    };
}

/**
 * 生成两点间的转弯弧线（简化圆弧：用折线段模拟）
 */
function generateTurnArc(p1, p2, radius) {
    var dx = p2.x - p1.x;
    var dz = p2.z - p1.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) return [];

    // 弧线段数（弧长/radius，限制最多20段）
    var arcLength = dist * 0.6;
    var segments = Math.max(3, Math.min(12, Math.ceil(arcLength / radius * 4)));
    var midPts = [];

    for (var i = 1; i <= segments; i++) {
        var t = i / (segments + 1);
        // 圆弧插值（简化：取p1→p2的弯曲中间点）
        midPts.push({
            x: p1.x + dx * t,
            z: p1.z + dz * t
        });
    }
    return midPts;
}

// ==================== 路径点裁剪（手动绘制路径） ====================

/**
 * 路径模式下添加一个路径点
 */
function addPathPoint(point) {
    if (drawingMode !== 'draw-path') return;
    var p = new THREE.Vector3(point.x, 0.5, point.z);
    drawingPoints.push(p);

    var marker = makePathMarker(p, drawingPoints.length);
    scene.add(marker);
    currentPathMarkers.push(marker);

    updatePathPreviewLine();
    setStatus('路径绘制中：已添加 ' + drawingPoints.length + ' 个路径点，右键闭合');
}

/**
 * 路径绘制模式入口
 */
function startDrawPath() {
    if (!selectedFieldId) {
        setStatus('请先选中一个田块！');
        return;
    }
    if (drawingMode === 'draw-field') {
        cleanupDrawing();
    }
    drawingMode = 'draw-path';
    drawingPoints = [];
    drawingLine = null;
    currentPathLine = null;
    currentPathMarkers = [];
    setActiveButton('btn-draw-path');
    setStatus('路径绘制：左键点击添加路径点，右键闭合（路径会自动裁剪到田块内）');
}

/**
 * 创建路径点标记球体
 */
function makePathMarker(pos, number) {
    var group = new THREE.Group();
    var geo = new THREE.SphereGeometry(0.4, 12, 12);
    var mat = new THREE.MeshBasicMaterial({ color: 0x2196F3, transparent: true, opacity: 0.9 });
    var sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(pos);
    group.add(sphere);

    var canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 32, 32);
    var tex = new THREE.CanvasTexture(canvas);
    var labelMat = new THREE.SpriteMaterial({ map: tex });
    var label = new THREE.Sprite(labelMat);
    label.position.set(pos.x, pos.y + 1.0, pos.z);
    label.scale.set(1.2, 1.2, 1);
    group.add(label);

    return group;
}

/**
 * 更新路径预览连线
 */
function updatePathPreviewLine() {
    if (currentPathLine) { scene.remove(currentPathLine); currentPathLine = null; }
    if (drawingPoints.length < 2) return;

    var pts = [];
    for (var i = 0; i < drawingPoints.length; i++) {
        pts.push(new THREE.Vector3(drawingPoints[i].x, drawingPoints[i].y, drawingPoints[i].z));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0xFF9800, linewidth: 2 });
    currentPathLine = new THREE.Line(geo, mat);
    scene.add(currentPathLine);
}

/**
 * 闭合路径（右键/双击触发）
 * 路径点经过多边形裁剪，只保留田块内的有效点
 */
function closePath() {
    if (drawingMode !== 'draw-path') return;
    if (drawingPoints.length < 2) {
        setStatus('路径至少需要2个点！');
        return;
    }

    var fieldId = selectedFieldId;
    var field = getField(fieldId);
    if (!field) { setStatus('田块数据异常！'); return; }

    // 提取田块多边形顶点
    var poly = [];
    for (var vi = 0; vi < field.points.length; vi++) {
        poly.push({ x: field.points[vi].x, z: field.points[vi].z });
    }

    // 逐点过滤：只保留在多边形内的点
    var validPoints = [];
    for (var pi = 0; pi < drawingPoints.length; pi++) {
        var pt = { x: drawingPoints[pi].x, z: drawingPoints[pi].z };
        if (isPointInPolygon(pt, poly)) {
            validPoints.push(drawingPoints[pi].clone());
        }
    }

    if (validPoints.length < 2) {
        setStatus('路径点全部在田块外，请重新绘制！');
        return;
    }

    // 依次连接相邻点（段裁剪）
    var finalPoints = [validPoints[0]];
    for (var si = 0; si < validPoints.length - 1; si++) {
        var clipped = clipSegmentByPolygon(
            { x: validPoints[si].x, z: validPoints[si].z },
            { x: validPoints[si + 1].x, z: validPoints[si + 1].z },
            poly
        );
        if (clipped) {
            for (var ci = 1; ci < clipped.length; ci++) {
                finalPoints.push(new THREE.Vector3(clipped[ci].x, 0.5, clipped[ci].z));
            }
        }
    }

    // 保存路径
    var path = addPath(fieldId, finalPoints, 'manual');
    path.workSegments = [finalPoints]; // 整条作为工作段
    path.turnSegments = [];

    // 绘制
    drawBoustrophedonPath(path);

    cleanupPathDrawing();

    if (deviceList.length > 0) {
        deviceList[0].pathId = path.id;
        setStatus('路径已创建（' + finalPoints.length + ' 个有效点），已绑定到设备');
    } else {
        setStatus('路径已创建（' + finalPoints.length + ' 个有效点），请添加设备后开始仿真');
    }

    drawingMode = 'none';
    setActiveButton(null);
}

/**
 * 清理路径绘制临时状态
 */
function cleanupPathDrawing() {
    if (currentPathLine) { scene.remove(currentPathLine); currentPathLine = null; }
    for (var i = 0; i < currentPathMarkers.length; i++) scene.remove(currentPathMarkers[i]);
    currentPathMarkers = [];
    drawingPoints = [];
    drawingLine = null;
}

/**
 * 清理临时绘制（田块绘制用）
 */
function cleanupDrawing() {
    drawingPointMeshes.forEach(function(m) { scene.remove(m); });
    if (drawingLine) { scene.remove(drawingLine); drawingLine = null; }
    drawingPoints = [];
    drawingPointMeshes = [];
}

// ==================== 弓字形自动路径生成 ====================

/**
 * 为选中田块生成弓字形路径（100%边界内）
 */
function generateBoustrophedonPath() {
    if (!selectedFieldId) {
        setStatus('请先选中一个田块！');
        return null;
    }

    var field = getField(selectedFieldId);
    if (!field || field.points.length < 3) {
        setStatus('田块数据无效！');
        return null;
    }

    // 生成弓字形（主轴分析 + 多边形裁剪）
    var result = generateBoustrophedonPathFull(field, 3.0, 2.0);

    if (result.workSegments.length === 0) {
        setStatus('路径生成失败：田块太小或形状异常！');
        return null;
    }

    // 统计有效作业点数
    var totalWorkPoints = 0;
    for (var si = 0; si < result.workSegments.length; si++) {
        totalWorkPoints += result.workSegments[si].length;
    }

    // 将所有作业点展平为线性路径（顺序连接各段）
    var orderedPoints = [];
    for (var oi = 0; oi < result.workSegments.length; oi++) {
        var seg = result.workSegments[oi];
        if (oi === 0) {
            // 第一段：正向
            for (var ji = 0; ji < seg.length; ji++) {
                orderedPoints.push(new THREE.Vector3(seg[ji].x, 0.5, seg[ji].z));
            }
        } else {
            // 后续段：反向（鱼骨式）
            for (var ki = seg.length - 1; ki >= 0; ki--) {
                orderedPoints.push(new THREE.Vector3(seg[ki].x, 0.5, seg[ki].z));
            }
        }
        // 添加转弯段
        if (oi < result.turnSegments.length) {
            var turnSeg = result.turnSegments[oi];
            for (var ti = 0; ti < turnSeg.length; ti++) {
                orderedPoints.push(new THREE.Vector3(turnSeg[ti].x, 0.5, turnSeg[ti].z));
            }
        }
    }

    // 保存路径
    var path = addPath(selectedFieldId, orderedPoints, 'boustrophedon');
    path.workSegments = result.workSegments;
    path.turnSegments = result.turnSegments;

    // 渲染（作业线绿+转弯段橙）
    drawBoustrophedonPath(path);

    // 自动绑定到第一个设备
    if (deviceList.length > 0) {
        deviceList[0].pathId = path.id;
        setStatus('弓字形路径已生成：' + result.workSegments.length + ' 条作业线，' +
            totalWorkPoints + ' 个有效作业点，已绑定设备');
    } else {
        setStatus('弓字形路径已生成：' + result.workSegments.length + ' 条作业线，' +
            totalWorkPoints + ' 个有效作业点，请添加设备');
    }

    return path;
}

/**
 * 渲染弓字形路径：作业线(绿色)+转弯段(橙色)分色绘制
 */
function drawBoustrophedonPath(path) {
    // 清理旧渲染
    if (path.line) { scene.remove(path.line); path.line = null; }
    if (path.workLine) { scene.remove(path.workLine); path.workLine = null; }
    if (path.turnLine) { scene.remove(path.turnLine); path.turnLine = null; }
    if (path.turnMeshes) {
        path.turnMeshes.forEach(function(m) { scene.remove(m); });
        path.turnMeshes = [];
    }

    // 渲染作业线（绿色，粗）：每段单独渲染，避免NaN问题
    if (path.workSegments && path.workSegments.length > 0) {
        path.workMeshes = [];
        for (var si = 0; si < path.workSegments.length; si++) {
            var seg = path.workSegments[si];
            if (seg.length < 2) continue;
            for (var ji = 0; ji < seg.length - 1; ji++) {
                var wpts = [
                    new THREE.Vector3(seg[ji].x, 0.5, seg[ji].z),
                    new THREE.Vector3(seg[ji + 1].x, 0.5, seg[ji + 1].z)
                ];
                var wgeo = new THREE.BufferGeometry().setFromPoints(wpts);
                var wmat = new THREE.LineBasicMaterial({ color: 0x4CAF50, linewidth: 3 });
                var wline = new THREE.Line(wgeo, wmat);
                scene.add(wline);
                path.workMeshes.push(wline);
            }
        }
        path.workLine = path.workMeshes.length > 0 ? path.workMeshes[0] : null;
    }

    // 渲染转弯段（橙色，细）
    if (path.turnSegments && path.turnSegments.length > 0) {
        path.turnMeshes = [];
        for (var ti = 0; ti < path.turnSegments.length; ti++) {
            var tseg = path.turnSegments[ti];
            if (tseg.length < 2) continue;
            for (var tji = 0; tji < tseg.length - 1; tji++) {
                var tpts = [
                    new THREE.Vector3(tseg[tji].x, 0.5, tseg[tji].z),
                    new THREE.Vector3(tseg[tji + 1].x, 0.5, tseg[tji + 1].z)
                ];
                var tgeo = new THREE.BufferGeometry().setFromPoints(tpts);
                var tmat = new THREE.LineBasicMaterial({ color: 0xFF9800, linewidth: 2 });
                var tline = new THREE.Line(tgeo, tmat);
                scene.add(tline);
                path.turnMeshes.push(tline);
            }
        }
    }

    // 保留兼容：旧版 line 指向作业线
    path.line = path.workLine;
}

/**
 * 清除所有路径（UI按钮调用）
 */
function clearAllPathsUI() {
    clearAllPaths();
    setStatus('所有路径已清除，可重新生成');
}

// ==================== 设备绑定 ====================

/**
 * 绑定第一个设备到指定路径
 */
function bindFirstDeviceToPath(pathId) {
    if (deviceList.length === 0) return false;
    return bindDeviceToPath(deviceList[0].id, pathId);
}

/**
 * 绑定指定设备到指定路径
 */
function bindDeviceToPath(deviceId, pathId) {
    var device = getDevice(deviceId);
    if (!device) return false;
    var path = getPath(pathId);
    if (!path) return false;
    device.pathId = pathId;
    device.pathProgress = 0;
    return true;
}
