---
title: Postman 生成鉴权
date: 2023-11-30 11:39:23
tags:
  - postman 
  - 加密
categories: postman
description: Postman生成鉴权信息
---



背景：项目中增加了鉴权，使用postman都要手动生成一次，这个鉴权有五分钟过期时间，所以手动生成鉴权这个方法很原始，在使用postman时需要实时生成

# 解决方法：

postman 使用的是nodejs，里面加解密的工具包使用的是crypto-js

在postman里面的pre-request script里面写脚本

```js
var time = Math.round(new Date().getTime()) // 获取时间戳
var ak = pm.environment.get("ak") // 获取环境变量
var sk = pm.environment.get("sk") // 获取环境变量

console.log("ak==="+ak)
console.log("sk=="+sk)
console.log("timestamp=="+time)

function genBasicToken(ak, sk, timestamp) {
   var sha256 = CryptoJS.SHA256(ak+sk+timestamp)
   var str = CryptoJS.enc.Utf8.parse(ak+"."+sha256+"."+time)
   var authorization = CryptoJS.enc.Base64.stringify(str);
   return authorization
}

// 更新到请求头部
pm.request.headers.add({
    key:"Authorization",
    value: genBasicToken(ak, sk, time)
});

```

# 注意事项：

​	如果postman设置了请求头或参数，pre-request script不会生效，比如在postman的header中设置了固定的Authorization 那么写js脚本不会生效
