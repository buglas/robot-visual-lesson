<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RobotVisual } from "./robot/RobotVisual";

/* canvas 画布的Ref对象 */
const canvasWrapperRef = ref<HTMLDivElement>();

/* 机器人可视化 */
const hdrURL = "/texture/venice_sunset_1k.hdr";
let robotVisual = new RobotVisual(hdrURL);
robotVisual.continuousRender();

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