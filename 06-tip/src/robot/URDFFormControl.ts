import { computed, ref } from "vue";
import { Object3D } from 'three';
import { type JointType, URDFRobot } from './URDFClasses';

// Joint 集合的类型
type JointMapType={
  // 集合名称
  name:string
  // 过滤条件
  filter:string
  // 关节元素集合
  eles:{
    // 关节名称
    name:string
    // 关节类型
    type:JointType
    // 关节当前值
    value:number 
    // 关节下限
    lower:number 
    // 关节上限
    upper:number 
  }[]
}

// 辅助对象集合的类型
type HelperMapType={
  // 集合名称
  name:string
  // 集合的可见性
  visible:boolean
  // 过滤条件
  filter:string
  // 辅助元素集合
  eles:{
    // 元素名称
    name:string
    // 元素的可见性
    visible:boolean 
  }[]
}

// 所有的集合类型
type AllMapsType={
  jointMap:JointMapType
  jointAxisMap:HelperMapType
  collisionMap:HelperMapType
  massMap:HelperMapType
  inertiaMap:HelperMapType
}

// 所有的集合类型的key 类型
export type HelperKeyType= keyof AllMapsType

// 解析辅助元素
function parseHelperEle(ele:Map<string, Object3D>){
  return Array.from(ele.values()).map((item) => ({
    name: item.parent?.name||'',
    visible: false
  }));
}

// URDF Form 控制类
class URDFFormControl{
  // 控制目标
  robot: URDFRobot|undefined
  // 所有集合
  AllMaps=ref<AllMapsType>({
    jointMap: {
      name: 'joint',
      filter: '',
      eles:[]
    },
    jointAxisMap: {
      name: 'joint axis',
      visible: false,
      filter: '',
      eles: []
    },
    collisionMap: {
      name: 'collision',
      visible: false,
      filter: '',
      eles: []
    },
    massMap: {
      name: 'mass',
      visible: false,
      filter: '',
      eles: []
    },
    inertiaMap:{
      name:'inertia',
      visible:false,
      filter:'',
      eles:[]
    }
  })
  // 当前集合的key
  currentMapKey=ref<HelperKeyType>('jointMap')
  //当前集合的eles，会根据filter 过滤
  currentMapEles=computed(() => {
    const {AllMaps, currentMapKey} = this;
    let helperData=AllMaps.value[currentMapKey.value] as JointMapType;
    let {filter,eles} = helperData;
    if (filter) {
      filter = filter.toLowerCase();
      eles = eles.filter(ele => {
        return ele.name.toLowerCase().indexOf(filter) > -1;
      });
    }
    return eles
  })
  
  constructor(robot?:URDFRobot){
    robot&&this.setRobot(robot)
  }
  // 设置robot
  setRobot(robot:URDFRobot){
    this.robot = robot;
    this.init();
  }
  // 初始化所有集合的内容
  init(robot=this.robot) {
    if(!robot){return}
    const {AllMaps:{value:AllMaps}}=this
    const {userData}  = robot;
    for(let joint of userData.jointMap.values()){
      const {name, userData:{type,value, limit} } = joint;
      if(type=='fixed'){
        continue
      }
      AllMaps.jointMap.eles.push({
        name,
        type,
        value,
        lower: Number(limit.lower.toFixed(4)),
        upper: Number(limit.upper.toFixed(4))
      })
    }
    AllMaps.jointAxisMap.eles = parseHelperEle(userData.jointAxisMap);
    AllMaps.collisionMap.eles = parseHelperEle(userData.collisionMap);
    AllMaps.massMap.eles = parseHelperEle(userData.massMap);
    AllMaps.inertiaMap.eles = parseHelperEle(userData.inertiaMap);
  }
  // 设置某一类helper 的可见性
  setHelpersVisible(bool: boolean){
    const {robot}=this
    if(!robot){return}
    const {currentMapKey,currentMapEles}=this
    for (let obj of robot.userData[currentMapKey.value].values()) {
      obj.visible = bool;
    }
    for(let ele of currentMapEles.value){
      if('visible' in ele){
        ele.visible=bool
      }
    }
  }
  // 设置某一个helper 的可见性
  setHelperVisible(bool: boolean,name:string){
    const {robot}=this
    if(!robot){return}
    const {currentMapKey,AllMaps}=this
    if(!bool){
      const helper=AllMaps.value[currentMapKey.value];
      ('visible' in helper)&&(helper.visible=false)
    }
    const currentHelperEle=robot.userData[currentMapKey.value].get(name);
    (currentHelperEle)&&(currentHelperEle.visible=bool)
  }
  // 设置关节的value
  setJointValue(value:number,name:string){
    for(let ele of this.currentMapEles.value){
      if(ele.name==name){
        ele.value=value
        break
      }
    }
  }
}
export { URDFFormControl };