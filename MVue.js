// 入口函数
class MVue {
    constructor(options) {
        // 保存需要用到的属性
        this.$el = options.el
        this.$data = options.data
        this.$options = options
        if (this.$el) {
            // 数据劫持类
            new Observer(this.$data)
            // 指令解析类
            new Compile(this.$el, this)
            // 将$data数据对象中所有属性代理到实例上（即this），传入要代理的数据对象
            this.proxydata(this.$data)
        }
    }
    // 代理函数
    proxydata(data){
        // 遍历该对象上的所有属性作为实例数据
        Object.keys(data).forEach(key => {
            Object.defineProperty(this,key,{
                get(){
                    // 获取实例中的属性返回代理对象相对应的属性值
                    return data[key]
                },
                set(val){
                    // 设置属性同理
                    data[key] = val
                }
            })
        })
    }
}
// compileUtil对象：存储处理不同表达式的方法，（插值表达式 v-text v-html v-model...）
const compileUtil = {
    // 取值函数（通过绑定的表达式获取到对应值）
    getVal(expr, vm) {
        return expr.split('.').reduce((data, currentVal) => {
            return data[currentVal]
        }, vm.$data)
    },
    // 作为双向数据绑定时input事件触发的回调
    setVal(expr, vm,inputVal){
        expr.split('.').reduce((data, currentVal) => {
            // 如果是对象嵌套 返回该对象给reduce函数 
            if(typeof data[currentVal] === 'object'){
                return data[currentVal]
            }else{
                // 非对象嵌套直接赋值
                data[currentVal] = inputVal
            }
             
        }, vm.$data)
    },
    getContentVal(expr,vm){
        return  expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            return this.getVal(args[1], vm);
        })
    },
    // 处理文本节点（类似这样的 {{person.name}} 插值表达式 ）和 v-text
    text(node, expr, vm) {
        let value;
        if (expr.indexOf('{{') !== -1) {
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
                // args 参数中的第二项是匹配到的子集，作为expr传入this.getVal函数 
                // console.log(args)
                
                // 创建视图中的数据依赖
                new Watcher(vm,args[1],newVal=>{
                    // this.getContentVal(expr,vm)是为了防止{{person.name}}--{{person.age}}被新值直接覆盖
                    // 如果这里是this.updater.textUpdater(node, newVal) 这个newVal将直接通过node.textContent = newVal渲染到页面，{{person.name}}--{{person.age}}这个结构就会有bug  
                    this.updater.textUpdater(node, this.getContentVal(expr,vm))
                })
                return this.getVal(args[1], vm);
            })
        } else {
            new Watcher(vm,expr,newVal=>{
                this.updater.textUpdater(node, newVal)
            })
            value = this.getVal(expr, vm)
        }
        // 把获取的值追加到节点中
        this.updater.textUpdater(node, value)
    },
    // 处理v-html
    html(node, expr, vm) {
        // 和上面处理差不多
        new Watcher(vm,expr,newVal=>{
            this.updater.htmlUpdater(node, newVal)
        })
        const value = this.getVal(expr, vm)
        this.updater.htmlUpdater(node, value)
    },
    // 处理双向数据v-model
    model(node, expr, vm) {
        const value = this.getVal(expr, vm)

        new Watcher(vm,expr,newVal=>{
            this.updater.modelUpdater(node, newVal)
        })
        // 当触发input事件时，用户修改值（value）将用来更新v-model绑定的表达式对应的值（v-model='meg'）
        node.addEventListener('input',e =>{
            this.setVal(expr,vm,e.target.value)
        })

        this.updater.modelUpdater(node, value)
    },

    on(node, expr, vm, eventName) {
        let fn = vm.$options.methods && vm.$options.methods[expr]
        node.addEventListener(eventName,fn.bind(vm),false)
    },
    // 指令或文本节点更新函数
    updater: {
        textUpdater(node, value) {
            node.textContent = value
        },
        htmlUpdater(node, value) {
            node.innerHTML = value
        },
        modelUpdater(node, value) {
            node.value = value
        }
    }
}

class Compile {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el)
        this.vm = vm
        // 1.创建一个文档碎片对象，将页面元素追加进去
        const fragment = this.nodeFragment(this.el)
        // 2.编译模板
        this.compile(fragment)
        // 3.将模板插入页面中渲染
        this.el.appendChild(fragment)
    }
    // 解析遍历fragment 每一个节点
    compile(fragment) {
        const childNodes = fragment.childNodes
        // 将元素节点与文本节点分开处理
        Array.from(childNodes).forEach(child => {
            if (this.isElementNode(child)) {
                // 主要处理元素节点中的指令
                this.compileElement(child)
            } else {
                // 主要处理文本节点中的 {{ }}
                this.compileText(child)
            }
            // 继续遍历嵌套节点
            if (child.childNodes && child.childNodes.length) {
                this.compile(child)
            }
        });
    }
    // 编译元素节点
    compileElement(node) {
        const attributes = node.attributes
        // 获取元素节点中的属性
        Array.from(attributes).forEach(attr => {
            // 遍历所有属性筛选v-指令
            const { name, value } = attr
            if (this.isDirectives(name)) {
                // 解构指令筛选指令类型text html model...
                const [, directive] = name.split('-')
                // 解构指令筛选指令类型v-bind： v-on： @...
                const [dirName, eventName] = directive.split(':')
                //处理不同指令的元素
                compileUtil[dirName](node, value, this.vm, eventName)
                // 渲染前移除v-指令
                node.removeAttribute('v-' + directive)
            }else if(this.isEventName(name)){
                // 处理事件绑定指令
                let [,eventName] = name.split('@')
                compileUtil['on'](node, value, this.vm, eventName)
                node.removeAttribute('@' + eventName )
            }
        })
    }
    // 处理这样的 {{}} 文本节点
    compileText(node) {
        const content = node.textContent
        if (/\{\{(.+?)\}\}/.test(content)) {
            compileUtil['text'](node, content, this.vm)
        }
    }
    isElementNode(node) {
        return node.nodeType === 1
    }
    isEventName(attrName){
        return attrName.startsWith('@')
    }
    isDirectives(attrName) {
        return attrName.startsWith('v-')
    }
    nodeFragment(node) {
        // 创建文档碎片对象，存储源节点 
        const f = document.createDocumentFragment()
        let firstChild;
        // 添加进文档碎片中的节点，在页面中会被移除
        while (firstChild = node.firstChild) {
            f.appendChild(firstChild)
        }
        return f
    }
}


















/*
<h2>{{ person.name }} -- {{ person.age }}</h2>
<h3>{{ person.fav }}</h3>
<ul>
    <li>1</li>
    <li>2</li>
    <li>3</li>
</ul>
<h3>{{ msg }}</h3>
<div v-text="msg"></div>
<div v-html="htmlstr"></div>
<input type="text" v-modle="msg"></input>
*/