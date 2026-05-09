import {
	Vector3,
	DefaultLoadingManager,
	Group,
	LoadingManager,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	SRGBColorSpace,
	TextureLoader,
	BoxGeometry,
	SphereGeometry,
	CylinderGeometry,
  LineBasicMaterial,
  Euler,
} from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import {
	URDFJoint,
	URDFLink,
	URDFMimicJoint,
	URDFRobot,
	LinkVisual,
	type JointType,
} from './URDFClasses'
import { applyEulerZYX, classifyNodeByName, processTuple } from './utils'
import { JointAxesHelper } from './JointAxesHelper'

type NumberTuple3 = [number, number, number]
type NumberTuple4 = [number, number, number, number]

// 碰撞体材质
const collisionMaterial = new MeshStandardMaterial({
  color: 0xff0000,
  depthTest: false,
  depthWrite: false,
  fog: false,
  toneMapped: false,
  transparent: true,
  opacity: 0.7,
});

// 铅的密度 kg/m3
const densityOfLead = 11340;
// 质心的材质与几何体
const massMaterial = new MeshStandardMaterial({
  color: 0x0ff00,
  depthTest: false,
  depthWrite: false,
  fog: false,
  toneMapped: false,
  transparent: true,
  opacity: 0.7,
});
const massGeometry = new SphereGeometry(1, 8, 6);

function getSizeByInertial(mass:number, ixx:number, iyy:number, izz:number) {
    const x = Math.sqrt(6 * (iyy + izz - ixx) / mass);
    const y = Math.sqrt(6 * (izz + ixx - iyy) / mass);
    const z = Math.sqrt(6 * (ixx + iyy - izz) / mass);
    return new Vector3(x, y, z);
}

// 惯性矩的材质与几何体
const inertiaMat = new MeshStandardMaterial({
  color: 0x00acec,
  depthTest: false,
  depthWrite: false,
  fog: false,
  toneMapped: false,
  transparent: true,
  opacity: 0.6,
});
const inertiaGeometry = new BoxGeometry();

