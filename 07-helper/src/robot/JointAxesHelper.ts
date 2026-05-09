import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from "three";

// 关节坐标系辅助对象
class JointAxesHelper extends LineSegments {
	constructor( size = 1,material= new LineBasicMaterial( { vertexColors: true, toneMapped: false } ) ) {
    // 顶点
		const vertices = [
			0, 0, 0,	size, 0, 0, // x 轴
			0, 0, 0,	0, size, 0, // y 轴
			0, 0, 0,	0, 0, size  // z 轴
		];
    // 顶点颜色
		const colors = [
			1, 0, 0,	1, 0.6, 0,  // x 轴渐变色
			0, 1, 0,	0.6, 1, 0,  // y 轴渐变色
			0, 0, 1,	0, 0.6, 1   // z 轴渐变色
		];

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
		geometry.setAttribute( 'color', new Float32BufferAttribute( colors, 3 ) );

    // 调用父级构造函数
		super( geometry, material );
	}

  // 清理缓存
	dispose() {
		this.geometry.dispose();
		('dispose' in this.material)&&this.material.dispose();
	}
}

export { JointAxesHelper };