import { BufferAttribute, Camera, Color, Line, LineBasicMaterial, Quaternion,  Vector2,  Vector3 } from "three";
import { screenToWorld, worldToScreen } from "./utils";

const _quaternion = new Quaternion();

class JointDragHelper extends Line{
  material=new LineBasicMaterial({vertexColors:true})
  colorMap:[Color,Color]=[new Color(0xff0000),new Color(0xffff00)]
  // 强制渲染，取消视锥体检查
  frustumCulled=false
  
  // 应用拖拽路径
  applyPrismaticPath(point:Vector3,origin:Vector3,pivot:Vector3,lower:number,upper:number,value:number){
    const {colorMap:[cs,ce]}=this
    // 变换基点origin到point的向量
    const originToPoint = point.clone().sub(origin);
    // 从origin 向point 方向外扩一个比较小的值，避免辅助线与模型的重叠
    const outPoint=originToPoint.clone().normalize().multiplyScalar(0.02).add(point);
    // 顶点集合
    const positions :number[]=[]
    for(let limit of [lower,upper]){
      // 基于当前变换量的拖拽上下限
      const currentLimit = limit - value;
      // 基于outPoint取辅助线的两端
      const {x,y,z}=pivot.clone().multiplyScalar(currentLimit).add(outPoint)
      positions .push(x,y,z)
    }
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions ), 3)
    );
    // 顶点颜色集合
    this.geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array([
        cs.r, cs.g, cs.b,
        ce.r, ce.g, ce.b
      ] ), 3)
    );
  }
  // 应用旋转路径，以关节当前弧度为基准向两侧画圆弧，正负方向需要根据行列式计算
  applyRotatePath(point:Vector3, origin:Vector3, pivot:Vector3, lower:number, upper:number, value:number, camera:Camera, domElement:HTMLElement){
    const {colorMap:[cs,ce]}=this
    // 变换基点origin到point的向量
    const originToPoint = point.clone().sub(origin);
    // 基于当前变换量的拖拽上下限
    const curLower = lower - value;
    const curUpper = upper - value;
    // 路径圆滑度，即每多少弧度做一次分段
    const step = 1 / (Math.PI * 2);
    // 弧度集合
    const angles:number[] = [];
    for (let angle = curLower; angle <curUpper; angle += step) {
      angles.push(angle);
    }
    angles[angles.length-1]=curUpper
    
    // 设置v的长度，此长度决定旋转弧的半径
    // origin的屏幕坐标
    const originInScree=worldToScreen(origin,camera,domElement)
    // point 的屏幕坐标
    const pointInScree1=worldToScreen(point,camera,domElement)
    // origin 到point 的屏幕距离
    const distanceInScreen1=new Vector2().subVectors(pointInScree1,originInScree).length()
    // 绕轴旋转90°的四元数
    _quaternion.setFromAxisAngle(pivot, Math.PI/2);
    // point 绕轴旋转90°
    const point2=originToPoint.clone().applyQuaternion(_quaternion).add(origin)
    // point2 的屏幕坐标
    const pointInScree2=worldToScreen(point2,camera,domElement)
    // origin 到point2 的屏幕距离
    const distanceInScreen2=new Vector2().subVectors(pointInScree2,originInScree).length()
    // 2个屏幕距离之和
    const allDistanceInScreen=distanceInScreen1+distanceInScreen2
    // 用于监察的屏幕距离
    const checkDistanceInScreen=100
    if(allDistanceInScreen<checkDistanceInScreen){
      // 在allDistanceInScreen 和checkDistanceInScreen 间按比例取个值
      const currentDistanceInScreen=allDistanceInScreen+(checkDistanceInScreen-allDistanceInScreen)*0.2
      // 基于originInScree 偏移currentDistanceInScreen 
      const pointInScree3=new Vector3(originInScree.x+currentDistanceInScreen,originInScree.y,originInScree.z)
      // 在屏幕上偏移后的世界位
      const pointInWorld3=screenToWorld(pointInScree3,camera,domElement)
      // 上面的世界位到基点的距离就是旋转弧的半径
      const distance=pointInWorld3.sub(origin).length()
      originToPoint.setLength(distance)
    }else{
      // 放大旋转半径
      originToPoint.multiplyScalar(1.15)
    }
    
    // 根据弧度集合生成旋转路径的顶点集合，并做颜色映射
    const positions :number[]=[]
    const colors:number[] =[]
    const len=angles.length
    angles.forEach((angle,ind) => {
      _quaternion.setFromAxisAngle(pivot, angle);
      const { x, y, z } = originToPoint.clone().applyQuaternion(_quaternion).add(origin);
      positions.push(x, y, z);
      const inter=ind/len
      const {r,g,b}=cs.clone().lerpHSL(ce,inter*inter);
      colors.push(r,g,b)
    });
    
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3)
    );
    this.geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colors), 3)
    );
  }
}
export {JointDragHelper}