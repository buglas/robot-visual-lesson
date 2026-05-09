<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RobotVisual } from "./robot/RobotVisual";
import { type HelperKeyType, URDFFormControl } from "./robot/URDFFormControl";
import { URDFRobot } from "./robot/URDFClasses";
import { Search } from "@element-plus/icons-vue";

/* canvas 画布的Ref对象 */
const canvasWrapperRef = ref<HTMLDivElement>();

/* 机器人可视化 */
const hdrURL = "/texture/venice_sunset_1k.hdr";
// const urdfURL = "./models/PR2/urdf/PR2.urdf";
const urdfURL = './models/h1_2_description/h1_2.urdf'
let robotVisual = new RobotVisual(hdrURL);
const {tipStyle, tipMsg, urdfDragControls } = robotVisual;

// 辅助控制
const formControl = new URDFFormControl();
const { AllMaps, currentMapKey, currentMapEles } = formControl;

// 机器人
let robot: URDFRobot;
// 加载URDF模型
const urdfLoader= robotVisual.loadURDF(urdfURL,(model:URDFRobot)=>{
  robot = model;
  formControl.setRobot(model)
});

// 重写PR2 资源路径解析方法
/* urdfLoader.resolveSubPath=(filename: string)=>{
  return filename.replace(
    "package://urdf_tutorial", 
    './models/PR2'
  );
} */
urdfLoader.resolveSubPath=(filename: string)=>{
  return './models/h1_2_description/'+filename
}

const radToDeg=(rad:number)=>{
  return (180*rad/Math.PI).toFixed(2)+' °'
}
const sliderFormatTooltip=(rad:number,type:string)=>{
  return type=='revolute'?radToDeg(rad):null
}

// 连续渲染
robotVisual.continuousRender();

/* 拖拽变换关节对象时，更新关节dom 的值 */
urdfDragControls.addEventListener("changeValue", ({joint, value}) => {
  formControl.setJointValue(value,joint.name)
});

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
    <el-menu
      :default-active="currentMapKey"
      class="el-menu-demo"
      mode="horizontal"
      :ellipsis="false"
      @select="(k: HelperKeyType)=>{currentMapKey=k}"
    >
      <el-menu-item
        v-for="(ele, index) in AllMaps"
        :key="index"
        :index="index"
      >
        {{ ele.name }}
      </el-menu-item>
    </el-menu>

    <div id="cont">
      <div id="controlPlane" ref="controlPlaneRef">
        <div id="elesFilter">
          <el-input
            v-model="AllMaps[currentMapKey].filter"
            placeholder="Please input"
            :prefix-icon="Search"
          >
          </el-input>
        </div>
        <div id="mapEles">
          <div v-if="currentMapKey!='jointMap'" class="map-ele">
            <el-checkbox
              v-model="AllMaps[currentMapKey].visible"
              @change="(bool:boolean)=>{formControl.setHelpersVisible(bool)}"
            />
            all
          </div>
          <div
            class="map-ele"
            v-for="item in currentMapEles"
            :key="item.name"
          >
            <div  v-if="currentMapKey=='jointMap'" class="joint-ele-row">
              <div class="joint-name">{{ item.name }}</div>
              <div class="joint-value">
                <el-slider 
                  v-if="item.type=='revolute'||item.type=='prismatic'"
                  v-model="item.value" 
                  show-input 
                  size="small" 
                  :min="item.lower"
                  :max="item.upper"
                  :step="0.0001"
                  @input="robot&&robot.setJointValue(item.name,item.value)"
                  :format-tooltip	="(val:number)=>sliderFormatTooltip(val,item.type)"
                />
                <el-input-number 
                  v-else 
                  v-model="item.value" 
                  :precision="4"
                  size="small"
                  style="width:100%"
                  @input="robot&&robot.setJointValue(item.name,item.value)"
                >
                  <template #suffix>
                    <span>{{ radToDeg(item.value)}}</span>
                  </template>
                </el-input-number>
              </div>
            </div>
            <div v-else class="map-ele-row">
              <el-checkbox   
                v-model="(item as any).visible" 
                @change="(bool:boolean)=>{formControl.setHelperVisible(bool,item.name)}" 
              />
              {{ item.name }}
            </div>
            
          </div>
        </div>
      </div>
      <div id="canvasWrapper" ref="canvasWrapperRef">
        <div id="robotTip" :style="tipStyle">
          <p>joint name：{{ tipMsg.jointName }}</p>
          <p>joint value：{{ tipMsg.jointValue }}</p>
          <p>link name：{{ tipMsg.linkName }}</p>
        </div>
      </div>
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
#controlPlane {
  width: 300px;
  height: 100%;
  overflow: hidden;
}
#elesFilter {
  padding: 12px 18px 6px 12px;
}
#mapEles {
  box-sizing: border-box;
  height: calc(100vh - 109px);
  padding: 9px 0 15px 0;
  overflow-y: scroll;
}
.map-ele {
  padding: 3px 12px;
}
.joint-ele-row {
  padding-bottom: 12px;
}
.joint-name{
  padding-bottom: 6px;
}
.map-ele-row {
  display: flex;
  align-items: center;
  height: 32px;
}
.map-ele-row .el-checkbox {
  margin-right: 6px !important;
}
.map-ele-row label {
  margin-right: 6px !important;
}

#robotTip {
  position: absolute;
  background-color: rgba(0, 0, 0, 0.65);
  color: #fff;
  padding: 6px 9px;
  transform: translate(18px, -100%);
  border-radius: 2px;
  box-shadow: rgba(0, 0, 0, 0.4) 0 3px 3px;
}
#robotTip p {
  margin: 0;
  font-size: 13px;
  line-height: 24px;
}
#canvasWrapper {
  flex: 1;
  position: relative;
  height: 100%;
}
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: #ddd;
}
</style>
<style>
.el-slider {
  --el-slider-button-size: 15px!important;
  --el-slider-height: 4px!important;
  --el-slider-button-wrapper-offset: -16px!important;
}
.el-slider__runway.show-input {
  margin-right: 15px!important;
}
.el-slider__input {
  width: 108px!important;
}
</style>