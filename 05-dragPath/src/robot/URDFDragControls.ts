import {
	Color,
	EventDispatcher,
	type Intersection,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	type Object3DEventMap,
	OrthographicCamera,
	PerspectiveCamera,
	Plane,
	Raycaster,
	Vector3,
} from 'three'
import { URDFJoint, URDFLink, URDFRobot } from './URDFClasses'
import {
	findLinkVisual,
	findNearestJoint,
	findNearestLink,
	PI2,
	screenToNDC,
} from './utils'
import { ResourceTracker } from './ResourceTracker'
import { JointDragHelper } from './JointDragHelper'

type CameraType = OrthographicCamera | PerspectiveCamera
type HoverType = Intersection & {
	link: URDFLink
	joint?: URDFJoint
	// joint 变换基点
	origin?: Vector3
	// joint 变换轴
	pivot?: Vector3
	// joint 变换平面,旋转平面或推拉平面
	tfPlane?: Plane
}

/* URDF 模型拖拽类 */
class URDFDragControls extends EventDispatcher<any> {
	// 相机
	camera: CameraType
	// dom
	domElement: HTMLElement
	// 拖拽对象集合
	robots: URDFRobot[]
	// 鼠标划上的对象数据
	curHover: HoverType | undefined
	// 当前鼠标拖拽的关节的变换值
	curJointValue: number = 0
	// 鼠标每次移动时的起始位置和结束位置(世界坐标系)
	dragStart = new Vector3()
	dragEnd = new Vector3()
	// 是否正在拖拽
	dragging = false
	// 是否启用拖拽变换
	enabled = true
  // 关节拖拽路径，辅助拖拽
  jointDragHelper = new JointDragHelper();
	// 资源清理器
	resourceTracker = new ResourceTracker()

	constructor(
		camera: CameraType,
		domElement: HTMLElement,
		robots: URDFRobot | URDFRobot[] = [],
	) {
		super()
		this.camera = camera
		this.domElement = domElement
		this.robots = robots instanceof Array ? robots : [robots]
    this.jointDragHelper.visible = false;
    this.resourceTracker.track(this.jointDragHelper)
		// 鼠标事件
		this.pointerdown = this.pointerdown.bind(this)
		this.pointermove = this.pointermove.bind(this)
		this.pointerup = this.pointerup.bind(this)
		this.listen()
	}
	// 添加拖拽对象
	add(robot: URDFRobot) {
		this.robots.push(robot)
	}
	// 监听事件
	listen() {
		const { domElement } = this
		domElement.addEventListener('pointerdown', this.pointerdown)
		domElement.addEventListener('pointermove', this.pointermove)
		domElement.addEventListener('pointerup', this.pointerup)
	}