/* URDF加载器 */
class URDFLoader {
	// loader管理器
	manager: LoadingManager
	// fetch请求参数
	fetchOptions: { [k: string]: any } = {}
	// 模型加载方法
	meshParsers: {
		[k: string]: (
			filePath: string,
			material: Material,
			manager?: LoadingManager,
		) => Promise<Object3D | void>
	} = {
		stl: (
			filePath: string,
			material: Material,
			manager: LoadingManager = this.manager,
		) => {
			const loader = new STLLoader(manager)
			return loader.loadAsync(filePath).then(
				(geom) => {
					const mesh = new Mesh(geom, material)
					mesh.castShadow = true
					return mesh
				},
				(err) => {
					console.error('URDFLoader: Error loading mesh.', err)
				},
			)
		},
		dae: (
			filePath: string,
			material: Material,
			manager: LoadingManager = this.manager,
		) => {
			const loader = new ColladaLoader(manager)
			return loader.loadAsync(filePath).then(
				(dae) => {
          if(!dae || !dae.scene) {return}
					const daeScene = dae.scene
					daeScene.traverse((obj) => {
						if (obj instanceof Mesh) {
							obj.material = material
						}
					})
					return daeScene
				},
				(err) => {
					console.error('URDFLoader: Error loading mesh.', err)
				},
			)
		},
	}
	/* 构造函数
    manager：loader管理器，默认DefaultLoadingManager(LoadingManager 的单例模式)
  */
	constructor(manager: LoadingManager = DefaultLoadingManager) {
		this.manager = manager
	}
	/* 动态加载URDF */
	loadAsync(urdfPath: string) {
		return new Promise((resolve, reject) => {
			this.load(urdfPath, resolve, undefined, reject)
		})
	}
	/* 加载URDF 
      url URDF文件链接
      onLoad URDF文件加载完成
      onProgress URDF子文件加载完成
      onError 加载错误
  */
	load(
		url: string,
		onLoad: (robot: Object3D) => void,
		onProgress?: (progress?: any) => void,
		onError?: (err?: any) => void,
	) {
		const { manager } = this
		// 解析URDF文件链接，manager.resolveURL() 可以修改url，若未设置resolveURL方法，返回url
		const urdfPath = this.manager.resolveURL(url)
		// 开始加载文件，需要在加载完成后，与manager.itemEnd(urdfPath)方法搭配使用
		manager.itemStart(urdfPath)
		// 请求URDF文件
		fetch(urdfPath, this.fetchOptions)
			.then((res) => {
				if (res.ok) {
					onProgress && onProgress(res)
					return res.text()
				} else {
					throw new Error(
						`URDFLoader: Failed to load url '${urdfPath}' with error code ${res.status} : ${res.statusText}.`,
					)
				}
			})
			.then((data) => {
				// 解析URDF文件
				const model = this.processUrdf(data, urdfPath)
				model && onLoad(model)
				// 结束加载
				manager.itemEnd(urdfPath)
			})
			.catch((e) => {
				if (onError) {
					onError(e)
				} else {
					console.error('URDFLoader: Error loading file.', e)
				}
				manager.itemError(urdfPath)
				manager.itemEnd(urdfPath)
			})
	}
	/* 解析URDF文件
      data：URDF的text数据，可兼容多种数据格式 
      urdfPath：urdf文件的路径，相对路径的子文件可以基于urdfPath做解析
      subPathReplace[str1,str2]：str2可替换子路径中等于str1的部分
  */
	processUrdf(data: string | Document | Element, urdfPath: string) {
    // urdf标签集合
		let children: Element[]
		// 将URDF文件解析为DOM元素
		if (typeof data == 'string') {
			const parser = new DOMParser()
			const urdf = parser.parseFromString(data, 'application/xml')
			children = Array.from(urdf.children)
		} else if (data instanceof Document) {
			children = Array.from(data.children)
		} else {
			children = [data]
		}
    // console.log('urdf标签',children);
		// 获取<robot>
		const robotNode = children.filter((c) => c.nodeName === 'robot').pop()
		if (!robotNode) {
			return
		}

		const _this = this

		// URDF机器人对象，图形树的根节点，对应<robot>
		const urdfRobot = new URDFRobot()
		urdfRobot.name = robotNode.getAttribute('name') || ''

		// 将<robot>中的一级子元素<link>、<joint>、<material> 归类
		const nodes = classifyNodeByName<'link' | 'joint' | 'material'>(robotNode, [
			'link',
			'joint',
			'material',
		])
    // console.log('nodes',nodes);

		/* 为各类图形对象创建集合，便于管理 */
		// materia集合，可被<visual>图形复用
		const materialMap: Map<string, Material> = new Map()
		// link 图形集合
		const linkMap: Map<string, URDFLink> = new Map()
		// joint 图形集合
		const jointMap: Map<string, URDFJoint> = new Map()
		// 辅助对象-关节坐标系集合
		const jointAxisMap: Map<string, Object3D> = new Map()
		// 辅助对象-质心集合
		const massMap: Map<string, Object3D> = new Map()
		// 辅助对象-惯性矩集合
		const inertiaMap: Map<string, Object3D> = new Map()
		// 辅助对象-碰撞体集合
		const collisionMap: Map<string, Group> = new Map()

		//遍历urdf中的material元素，将其解析成three.js材质，写入materialMap中
		nodes.get('material')?.forEach((materialNode: Element) => {
			const materialName = materialNode.getAttribute('name')
			materialName &&
				materialMap.set(materialName, processMaterial(materialNode))
		})

		//遍历urdf中的link元素，将其解析成three.js 图形对象，写入linkMap中
		nodes.get('link')?.forEach((linkNode: Element) => {
			// link 名称
			const linkName = linkNode.getAttribute('name') || ''
			// link 图形
			const urdfLink = new URDFLink()
			urdfLink.name = linkName
			// 若当前link 不是任何joint的child，那它就是最根部的link。
			if (!robotNode.querySelector(`child[link="${linkName}"]`)) {
				urdfRobot.add(urdfLink)
			}
			// 解析<link>
			processLink(linkNode, urdfLink)
			linkMap.set(linkName, urdfLink)
		})

		//遍历urdf中的joint元素，将其解析成three.js 图形对象，写入jointMap中
		nodes.get('joint')?.forEach((jointNode: Element) => {
			processJoint(jointNode)
		})

		// 将各类对象的集合挂在到机器人对象的userData 上
		Object.assign(urdfRobot.userData, {
			linkMap,
			jointMap,
			jointAxisMap,
			massMap,
			inertiaMap,
			collisionMap,
		})

		// 将mimic关节挂载到被模仿关节上，方便被模仿关节变换时，带动mimic关节的变换
		jointMap.forEach((joint) => {
			if (joint instanceof URDFMimicJoint) {
				// 被模仿的关节
				const joint2 = jointMap.get(joint.userData.joint || '')
				// 一个关节可能被多个关节模仿
				joint2 && joint2.userData.mimicJoints.push(joint)
			}
		})

		// 检查mimic关节的有效性，避免a模仿b，b模仿a的情况
		jointMap.forEach((joint1) => {
      //a>b>c>a
      //uniqueJoints [a,b,c]
			// 被模仿关节集合
			const uniqueJoints = new Set()
			// 判断mimic关节中是否包含被模仿关节
			const iterFunction = (joint2: URDFJoint) => {
				if (uniqueJoints.has(joint2)) {
					throw new Error(
						'URDFLoader: Detected an infinite loop of mimic joints.',
					)
				}
				uniqueJoints.add(joint2)
				joint2.userData.mimicJoints.forEach((joint3: URDFJoint) => {
					iterFunction(joint3)
				})
			}
			iterFunction(joint1)
		})

		/* 
    解析link
    <link name="base">
      <inertial>
        <origin rpy="0.0 0.0 0.0" xyz="0.0 0.0 0.0"/>
        <mass value="0.01"/>
        <inertia ixx="0.0001" ixy="0.0" ixz="0.0" iyy="0.0001" iyz="0.0" izz="0.0001"/>
      </inertial>
      <visual>
        <origin rpy="0 0 0" xyz="0 0 0"/>
        <geometry>
          <box size="0.001 0.001 0.001"/>
        </geometry>
      </visual>
      <collision>
          <geometry>
              <box size="0.001 0.001 0.001"/>
          </geometry>
      </collision>
    </link>
    */
		function processLink(linkNode: Element, urdfLink: Group) {
			// <link>中的所有子标签
			const linkChildren = Array.from(linkNode.children)
			// 遍历<link>中的所有子标签
			linkChildren.forEach((linkChild) => {
				// 子标签类型
				const type = linkChild.nodeName.toLowerCase()
				if (type === 'inertial') {
					// 解析<inertial>，将inertial中的图形添加到urdfLink中
					processInertial(linkChild, urdfLink)
				} else if (type === 'visual') {
					// 解析<visual>，将visual图形添加到urdfLink中
					processVisual(linkChild, urdfLink)
				} else if (type === 'collision') {
					// 解析<collision>，将collision图形添加到urdfLink中
					processCollision(linkChild, urdfLink)
				}
			})
		}
		/* 
    将URDF中的材质解析为three.js里的材质，若需其它材质，可在外部重写此方法 
    <material name="steel">
      <color rgba="0.7 0.65 0.55 1"/>
      <texture filename="../texture/head.jpg"/>
    </material>
    */
		function processMaterial(materialNode: Element) {
			const { manager } = _this
			// 默认材质
			const material = _this.createCommonMaterial()
			material.name = materialNode.getAttribute('name') || ''
			// 遍历<material> 子元素
			for (let child of Array.from(materialNode.children)) {
				const nodeName = child.nodeName.toLowerCase()
				switch (nodeName) {
					case 'color':
						// 解析rgba颜色
						const rgbaAttr = child.getAttribute('rgba')
						if (rgbaAttr) {
							const rgba = processTuple(rgbaAttr) as NumberTuple4
							// 设置rgb颜色
							material.color.setRGB(rgba[0], rgba[1], rgba[2])
							// 设置透明度
							material.opacity = rgba[3]
							material.transparent = rgba[3] < 1
						}
						break
					case 'texture':
						// 纹理路径
						const filename = child.getAttribute('filename')
						if (filename) {
							// 纹理加载器
							const loader = new TextureLoader(manager)
							// 解析纹理路径
							const filePath = _this.resolveSubPath(filename)
							material.map = loader.load(filePath)
							material.map.colorSpace = SRGBColorSpace
						}
						break
				}
			}
			return material
		}

		/* 
    解析joint
    <joint name="R_pinky_finger_distal_joint" type="fixed">
      <origin rpy="0 0 0" xyz="0 0 0.0325"/>
      <parent link="R_pinky_finger_proximal"/>
      <child link="R_pinky_finger_distal"/>
      <axis xyz="0 1 0"/>
      <limit effort="1000" lower="0.33811" upper="3.58322" velocity="1"/>
      <mimic joint="R_pinky_finger_proximal_joint" multiplier="1.005" offset="0.6665"/>
    </joint>
    */
		function processJoint(jointNode: Element) {
			const jointName = jointNode.getAttribute('name') || ''
			const jointType = jointNode.getAttribute('type')
			const jointChildren = Array.from(jointNode.children)
			let jointObj: URDFJoint | URDFMimicJoint
			// mimic节点
			const mimicTag = jointChildren.find(
				(n) => n.nodeName.toLowerCase() === 'mimic',
			)
			if (mimicTag) {
				// 若joint 中存在mimic节点，则此joint会模仿<mimic>中指定的joint
				jointObj = new URDFMimicJoint()
				// 被模仿关节的名称
				const joint = mimicTag.getAttribute('joint') || ''
				// 模仿系数
				const multiplier = mimicTag.getAttribute('multiplier')
				// 偏移量
				const offset = mimicTag.getAttribute('offset')
				Object.assign(jointObj.userData, {
					joint,
					multiplier: multiplier ? parseFloat(multiplier) : 1,
					offset: offset ? parseFloat(offset) : 0,
				})
			} else {
				// 正常关节
				jointObj = new URDFJoint()
			}

      /* 创建辅助对象-关节坐标系 */
      const axesMat = new LineBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
        fog: false,
      });
      const jointAxisHelper = new JointAxesHelper(0.2, axesMat);
      jointAxisHelper.visible = false;
      Object.assign(jointAxisHelper.userData, {
        isURDFHelper: true,
        helperType: "jointAxisHelper",
      });
      jointObj.add(jointAxisHelper);
      jointAxisMap.set(jointName, jointAxisHelper);
      
