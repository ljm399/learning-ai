# 项目情况
app-ai应用前端部分，npm install后直接npm run dev启动
backServer-业务后端，npm install后node index.js启动
server-ai应用服务，npm install后node app.js启动
项目运行起来请参考下面步骤
# 替换apikey
从火山大模型（字节跳动家的）申请apikey。然后全局搜索，把我代码里apikey替换成你的

# 登录用户
用户固定写死在json里
有三个用户
``` json
[
  {
    "id": "001",
    "username": "user01",
    "password": "123456"
  },
  {
    "id": "002",
    "username": "user02",
    "password": "123456"
  },
  {
    "id": "003",
    "username": "user03",
    "password": "123456"
  }
]
```