/**
 * 地形管理模块 - Terrain.js
 * 负责3D场景初始化、地面网格、天空背景
 */
class TerrainManager {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 初始化地形和场景基础元素
     */
    init() {
        this.createSky();
        this.createGround();
        this.createGrid();
        this.createLights();
    }

    /**
     * 创建天空（渐变背景）
     */
    createSky() {
        // 使用天蓝色作为背景
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // 添加雾效增加深度感
        this.scene.fog = new THREE.Fog(0x87CEEB, 100, 300);
    }

    /**
     * 创建地面
     */
    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(200, 200, 50, 50);
        
        // 添加地形起伏（简单噪声）
        const positions = groundGeometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 1];
            // 简单的丘陵效果
            positions[i + 2] = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 2;
        }
        groundGeometry.computeVertexNormals();

        const groundMaterial = new THREE.MeshLambertMaterial({
            color: 0x228B22,
            side: THREE.DoubleSide
        });

        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.ground.name = 'ground';
        this.scene.add(this.ground);
    }

    /**
     * 创建网格辅助线
     */
    createGrid() {
        const gridHelper = new THREE.GridHelper(200, 40, 0x666666, 0x444444);
        gridHelper.position.y = 0.05;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
    }

    /**
     * 创建光源
     */
    createLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // 主光源（太阳）
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        this.scene.add(sunLight);

        // 补光
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-50, 50, -50);
        this.scene.add(fillLight);
    }

    /**
     * 获取地面对象（用于射线检测）
     */
    getGround() {
        return this.ground;
    }
}
