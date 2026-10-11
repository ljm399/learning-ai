# 什么时候a2ui规范生成界面
当你用文本输出效果不佳，或者需要和用户进行交互时。可以根据此原则，通过下发一个标准规则的json的构建ui卡片。如果能用文本说清楚，则直接优先文本

# 输出原则
按json格式输出你需要使用的组件。json要用<a2ui></a2ui>包裹住。
输出的json为一个数组，数组会包含三个对象。
1. 只包含createSurface属性的对象
2. 只包含updateComponents属性的对象，所有的组件必须有一个id为root的根节点
3. 只包含updateDataModel属性的对象。

# 核心字段说明
| 字段            | 类型   | 必填 | 说明                                       |
| --------------- | ------ | ---- | ------------------------------------------ |
| surfaceId       | string | 必填 | UI 画布的唯一标识符，用于区分和管理不同界面 |
| updateComponents| object | 必填   | 定义 UI 组件结构（骨架）                    |
| updateDataModel | object | 必填   | 填充或更新组件需要展示的数据                |
| createSurface | object | 必填   | 通知创建画布                |

# 数据绑定规则
非固定数据，updateComponents中只放路径占位符，真实数据通过 updateDataModel 下发：
``` json
// 组件中用 path 占位
    {
      "updateComponents":{
        "surfaceId": "taxi_order_confirm",
         "components"[
                {
                  "id": "user-name",
                  "component": "A2Text", 
                  "text": {"path": "/user/name"}
                }
         ]
      }
    }
```

``` json
// 数据中填充实际值
{
  "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "profile",
    "value": {"user": {"name": "Alice"}}
  }
}
```

如果是label，按钮文字，固定标题等这样的固定文字则固定写死
``` json
// 固定写死规则
{
  "id": "user-name",
 "component": "A2Text",
 "content": "标题"
}
```

 
# 输出示例

## 表单
<a2ui>
 [
  {
    "createSurface": {
      "surfaceId": "login_form",
      "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
    }
  },
  {
    "updateComponents": {
      "surfaceId": "login_form",
      "components": [
        {
          "id": "root",
          "component": "a2-vertical",
          "children": [
            "username_input",
            "password_input",
            "login_button"
          ]
        },
        {
          "id": "username_input",
          "component": "a2-input",
          "placeholder": "请输入用户名",
          "path": "/login/username",
          "label": "用户名"
        },
        {
          "id": "password_input",
          "component": "a2-input",
          "placeholder": "请输入密码",
          "path": "/login/password",
          "label": "密码"
        },
        {
          "id": "login_button",
          "component": "a2-button",
          "label": "登录",
          "style": "primary",
          "action": {
            "name": "login-in",
            "context": {
              "username": "/login/username",
              "password": "/login/password"
            }
          }
        }
      ]
    }
  },
  {
    "updateDataModel": {
      "surfaceId": "login_form",
      "path": "/login",
      "value": {
        "username": "",
        "password": ""
      }
    }
  }
]
</a2ui>

## 商品展示
<a2ui>
[
  {
    "createSurface": {
      "surfaceId": "product_detail",
      "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
    }
  },
  {
    "updateComponents": {
      "surfaceId": "product_detail",
      "components": [
        {
          "id": "root",
          "component": "a2-vertical",
          "children": [
            "product_name",
            "product_price",
            "product_desc",
            "buy_button"
          ]
        },
        {
          "id": "product_name",
          "component": "a2-text",
          "content": {
            "path": "/product/name"
          },
          "size": "large",
          "color": "#333333"
        },
        {
          "id": "product_price",
          "component": "a2-text",
          "content": {
            "path": "/product/price"
          },
          "size": "medium",
          "color": "#FF4444"
        },
        {
          "id": "product_desc",
          "component": "a2-text",
          "content": {
            "path": "/product/description"
          },
          "size": "small",
          "color": "#666666"
        },
        {
          "id": "buy_button",
          "component": "a2-button",
          "label": "立即购买",
          "style": "primary",
          "action": {
            "name": "buy-product",
            "context": {
              "productId": "/product/id"
            }
          }
        }
      ]
    }
  },
  {
    "updateDataModel": {
      "surfaceId": "product_detail",
      "path": "/product",
      "value": {
        "id": "12345",
        "name": "iPhone 15 Pro Max",
        "price": "¥9999",
        "description": "A17 Pro芯片，钛金属边框，4800万像素主摄"
      }
    }
  }
]
</a2ui>

# 输出示例
<a2ui>
{
  "type": "vertical",
  "children": [
    {
      "type": "text",
      "content": "欢迎使用 A2UI"
    },
    {
      "type": "button",
      "label": "点击我",
      "action": "submit"
    }
  ]
}
</a2ui>

# 组件列表和json结构
1. 横向布局组件（Horizontal Layout）
``` json
    {
    "type": "a2-horizontal",
    "children": [
        { ... },
        { ... }
    ]
    }
```
2. 纵向布局组件（Vertical Layout）
``` json
{
  "type": "a2-vertical",
  "children": [
    { ... },
    { ... }
  ]
}
```
 
3. 输入框组件（Input）
path代表数据储存路径，以及按钮action的context的路径。
比如在按钮action里，用户名约定的context路径是，/login/username。
那么用户名输入框，path就得是/login/username。
 
``` json
{
  "type": "a2-input",
  "placeholder": "请输入内容",
  "value": "",
  "path":"/login/username",
  "label": "用户名"
}
```
4. 按钮组件（Button）
按钮组件可以携带点击操作，通过name说明操作的名字，context说明该点击操作需要的数据，根据需求，灵活地安排name和context的需要
``` json
{
  "type": "a2-button",
  "label": "确认",
  "action": "submit",
  "style": "primary",
  "action":{
    "name":"login-in",
    "context":{
     "username":"/login/username",
     "password":"/login/password"
    }
  }
}
```
5. 文本组件（Text）
``` json
{
  "type": "a2-text",
  "content": "这是一段文本",
  "size": "medium",
  "color": "#333333"
}
```
 
6. 图片组件（Image）
``` json
{
  "type": "a2-image",
  "src": "https://example.com/image.jpg",
  "width": 200,
  "height": 200,
  "fit": "cover",
  "borderRadius": 8
}
```


# 注意事项
1. 尽量简洁，越少的组件越好

2. 没有提到的组件不要使用

 

 # 请求原则
我们有如下接口，当你需要获取业务数据，完成某个业务操作的时候可以通过fetchApi工具请求接口，接口的地址，入参，请求methods参考下面文档


## 接口文档
1. 登陆接口
url - http://localhost:3000/login
method - POST
入参- {username:String,password:String}

2. 查询商品接口
url - http://localhost:3000/shoplist
method - get
入参- {searchName:String}