			const { userData } = jointObj
			// 遍历关节子标签
			jointChildren.forEach((jointChild: Element) => {
				// 关节类型
				const type = jointChild.nodeName.toLowerCase()
				// 将不同类型的关节数据写入关节图形
				switch (type) {
					case 'origin':
						// 关节位置
						const xyz = processTuple(jointChild.getAttribute('xyz')) as NumberTuple3
						jointObj.position.set(xyz[0], xyz[1], xyz[2])
						userData.origPosition.set(xyz[0], xyz[1], xyz[2])
						// 欧拉旋转
						const rpy = processTuple(jointChild.getAttribute('rpy')) as NumberTuple3
						applyEulerZYX(jointObj, rpy)
						userData.origQuaternion.copy(jointObj.quaternion)
						break
					case 'parent':
						// 一个子joint连接一个父link
						const parent = linkMap.get(jointChild.getAttribute('link') || '')
						parent?.add(jointObj)
						break
					case 'child':
						// 一个父joint连接一个子link
						const child = linkMap.get(jointChild.getAttribute('link') || '')
						child && jointObj.add(child)
						break
					case 'axis':
						// 关节变换轴
						const axis = processTuple(jointChild.getAttribute('xyz')) as NumberTuple3
						userData.axis.set(axis[0], axis[1], axis[2])
						break
					case 'limit':
						// 旋转范围
						const lower = jointChild.getAttribute('lower')
						const upper = jointChild.getAttribute('upper')
						const { limit } = userData
						lower && (limit.lower = parseFloat(lower))
						upper && (limit.upper = parseFloat(upper))
						break
				}
			})
			jointObj.name = jointName
			userData.type = jointType as JointType