	// 鼠标移动时
	pointermove({ pageX, pageY }: PointerEvent) {
		const {
			enabled,
			curHover,
			dragEnd,
			dragStart,
			domElement: canvas,
			camera,
		} = this
		if (!enabled) {
			return
		}
		// 鼠标的屏幕坐标
		const { left, top } = canvas.getBoundingClientRect()
		const [cx, cy] = [pageX - left, pageY - top]
		// 鼠标的DNC 坐标
		const NDCPos = screenToNDC({ x: cx, y: cy }, canvas)
		// 从视点到鼠标点的射线
		const raycaster = new Raycaster()
		raycaster.setFromCamera(NDCPos, camera)
		// 瞬时变换量
		let delta: number = 0
		if (this.dragging) {
			// 若有关节处于拖拽状态
			if (!curHover) {
				return
			}
			const { origin, pivot, joint, tfPlane } = curHover
			if (!pivot || !joint || !tfPlane) {
				return
			}
			const {
				userData: { type },
			} = joint
			const oldValue = this.curJointValue
			// 计算从视点到鼠标点的射线在变换平面上的交点
			raycaster.ray.intersectPlane(tfPlane, dragEnd)
			if (!dragEnd) {
				return
			}
			if (type == 'prismatic') {
				// 推拉关节
				// 推拉终点到推拉起点的向量
				const startToEnd = dragEnd.clone().sub(dragStart)
				// startToEnd 在推拉轴上的正射影,即瞬时推拉量
				delta = startToEnd.dot(pivot)
			} else {
				// 旋转关节
				if (!origin) {
					return
				}
				// 构建origin 基点到拖拽起点和终点的向量
				const originToStart = new Vector3().subVectors(dragStart, origin)
				const originToEnd = new Vector3().subVectors(dragEnd, origin)
				// 根据行列式获取绕轴旋转的正负方向
				const direction = Math.sign(
					originToStart.clone().cross(originToEnd).dot(pivot),
				)
				// 瞬时旋转弧度
				delta = direction * originToEnd.angleTo(originToStart)
			}
			// 若瞬时变换量为0，则说明没有变换
			if (!delta) {
				return
			}
			// 累积瞬时变换量
			this.curJointValue += delta
			// 变换关节
			joint.setValue(this.curJointValue)
			// 触发changeValue事件
			this.dispatchEvent({
				type: 'changeValue',
				joint,
				value: this.curJointValue,
				oldValue,
			})
			// 更新拖拽起点
			dragStart.copy(dragEnd)
		} else {
			// 若没有关节处于拖拽状态，选择模型
			let intersections = this.intersectRobots(raycaster)
			// 若选中模型
			if (intersections.length) {
				// 离视点最近的模型数据
				const hoverData = intersections[0]
        if(hoverData==undefined){return}
				// 根据当前模型寻找其父级link
				const link = findNearestLink(hoverData.object)
				if (!link) {
					return
				}
				//离link最近的可变换关节
				const joint = findNearestJoint(link)
				if (!this.curHover) {
					// 若之前没有被物体鼠标划上，高亮link
					this.highlightMaterial(link)
					// 触发鼠标划入机器人事件
					this.dispatchEvent({
						type: 'pointerOverRobot',
						link,
						joint,
						x: cx,
						y: cy,
					})
				} else if (this.curHover.object != hoverData.object) {
					// 否则，若鼠标之前划上的物体与当前鼠标划上的物体不是同一个
					// 重置关节材质
					this.restoreCurHoverMat()
					// 高亮link
					this.highlightMaterial(link)
				}
				// 存储鼠标划上的对象数据
				this.curHover = { ...hoverData, link: link, joint }
				// 触发鼠标在机器人上移动的事件
				this.dispatchEvent({
					type: 'pointerMoveOnRobot',
					link,
					joint,
					x: cx,
					y: cy,
				})
				// 更新鼠标样式
				canvas.style.cursor = 'pointer'
			} else if (curHover) {
				this.dispatchEvent({ type: 'pointerOutRobot' })
				// 若鼠标没有选中物体，且之前有物体被选中
				// 重置此物体所在link的材质
				this.restoreCurHoverMat()
				// 清理curHover数据
				this.curHover = undefined
				// 更新鼠标样式
				canvas.style.cursor = 'default'
			}
		}
	}

	// 射线选中的的Mesh
	intersectRobots(raycaster: Raycaster) {
		const { robots } = this
		let temp: Intersection<Object3D<Object3DEventMap>>[] = []
		for (let robot of robots) {
			const {
				userData: { linkMap },
			} = robot
			if (!linkMap) {
				continue
			}
			linkMap.forEach((link) => {
				this.traverseMeshInLink(link, (obj) => {
					const intersections = raycaster.intersectObject(obj, false)
          if(intersections[0]){
            if(temp[0]){
              if(intersections[0].distance<temp[0].distance){
                temp = intersections
              }
            }else{
              temp = intersections
            }
          }
				})
			})
		}
		return temp
	}

