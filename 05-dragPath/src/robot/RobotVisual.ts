import {
	Color,
	DirectionalLight,
	EquirectangularReflectionMapping,
	EventDispatcher,
	Fog,
	GridHelper,
	Mesh,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer,
	OrthographicCamera,
	MeshBasicMaterial,
	ShadowMaterial,
  LoadingManager,
  Box3,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ResourceTracker } from './ResourceTracker'
import type { URDFRobot } from './URDFClasses'
import { URDFLoader } from './URDFLoader'
import { halfPI } from './utils'
import { URDFDragControls } from './URDFDragControls'

/* 机器可视化类 */
class RobotVisual extends EventDispatcher<any> {
	renderer = new WebGLRenderer({
		antialias: true,
		logarithmicDepthBuffer: true,
	})
	scene = new Scene()
	camera: OrthographicCamera | PerspectiveCamera = new PerspectiveCamera(
		45,
		1,
		0.01,
		200,
	)
	orbitControls = new OrbitControls(this.camera, this.renderer.domElement)
	continuousFrame = 0
	resourceTracker = new ResourceTracker()
  urdfDragControls = new URDFDragControls(this.camera, this.renderer.domElement)

	constructor(hdrURL?: string) {
		super()
		const { renderer, scene, resourceTracker, orbitControls, camera,urdfDragControls } = this
		// 适应屏幕分辨率
		renderer.setPixelRatio(window.devicePixelRatio)
		// 投影
		renderer.shadowMap.enabled = true
		// 场景背景色
		scene.background = new Color(0xf6f6f8)
		// 场景雾效
		scene.fog = new Fog(0xf6f6f8, 20, 50)

		// 环境光
		hdrURL &&
			new HDRLoader().loadAsync(hdrURL).then((texture) => {
				texture.mapping = EquirectangularReflectionMapping
				scene.environment = texture
				resourceTracker.track(texture)
			})
		// 灯光
		const light = new DirectionalLight(0xffffff, 1)
		light.position.set(0, 10, 5)
		light.castShadow = true
		scene.add(light)
		resourceTracker.track(light)

		// 地面网格
		const floorGrid = new GridHelper(100, 100, 0x9c9aa5, 0xbcbac7)
		scene.add(floorGrid)
		resourceTracker.track(floorGrid)
		// 地面Geometry
		const floorGeometry = new PlaneGeometry(100, 100)
		// 地面阴影
		const floorShadowMaterial = new ShadowMaterial({
			transparent: true,
			opacity: 0.1,
		})
		const floorShadowMesh = new Mesh(floorGeometry, floorShadowMaterial)
		floorShadowMesh.rotateX(-Math.PI / 2)
		floorShadowMesh.receiveShadow = true
		scene.add(floorShadowMesh)
		resourceTracker.track(floorShadowMesh)
		// 地面
		const floorMaterial = new MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
		})
		const floorMesh = new Mesh(floorGeometry, floorMaterial)
		floorMesh.rotateX(-Math.PI / 2)
		floorMesh.position.y = -0.005
		scene.add(floorMesh)
		resourceTracker.track(floorMesh)

    // URDF拖拽变换辅助对象
    scene.add(urdfDragControls.jointDragHelper)

		// 设置镜头
		camera.position.set(0, 1.2, 3.6)
		orbitControls.target.set(0, 0.8, 0)
		orbitControls.update()
	}
	// 加载URDF模型
	loadURDF(url: string,onLoad?: (robot: URDFRobot) => void) {
    const manager = new LoadingManager();
    const loader = new URDFLoader(manager);
    let robot: URDFRobot;
    loader.load(url, (res: any) => {
      robot = res;
    });
    manager.onLoad = () => {
      // 初始化模型
      this.initModel(robot);
      // 监听事件
			this.listen()
      onLoad&&onLoad(robot);
    };
    manager.onError = () => {
      console.error("URDFLoader: Error loading model.");
    };
    return loader;
  }
  // 初始化模型
  initModel(robot: URDFRobot ) {
    const {
      scene,
      resourceTracker,
      urdfDragControls
    } = this;
    // 使robot面朝z轴
    robot.rotation.set(-halfPI, 0, -halfPI);
    scene.add(robot);
    // 拖拽变换机器人
		urdfDragControls.add(robot)
    // 添加缓存清理机制
    resourceTracker.track(robot);
    // 模型落地
    this.toGround(robot);
  }
  // 使机器人的底部落地
  toGround(robot: URDFRobot) {
    const bb = new Box3();
    bb.setFromObject(robot);
    robot.position.y -= bb.min.y;
  }

	// 监听事件
	listen() {
		const { urdfDragControls } = this
		/* 
      协调orbitControls和 urdfDragControls 的有效性
    */
		urdfDragControls.addEventListener('beginDrag', () => {
			this.orbitControls.enabled = false
		})
		urdfDragControls.addEventListener('finishDrag', () => {
			this.orbitControls.enabled = true
		})
		this.orbitControls.addEventListener('start', () => {
			!urdfDragControls.curHover && (urdfDragControls.enabled = false)
		})
		this.orbitControls.addEventListener('end', () => {
			urdfDragControls.enabled = true
		})
	}

	// 响应式布局
	resize(width: number, height: number) {
		const { renderer, camera } = this
		if (camera instanceof OrthographicCamera) {
			const halfWidth = (camera.top * width) / height
			camera.left = -halfWidth
			camera.right = halfWidth
		} else {
			camera.aspect = width / height
		}
		camera.updateProjectionMatrix()
		renderer.setSize(width, height, true)
	}

	// 渲染
	render() {
		const { renderer, scene, camera } = this
		renderer.render(scene, camera)
	}

	// 连续渲染
	continuousRender() {
		this.render()
		this.continuousFrame = requestAnimationFrame(
			this.continuousRender.bind(this),
		)
	}

	// 清理数据
	dispose() {
		const {
			renderer: { domElement },
		} = this
		this.resourceTracker.dispose()
		this.renderer.dispose()
		this.orbitControls.dispose()
		this.urdfDragControls.dispose()
		domElement.remove()
		cancelAnimationFrame(this.continuousFrame)
	}
}
export { RobotVisual }