			jointMap.set(jointName, jointObj)
		}

		/* 解析inertial 
      <inertial>
        <origin rpy="0.0 0.0 0.0" xyz="0.0 0.0 0.0"/>
        <mass value="0.01"/>
        <inertia ixx="0.0001" ixy="0.0" ixz="0.0" iyy="0.0001" iyz="0.0" izz="0.0001"/>
      </inertial>
   */
		function processInertial(inertialNode: Element, urdfLink: Group) {
      // <link> 的name
      const linkName = urdfLink.name;
      // <inertial>子标签
      const inertialChildren = Array.from(inertialNode.children);

      let origin_rpy = [0, 0, 0];
      let origin_xyz = [0, 0, 0];
      let mass_value = 0;
      let ixx = 0, iyy = 0, izz = 0;
      inertialChildren.forEach((node) => {
        switch (node.nodeName.toLowerCase()) {
          case "origin":
            origin_rpy = processTuple(node.getAttribute("rpy"));
            origin_xyz = processTuple(node.getAttribute("xyz"));
            break;
          case "mass":
            mass_value = parseFloat(node.getAttribute("value") || "0");
            break;
          case "inertia":
            ixx=parseFloat(node.getAttribute("ixx") || "0");
            iyy=parseFloat(node.getAttribute("iyy") || "0");
            izz=parseFloat(node.getAttribute("izz") || "0");
            break;
        }
      });

      /* 创建辅助对象-质心 */
      const radius = Math.cbrt((0.75 * mass_value) / (Math.PI * densityOfLead));
      const massHelper = new Mesh(massGeometry, massMaterial);
      massHelper.visible = false;
      const [x=0,y=0,z=0] = origin_xyz;
      massHelper.position.set(x,y,z);
      massHelper.scale.set(radius,radius,radius)
      Object.assign(massHelper.userData, {
        isURDFHelper: true,
        helperType: "massHelper",
      });
      urdfLink.add(massHelper);
      massMap.set(linkName, massHelper);

      /* 创建辅助对象-惯性矩 */    
      if(mass_value < 0 || ixx < 0 || iyy < 0 || izz < 0 ||ixx + iyy < izz || iyy + izz < ixx || izz + ixx < iyy){
        // Unrealistic inertia
        console.warn('The link ' + linkName + ' has unrealistic inertia, unable to visualize box of equivalent inertia.');
      }else{
        // origin旋转量
        const originEuler = new Euler(
          origin_rpy[0],
          origin_rpy[1],
          origin_rpy[2],
          "ZYX"
        );
        const inertiaHelper = new Mesh(inertiaGeometry, inertiaMat);
        inertiaHelper.visible = false;
        inertiaHelper.position.set(x,y,z);
        inertiaHelper.scale.copy(getSizeByInertial(mass_value, ixx, iyy, izz))
        inertiaHelper.quaternion.setFromEuler(originEuler)
        Object.assign(inertiaHelper.userData, {
          isURDFHelper: true,
          helperType: "inertiaHelper",
        });
        urdfLink.add(inertiaHelper);
        inertiaMap.set(linkName, inertiaHelper);
      }
    }

		/* 解析<collision>
      <collision>
        <origin xyz="0.02 0 0" rpy="0 1.5707963267948966192313216916398 0"/>
        <geometry>
          <cylinder radius="0.01" length="0.02"/>
        </geometry>
      </collision>
  */
		function processCollision(collisionNode: Element, urdfLink: Group) {
      const linkName = urdfLink.name;
      const collisionHelper = new Group();
      collisionHelper.visible = false;
      processOriginAndGeometry(
        collisionNode,
        collisionMaterial,
        collisionHelper,
      );
      Object.assign(collisionHelper.userData, {
        isURDFHelper: true,
        helperType: "collisionHelper",
      });
      urdfLink.add(collisionHelper);
      collisionMap.set(linkName, collisionHelper);
    }

		/* 解析visual
      <visual name="head">
        <origin rpy="0 0 0" xyz="0 0 0"/>
        <geometry>
          <box size="0.001 0.001 0.001"/>
        </geometry>
        <material name="steel">
          <color rgba="0.7 0.65 0.55 1"/>
        </material>
      </visual>
  */
		function processVisual(visualNode: Element, urdfLink: Group) {
			let material = getMaterialFromNode(visualNode)
			const linkVisual = new LinkVisual()
			linkVisual.name = visualNode.getAttribute('name') || ''
			processOriginAndGeometry(visualNode, material, linkVisual)
			urdfLink.add(linkVisual)
		}

		/* 解析包含<origin>和<geometry>的元素，比如<visual>和<collision>*/
		function processOriginAndGeometry(
			node: Element,
			material: Material,
			parent: Group,
		) {
			const visualChildren = Array.from(node.children)
			visualChildren.forEach((childNode) => {
				const type = childNode.nodeName.toLowerCase()
				if (type === 'geometry') {
					processGeometry(childNode, material, parent)
				} else if (type === 'origin') {
					const { xyz, rpy } = processOrigin(childNode)
					parent.position.set(xyz[0], xyz[1], xyz[2])
					applyEulerZYX(parent, rpy)
				}
			})
		}

		/* 解析geometry 
      <geometry>
        <mesh filename="" scale="1e-3 1e-3 1e-3"/>
      </geometry>
      <geometry>
        <box size="0.001 0.001 0.001"/>
      </geometry>
      <geometry>
        <sphere radius="0.0065" />
      </geometry>
      <geometry>
        <cylinder length="0.13" radius="0.053"/>
      </geometry>
  */
		function processGeometry(
			geometryNode: Element,
			material: Material,
			parent: Group,
		) {
			const geometryChildNode = geometryNode.children[0]
      if(!geometryChildNode) {return}
			const geoType = geometryChildNode.nodeName.toLowerCase()
			switch (geoType) {
				case 'mesh':
					processMesh(geometryChildNode, material, parent)
					break
				case 'box':
					processBox(geometryChildNode, material, parent)
					break
				case 'sphere':
					processSphere(geometryChildNode, material, parent)
					break
				case 'cylinder':
					processCylinder(geometryChildNode, material, parent)
					break
			}
		}

		// 解析 <mesh filename="" scale="1e-3 1e-3 1e-3"/>
		function processMesh(meshNode: Element, material: Material, parent: Group) {
			const { meshParsers } = _this
			// 模型路径
			const filename = meshNode.getAttribute('filename')
			if (!filename) {
				return
			}
			let filePath = _this.resolveSubPath(filename)
			if (!filePath) {
				return
			}

			// 模型文件的格式
			const suffix = filePath.split('.').pop()?.toLowerCase()
			if (suffix && meshParsers[suffix]) {
				// 模型解析方法
				meshParsers[suffix](filePath, material).then((obj) => {
					if (!obj) {
						return
					}
					// 模型缩放
					const scaleAttr = meshNode.getAttribute('scale')
					if (scaleAttr) {
						const [x, y, z] = processTuple(scaleAttr)
						obj.scale.multiply(new Vector3(x, y, z))
					}
					// 将模型添加到visual图形
					parent.add(obj)
				})
			} else {
				console.warn(`无法解析以 ${suffix} 为后缀的模型.`)
			}
		}

		// 解析<box size="0.224 0.08 0.071"/>
		function processBox(boxNode: Element, material: Material, parent: Group) {
			const [x, y, z] = processTuple(boxNode.getAttribute('size'))
			const boxMesh = new Mesh(new BoxGeometry(x, y, z), material)
			parent.add(boxMesh)
		}

		// 解析<sphere radius="0.0065" />
		function processSphere(
			sphereNode: Element,
			material: Material,
			parent: Group,
		) {
			const radius = parseFloat(sphereNode.getAttribute('radius') || '0')
			const sphereMesh = new Mesh(new SphereGeometry(radius, 8, 6), material)
			parent.add(sphereMesh)
		}

		// 解析<cylinder length="0.13" radius="0.053"/>
		function processCylinder(
			cylinderNode: Element,
			material: Material,
			parent: Group,
		) {
			const radius = parseFloat(cylinderNode.getAttribute('radius') || '0')
			const length = parseFloat(cylinderNode.getAttribute('length') || '0')
			const cylinderMesh = new Mesh(
				new CylinderGeometry(radius, radius, length, 6),
				material,
			)
			cylinderMesh.rotation.set(Math.PI / 2, 0, 0)
			parent.add(cylinderMesh)
		}

		// 解析<origin rpy="0 0 0" xyz="0 0 -0.1077"/>
		function processOrigin(originNode: Element) {
			return {
				xyz: processTuple(originNode.getAttribute('xyz')) as NumberTuple3,
				rpy: processTuple(originNode.getAttribute('rpy')) as NumberTuple3,
			}
		}
		// 根据node数据创建材质
		function getMaterialFromNode(node: Element) {
			const children = Array.from(node.children)
			let material: Material 
			// 若node中存在<material>子标签，则使用<material>中的材质
			const materialNodes = children.filter(
				(n) => n.nodeName.toLowerCase() === 'material',
			)
      const materialNode = materialNodes[0]
			if (materialNode) {
				// 若materialMap中存在与materialNode相同name的材质，则使用materialMap中存在的材质，否则新建材质
				const tempMat = materialMap.get(materialNode.getAttribute('name') || '')
				if (tempMat) {
					material = tempMat
				} else {
					material = processMaterial(materialNode)
				}
			}else{
        material = _this.createCommonMaterial()
      }
			return material
		}
		return urdfRobot
	}
	/* 创建通用材质，可在外部按需重写  */
	createCommonMaterial() {
		return new MeshStandardMaterial({
			color: 0xcccccc,
			metalness: 1,
			roughness: 0.1,
		})
	}
	/*子路径解析方法，可在外部重写*/
	resolveSubPath(filename: string) {
    return filename
	}
}

export { URDFLoader }
