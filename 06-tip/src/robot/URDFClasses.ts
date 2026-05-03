import { Group, Object3D, Quaternion, Vector3 } from 'three'

const _tempAxis = new Vector3()

/* <robot> URDF机器人类，图形树的根节点 */
export class URDFRobot extends Group {
	userData: {
		isURDFRobot: true
		linkMap: Map<string, URDFLink>
		jointMap: Map<string, URDFJoint>
		jointAxisMap: Map<string, Object3D>
		massMap: Map<string, Object3D>
		inertiaMap: Map<string, Object3D>
		collisionMap: Map<string, Object3D>
		[k: string]: any
	} = {
		// 是否是URDFRobot 对象
		isURDFRobot: true,
		// link 图形集合
		linkMap: new Map(),
		// joint 图形集合
		jointMap: new Map(),
		// 辅助对象-关节坐标系集合
		jointAxisMap: new Map(),
		// 辅助对象-质心集合
		massMap: new Map(),
		// 辅助对象-惯性集合
		inertiaMap: new Map(),
		// 辅助对象-碰撞体集合
		collisionMap: new Map(),
	}
	// 设置关节的旋转值或推拉值
	setJointValue(name: string, n: number) {
		const joint = this.userData.jointMap?.get(name)
		if (joint) {
			joint.setValue(n)
		} else {
			console.warn(`Joint ${name} not found in robot ${this.name}`)
		}
	}

	/* 深拷贝 */
	copy(source: URDFRobot) {
		super.copy(source)

		// 深拷贝Map
		const { userData } = this
		const mapKeys = [
			'linkMap',
			'jointMap',
			'jointAxisMap',
			'massMap',
			'inertiaMap',
			'collisionMap',
		]
		for (let k of mapKeys) {
			userData[k] = new Map()
		}
		this.traverse((child: Object3D) => {
			if (child.userData.isURDFLink) {
				userData.linkMap.set(child.name, child as URDFLink)
			} else if (child.userData.isURDFJoint) {
				userData.jointMap.set(child.name, child as URDFJoint)
			} else if (child.userData.isURDFHelper) {
				const name = child.parent?.name || ''
				switch (child.userData.helperType) {
					case 'jointAxisHelper':
						userData.jointAxisMap.set(name, child)
						break
					case 'massHelper':
						userData.massMap.set(name, child)
						break
					case 'inertiaHelper':
						userData.inertiaMap.set(name, child)
						break
					case 'collisionHelper':
						userData.collisionMap.set(name, child)
						break
				}
			}
		})
		return this
	}
}

/* <link >*/
export class URDFLink extends Group {
	userData: {
		isURDFLink: true
		[k: string]: any
	} = {
		isURDFLink: true,
	}
}
/* <link>中的<visual> */
export class LinkVisual extends Group {
	userData: {
		isLinkVisual: true
		[k: string]: any
	} = {
		isLinkVisual: true,
	}
}
/* 
关节类型
fixed：固定关节，不可旋转或移动
continuous：连续关节，可无限旋转  
revolute：旋转关节，可在一定范围内旋转
prismatic：推拉关节，可在一定范围内移动
planar：平面关节，可在平面内移动
floating：浮动关节，可在三维空间内自由移动和旋转
*/
export type JointType =
	| 'fixed'
	| 'continuous'
	| 'revolute'
	| 'planar'
	| 'prismatic'
	| 'floating'
interface URDFJointDataType {
	isURDFJoint: true
	// 关节类型，对应<joint type="..."> 中的type属性
	type: JointType
	// 旋转轴，对应<joint>中的<axis>
	axis: Vector3
	// 当前关节的变换值
	value: number
	// 关节限值，对应<joint>中的<limit>
	limit: { lower: number; upper: number }
	// 是否忽略关节限值
	ignoreLimits: Boolean
	// mimic关节集合，其中的关节会模仿当前关节的运动
	mimicJoints: URDFMimicJoint[]
	// 初始位置，对应<joint>中<origin rpy="0 0 0" xyz="0 0 0.0325"> 的xyz属性
	origPosition: Vector3
	// 初始旋转量，对应<joint>中<origin rpy="0 0 0" xyz="0 0 0.0325"> 的rpy属性
	origQuaternion: Quaternion
	[k: string]: any
}
/* <joint> */
export class URDFJoint extends Group {
	userData: URDFJointDataType = {
		isURDFJoint: true,
		type: 'fixed',
		axis: new Vector3(1, 0, 0),
		value: 0,
		limit: { lower: 0, upper: 0 },
		ignoreLimits: false,
		mimicJoints: [],
		origPosition: this.position.clone(),
		origQuaternion: this.quaternion.clone(),
	}
	/* 设置关节的旋转值或推拉值 */
	setValue(n: number) {
		const {
			mimicJoints,
			type,
			value,
			ignoreLimits,
			limit: { lower, upper },
			axis,
			origPosition,
			origQuaternion,
		} = this.userData
		// 更新模仿此关节的mimic关节
		mimicJoints.forEach((joint) => {
			joint.updateFromMimickedJoint(n)
		})
		// 只考虑revolute,continuous,prismatic 类型的关节
		if (
			n == null ||
			n === value ||
			!['revolute', 'continuous', 'prismatic'].includes(type)
		) {
			return
		}
		// 限值对continuous关节无效，只对revolute 和prismatic 关节生效
		if (type != 'continuous' && !ignoreLimits) {
			n = Math.max(lower, Math.min(upper, n))
		}
		// 存储旋转值
		this.userData.value = n
		if (type == 'prismatic') {
			// 关节初始位置
			this.position.copy(origPosition)
			// 推拉方向
			_tempAxis.copy(axis).applyQuaternion(this.quaternion)
			// 从origPosition，沿_tempAxis方向移动n 距离
			this.position.addScaledVector(_tempAxis, n)
		} else {
			// 在初始四元数的基础上，绕axis旋转
			this.quaternion.setFromAxisAngle(axis, n).premultiply(origQuaternion)
		}
	}

	/* 深拷贝 */
	copy(source: URDFRobot) {
		super.copy(source)
		this.userData.axis = source.userData.axis.clone()
		this.userData.origPosition = source.userData.origPosition.clone()
		this.userData.origQuaternion = source.userData.origQuaternion.clone()
		return this
	}
}
/* mimic joint */
export class URDFMimicJoint extends URDFJoint {
	// joint,multiplier,offset 对应<mimic joint="..." multiplier="..." offset="..."> 中的属性
	userData: URDFJointDataType & {
		joint?: string
		multiplier: number
		offset: number
	} = {
		isURDFJoint: true,
		type: 'fixed',
		axis: new Vector3(1, 0, 0),
		value: 0,
		limit: { lower: 0, upper: 0 },
		ignoreLimits: false,
		mimicJoints: [],
		origPosition: this.position.clone(),
		origQuaternion: this.quaternion.clone(),
		offset: 0,
		multiplier: 0,
	}
	/* 根据被模仿关节更新mimic关节 */
	updateFromMimickedJoint(x: number) {
		const { multiplier, offset } = this.userData
		this.setValue(x * multiplier + offset)
	}
}
