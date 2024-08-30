---
title: 国密SM2前端加密，Java后台解密问题 
date: 2021-04-02 15:44:32
tags: 
  - 加密 
  - 解密
  - java
categories: 加解密
description: SM2加解密实际操作

---

 背景：要实现请求参数加密的功能，使用的是国密SM2算法，前端向后台发送请求获取公钥，将请求加密发送到后台，后台用对应的私钥进行解密

问题：前端进行加密的请求，后台无法进行解析

解决方案：（此处所用的类都为Hutool里的工具类）

- 当前的前端的SM2加密js库都是使用SM2公钥的q值转成16进制进行加密，所以在后台给前端发送公钥时，需要提取公钥的q值并且转成16进制

```java
        KeyPair pair = SecureUtil.generateKeyPair("SM2");
        PrivateKey aPrivate = pair.getPrivate();
        byte[] privateKey = aPrivate.getEncoded();//解密时需要用到
        PublicKey aPublic = pair.getPublic();
        byte[] publicKey = aPublic.getEncoded();//解密时需要用到
        
        //将q值提取出来并且转成16进制
        String q = HexUtil.encodeHexStr(((BCECPublicKey)aPublic).getQ().getEncoded(false));
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

此处q就为前端加密是所用的公钥

- 附加(2021/08/23):忘记把前端加密给整上来了(前端加密用的是sm-crypto的库,npm下载以后拉过来用)

```java
npm install --save sm-crypto
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

```java
const sm2 = require('sm-crypto').sm2;
const cipherMode = 1 // 1 - C1C3C2，0 - C1C2C3，默认为1
 
//公钥,也就是后台传到前端的q值
var publicKey = 'asdsadasdaddsad';

//params 参数  a就为传到后台加密后的参数 注意:传到后台的话 需要再加密后的字符串前面加上04 要不然解析不出来,或者后台解密之前加上04
var a=sm2.doEncrypt(JSON.stringify(params), publicKey, cipherMode)
 

 
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

​    

- 前端使用公钥将请求进行加密，后台进行解密

```java
                //privateKey 为上述生成的私钥 publicKey为生成的公钥，注意 此处不是Q值
                SM2 sm2 = SmUtil.sm2(privateKey, publicKey);
                //body为加密后的数据（注意：此处加密数据可能缺少04开头，解密会失败，需要手动在body前拼上04，body="04"+body）
                String requestBody = sm2.decryptStr(body, KeyType.PrivateKey);
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

到此 国密SM2前端加密，后台解密完成