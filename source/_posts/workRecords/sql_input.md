---
title: sqlMap校验sql注入
date: 2024-10-23 12:44:32
tags: 
  - mysql
  - sql
categories: sql
description: 某次代码提交 安全组件扫描出sql注入
---

# 处理方式

代码提交后 扫描到了代码有sql注入问题 安全扫描最近新加的sql注入扫描 按照历史写法 其他地方应该也有sql注入问题

下载sqlMap,进入sqlMap执行下面方法

python sqlmap.py -u "http://10.27.245.34:8080/api/v2/permission/member?name=1&team_id=133"

其中后面的http地址为接口地址



# 问题总结:

刚接手Golang项目 看历史代码逻辑是直接拼接sql 以为gorm不支持动态sql 就没管
