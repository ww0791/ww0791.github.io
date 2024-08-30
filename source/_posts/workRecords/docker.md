---
title: docker问题处理
date: 2024-08-30 15:44:32
tags:
  - docker 
  - Mac
categories: docker
description: docker日常问题解决方案
---

# mac安装mysql

## 命令行：

```shell
docker pull --platform=linux/amd64
```

## dockerfile：

```dockerfile
FROM --platform=linux/amd64 mysql:5.7
```

## docker-compose:

```yaml
version: '1.0'
services:
  mysql:
    image: mysql:5.7
    platform: linux/amd64
    container_name: mysql
```

