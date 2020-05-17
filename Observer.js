// 作为依赖也作为订阅者，同时回调告诉视图更新
class Watcher{
    constructor(vm,expr,cb) {
        this.vm = vm 
        this.expr = expr      
        this.cb = cb
        this.oldVal = this.getOldVal()
    }
    getOldVal(){
        Dep.target = this // 获取值之前关联依赖容器
        // 保存初始值作为更新前的旧值
        const oldVal = compileUtil.getVal(this.expr, this.vm)
        // 获取值时触发getter，收集该依赖
        Dep.target = null
        return oldVal
    }
    upDate(){
        const newVal = compileUtil.getVal(this.expr, this.vm)
        this.cb(newVal)
    }
}

//收集依赖的容器，同时也是触发视图更新的‘中间商’（通知Watcher更新视图）
class Dep{
    constructor(){
        this.subs = []
    }
    // 添加依赖
    addSub(watcher){
        this.subs.push(watcher)
    }
    // 通知watcher更新视图
    notify(){
        this.subs.forEach(w => w.upDate())
    }
}

/*
    依赖收集运用了发布订阅模式，目的是解耦视图层与数据层，可以更灵活
    其次收集依赖可以追踪页面渲染时用到的数据，未作为依赖收集的数据不具有响应性（减少未使用的数据更新时带来的性能消耗）
*/

class Observer{
    constructor(data){
        this.observe(data)
    }
    // 定义监听函数
    observe(data){
        if(data && typeof data === 'object'){
            // 监听data数据所有属性
            Object.keys(data).forEach(key => {
                this.defineReactive(data,key,data[key])
            })
        }
    }
    defineReactive(obj,key,value){
        this.observe(value)
        const dep = new Dep()
        Object.defineProperty(obj,key,{
            enumerable:true,
            configurable:false,
            get(){
                // 获取数据渲染到页面时收集依赖
                Dep.target && dep.addSub(Dep.target)
                return value
            },
            set:(newVal)=>{
                // 设置数据时监听新数据（如果设置的值是对象就需要监听）
                this.observe(newVal)
                if(newVal !== value){
                    value = newVal
                    // 更新数据时通知依赖更新视图
                    dep.notify()
                }
            }
        })
    }
}