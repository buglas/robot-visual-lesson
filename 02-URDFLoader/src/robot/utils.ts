import {
	Camera,
	Euler,
	Matrix4,
	Mesh,
	Object3D,
	Quaternion,
	Vector2,
	Vector3,
} from 'three'
import { URDFJoint, URDFLink } from './URDFClasses'

const tempQuaternion = new Quaternion()
const tempEuler = new Euler()

const PI2 = Math.PI * 2
const halfPI = Math.PI / 2;

// 铅的密度 kg/m3
const densityOfLead = 11340

// "x y z" 转[x,y,z]
function processTuple(val: string | null) {
	if (!val) return [0, 0, 0]
	// trim() 去掉字符串两端的空白
	// split() 按照特点规律将字符串分割为数组
	// \s：匹配任何空白字符，包括空格、制表符、换页符等
	// +：表示前面的字符（在这个情况下是 \s）可以出现1次或多次
	// g：全局匹配标志,对整个字符串进行匹配,而不是在找到第1个匹配后就停止
	return val
		.trim()
		.split(/\s+/g)
		.map((num) => parseFloat(num))
}

/* 根据标签名称，对标签内的元素进行分类 */
function classifyNodeByName<key>(node: Element, names: key[]) {
	const nodeMap: Map<key, Element[]> = new Map()
	for (let name of names) {
		nodeMap.set(name, [])
	}
	for (let child of Array.from(node.children)) {
		const key = child.nodeName.toLowerCase() as key
		if (names.includes(key)) {
			nodeMap.get(key)?.push(child)
		}
	}
	return nodeMap
}

/* 根据urdf的欧拉值旋转THREE.js 图形
THREE.js
   Y
   |
   |
   .-----X
 ／
Z
rpy=zyx

ROS URDf
       Z
       |   X
       | ／
 Y-----.
 rpy=xyz
*/
function applyEulerZYX(obj: Object3D, rpy: [number, number, number]) {
	tempEuler.set(rpy[0], rpy[1], rpy[2], 'ZYX')
	tempQuaternion.setFromEuler(tempEuler)
	tempQuaternion.multiply(obj.quaternion)
	obj.quaternion.copy(tempQuaternion)
}

// 根据子元素，向上层寻找可变换的URDFJoint
function findNearestJoint(child: Object3D): URDFJoint | undefined {
	return findParent(
		child,
		({ userData: { isURDFJoint, type } }) => isURDFJoint && type != 'fixed',
	) as URDFJoint
}

// 根据子元素，向上层寻找URDFLink
function findNearestLink(child: Object3D): URDFLink | undefined {
	return findParent(
		child,
		({ userData: { isURDFLink } }) => isURDFLink,
	) as URDFLink
}

// 需找符合特定条件的父级
function findParent(child: Object3D, fn: (obj: Object3D) => boolean) {
	let obj: Object3D | null = child
	while (obj) {
		if (fn(obj)) {
			return obj
		}
		obj = obj.parent
	}
}

//寻找Mesh模型
const findMesh = (obj: Object3D, fn: (obj: Object3D) => void) => {
	if (obj.userData.isURDFHelper || !obj.visible) {
		return
	}
	if (obj instanceof Mesh) {
		fn(obj)
	}
	obj.children.forEach((child) => {
		findMesh(child, fn)
	})
}

// 将世界坐标系中的点转换到屏幕空间
function worldToScreen(
	point: Vector3,
	camera: Camera,
	domElement: HTMLElement,
) {
	// 克隆点以避免修改原始点
	const vec = new Vector3().copy(point)

	// 视图投影矩阵
	const viewProjectionMatrix = new Matrix4()
	viewProjectionMatrix.multiplyMatrices(
		camera.projectionMatrix,
		camera.matrixWorldInverse,
	)

	// 应用视图投影矩阵，转换到裁剪空间（NDC）
	vec.applyMatrix4(viewProjectionMatrix)

	// 转换到屏幕坐标
	vec.x = ((vec.x + 1) * domElement.clientWidth) / 2
	vec.y = ((-vec.y + 1) * domElement.clientHeight) / 2

	return vec
}
// 将屏幕坐标转换到世界坐标系
function screenToWorld(
	point: { x: number; y: number; z?: number },
	camera: Camera,
	domElement: HTMLElement,
) {
	// DNC坐标
	const ndc2 = screenToNDC(point, domElement)
	const ndc3 = new Vector3(ndc2.x, ndc2.y, point.z)

	// 视图投影矩阵
	const viewProjectionMatrix = new Matrix4()
	viewProjectionMatrix.multiplyMatrices(
		camera.projectionMatrix,
		camera.matrixWorldInverse,
	)

	// 应用视图投影矩阵，转换到裁剪空间
	return ndc3.applyMatrix4(viewProjectionMatrix.invert())
}
// 将屏幕坐标转换到裁剪空间
function screenToNDC(
	{ x, y }: { x: number; y: number },
	{ clientWidth, clientHeight }: HTMLElement,
) {
	return new Vector2((x / clientWidth) * 2 - 1, -((y / clientHeight) * 2 - 1))
}

export {
	PI2,
  halfPI,
	densityOfLead,
	processTuple,
	classifyNodeByName,
	applyEulerZYX,
	findNearestJoint,
	findNearestLink,
	findParent,
	findMesh,
	worldToScreen,
	screenToWorld,
	screenToNDC,
}
