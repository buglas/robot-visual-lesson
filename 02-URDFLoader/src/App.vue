<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RobotVisual } from "./robot/RobotVisual";
import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { URDFLoader } from "./robot/URDFLoader";

/* canvas 画布的Ref对象 */
const canvasWrapperRef = ref<HTMLDivElement>();

/* 机器人可视化 */
const hdrURL = "/texture/venice_sunset_1k.hdr";
// const urdfURL = "./models/PR2/urdf/PR2.urdf";
const urdfURL = './models/h1_2_description/h1_2.urdf'
let robotVisual = new RobotVisual(hdrURL);
const urdfLoader= robotVisual.loadURDF(urdfURL);
/* urdfLoader.resolveSubPath=(subPath)=>{
  const path=subPath.replace('package://urdf_tutorial','/models/PR2');
  return path;
} */
// 重写h1 资源路径解析方法
urdfLoader.resolveSubPath=(filename: string)=>{
  return './models/h1_2_description/'+filename
}
robotVisual.continuousRender();

/* urdf请求测试 */
/* fetch('/public/models/test/01.urdf')
  .then(res=>{
    if (res.ok) {
      return res.text();
    } else {
      throw new Error(
        `URDFLoader: Failed to load url  with error code ${res.status} : ${res.statusText}.`
      );
    }
  })
  .then((data) => {
    const parser = new DOMParser();
    const urdf = parser.parseFromString(data, "application/xml");
    // 机器人
    const urdfRobot = new Group();
    // 获取urdf 中的cylinder
    const cylinderNode=urdf.getElementsByTagName('cylinder')[0]
    console.log('cylinderNode',cylinderNode);
    if(!cylinderNode){return}
    // 获取中的cylinder 中的属性
    const radius = parseFloat(cylinderNode.getAttribute("radius") || "0");
    const length = parseFloat(cylinderNode.getAttribute("length") || "0");
    // 将中的cylinder 可视化
    const cylinderMesh = new Mesh(
      new CylinderGeometry(radius, radius, length, 12),
      new MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 1,
        roughness: 0.1,
      })
    );
    // 设置圆柱的高度方向，urdf中，圆柱的高度方向是z向，在webgl 中，圆柱的高度方向是y向
    // 需要绕webgl的x轴逆时针旋转90°
    cylinderMesh.rotation.set(Math.PI / 2, 0, 0);
    urdfRobot.add(cylinderMesh);
    robotVisual.scene.add(urdfRobot);

    // 调整机器人坐标系，urdf中的z轴为高度方向，webgl中y轴为高度方向
    // 需要绕webgl的x轴顺时针旋转90°
    urdfRobot.rotation.set(-Math.PI / 2, 0, 0);
    // 将机器人的最底部对齐到地面
    const bb = new Box3();
    bb.setFromObject(urdfRobot);
    urdfRobot.position.y -= bb.min.y;
  })
  .catch((e) => {
    console.error("URDFLoader: Error loading file.", e);
  }); */

// URDFLoader测试
/* const urdfURL = "/models/PR2/urdf/PR2.urdf";
const urdfLoader=new URDFLoader();
urdfLoader.load(urdfURL,()=>{})
urdfLoader.resolveSubPath=(subPath)=>{
  const path=subPath.replace('package://urdf_tutorial','/models/PR2');
  return path;
} */


/* 自适应窗口尺寸 */
window.addEventListener("resize", onResize);
function onResize() {
  const canvasWrapper = canvasWrapperRef.value;
  canvasWrapper&&robotVisual.resize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
}

onMounted(() => {
  onResize();
  const canvasWrapper = canvasWrapperRef.value;
  canvasWrapper && canvasWrapper.append(robotVisual.renderer.domElement);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  robotVisual.dispose();
});
</script>

<template>
  <div id="robotVisual">
    <div id="cont">
      <div id="canvasWrapper" ref="canvasWrapperRef"></div>
    </div>
  </div>
</template>

<style scoped>
#robotVisual {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
#cont {
  display: flex;
  flex: 1;
  font-size: 14px;
  color: #303133;
  overflow: hidden;
}
#canvasWrapper {
  flex: 1;
  position: relative;
  height: 100%;
  overflow: hidden;
}
</style>