	// 鼠标按下时
	pointerdown({ button }: PointerEvent) {
		// 只适配左击
		if (button !== 0) {
			return
		}
		const { curHover, enabled, camera,jointDragHelper,domElement  } = this
		if (!enabled || !curHover || !curHover.joint) {
			return
		}
		// 确保相机的视图投影矩阵为最新的
		camera.updateMatrixWorld()
		camera.updateProjectionMatrix()

		const { point, joint } = curHover
		const {
			matrixWorld,
			matrixWorld: { elements },
			userData: { type, value, axis },
		} = joint
		// 记录当前关节的变换量
		this.curJointValue = value
		// 拖拽起始位置，即鼠标射线与变换平面的交点
		this.dragStart.copy(point)
		// 变换轴在世界坐标系里的方向
		const pivot = axis.clone().transformDirection(matrixWorld)
		curHover.pivot = pivot
		// 拖拽状态
		this.dragging = true
    // 拖拽辅助对象可见
    jointDragHelper.visible = true
		// 关节的世界坐标位
		const jointWorldPos = new Vector3(elements[12], elements[13], elements[14])
		// 交点point在pivot上的正交投影(世界坐标系)，即joint的旋转的基点
		const origin = point
			.clone()
			.sub(jointWorldPos)
			.projectOnVector(pivot)
			.add(jointWorldPos)
		// 存储变换基点
		curHover.origin = origin
    // 变换限值
    let {
      userData: {limit:{lower,upper} },
    } = joint;
		// 变换平面，用于旋转和推拉点位的计算
		const tfPlane = new Plane()
		if (type == 'prismatic') {
			// 构建推拉平面
			const v1 = new Vector3()
				.subVectors(camera.position, point)
				.normalize()
				.cross(pivot)
			const v2 = pivot.clone().cross(v1)
			tfPlane.setFromNormalAndCoplanarPoint(v2, point)
      // 应用推拉路径
      jointDragHelper.applyPrismaticPath(point,origin,pivot,lower,upper,value)
		} else {
			// 构建旋转平面
			tfPlane.setFromNormalAndCoplanarPoint(pivot, point)
      if(type=='continuous'){
        const n=Math.floor(value/(Math.PI*2))
        lower=PI2*n
        upper=PI2*(n+1)
      }
      jointDragHelper.applyRotatePath(point,origin,pivot,lower,upper,value,camera,domElement)
		}
		// 存储变换平面
		curHover.tfPlane = tfPlane
		// 触发开始拖拽事件
		this.dispatchEvent({ type: 'beginDrag' })
	}
	// 鼠标抬起时
	pointerup({ button }: PointerEvent) {
		// 只适配左击
		if (button !== 0) {
			return
		}
		const { dragging, enabled ,jointDragHelper} = this
		if (!dragging || !enabled) {
			return
		}
		this.dragging = false
    // 隐藏拽辅助对象
    jointDragHelper.visible = false;
		// 触发结束拖拽事件
		this.dispatchEvent({ type: 'finishDrag' })
	}
	// 高亮关节
	highlightMaterial(link: URDFLink) {
		// 遍历关节中的Mesh对象
		this.traverseMeshInLink(link, (mesh) => {
			const material = mesh.material as Material
			// 暂存当前材质
			mesh.userData.material = material
			// 基于当前材质高亮
			const matClone = material.clone() as MeshStandardMaterial
			matClone.emissive = new Color(0x00acec)
			matClone.emissiveIntensity = 0.3
			mesh.material = matClone
		})
	}
	// 重置当前材质
	restoreCurHoverMat() {
		const { curHover } = this
		if (!curHover || !curHover.link) {
			return
		}
		this.traverseMeshInLink(curHover.link, (mesh) => {
			const { material } = mesh
			'dispose' in material && material.dispose()
			mesh.material = mesh.userData.material
			mesh.userData.material = undefined
		})
	}

	// 在link内遍历mesh
	traverseMeshInLink(obj: Object3D, callback: (mesh: Mesh) => void) {
		const {
			userData: { isURDFJoint, isURDFHelper },
		} = obj
		if (isURDFJoint || isURDFHelper) {
			return
		}
		if (obj instanceof Mesh) {
			callback(obj)
		}
		obj.children.forEach((child) => {
			this.traverseMeshInLink(child, callback)
		})
	}

	// 清理内存
	dispose() {
		const { domElement } = this
		this.resourceTracker.dispose()
		domElement.removeEventListener('pointerdown', this.pointerdown)
		domElement.removeEventListener('pointermove', this.pointermove)
		domElement.removeEventListener('pointerup', this.pointerup)
	}
}

export { URDFDragControls }
