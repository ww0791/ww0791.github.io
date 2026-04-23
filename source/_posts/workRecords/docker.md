---
title: docker问题处理
date: 2024-04-10 15:44:32
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

## 关于depends_on和healthcheck

### depends_on

depends_on 是 Docker-Compose 文件中的一个关键字，用于指定服务之间的依赖关系。
具体来说，它定义了一个服务所依赖的其他服务，只有在所依赖的服务已经启动并且处于运行状态时，该服务才会被启动。

问题来了，depends_on只是维护启动顺序，不代表是否启动完成，比如nacos持久化要依赖于mysql 如果mysql和nacos写在同一个docker-compose.yml文件中，会导致nacos启动报错，因为在nacos启动连接mysql的时候，mysql服务还没启动完成，导致连接不上。

这时就需要healthcheck来监控服务是否运行成功

### healthcheck

在docker-compose中加入healthcheck
healthcheck 支持下列选项：
test：健康检查命令，例如 [“CMD”, “curl”, “-f”, “http://localhost/actuator/health"]
interval：健康检查的间隔，默认为 30 秒，单位(h/m/s)；
timeout：健康检查命令运行超时时间，如果超过这个时间，本次健康检查就被视为失败，默认 30 秒,单位(h/m/s)；
retries：当连续失败指定次数后，则将容器状态视为 unhealthy，默认 3 次。
start-period：应用的启动的初始化时间，在启动过程中的健康检查失效不会计入，默认 0 秒； (从17.05)引入
说明：在此期间的探测失败将不计入最大重试次数。但是，如果健康检查在启动期间成功，则认为容器已启动，所有连续的失败都将计入最大重试次数。
和 CMD, ENTRYPOINT 一样，healthcheck 只可以出现一次，如果写了多个，只有最后一个生效。

在 healthcheck [选项] CMD 后面的命令，格式和 ENTRYPOINT 一样，分为 shell 格式，和 exec 格式。命令的返回值决定了该次健康检查的成功与否：

0：成功；
1：失败；
2：保留值，不要使用
容器启动之后，初始状态会为 starting (启动中)。Docker Engine会等待 interval 时间，开始执行健康检查命令，并周期性执行。
如果单次检查返回值非0或者运行需要比指定 timeout 时间还长，则本次检查被认为失败。
如果健康检查连续失败超过了 retries 重试次数，状态就会变为 unhealthy (不健康)。

一旦有一次健康检查成功，Docker会将容器置回 healthy (健康)状态

例：

```yaml
version: '1.0'
services:
  redis:
    image: redis:7
    container_name: redis
    command: redis-server --appendonly yes --requirepass '123456'
    restart: always
    volumes:
      - /Users/v_wuwei07/study_file/his/mydata/redis/data:/data
    ports:
      - 6379:6379
    networks:
      - nacos_net
  mysql:
    image: mysql:1
    platform: linux/amd64
    container_name: mysql
    build:
      context: ./mysql-dockerfile
      dockerfile: dockerfile
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --lower-case-table-names=1
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root
    ports:
      - 3306:3306
    volumes:
      - /Users/v_wuwei07/study_file/his/mydata/mysql/data:/var/lib/mysql
      - /Users/v_wuwei07/study_file/his/mydata/mysql/conf.d:/etc/mysql/conf.d
      - /Users/v_wuwei07/study_file/his/mydata/mysql/log:/var/log/mysql
      - /Users/v_wuwei07/study_file/his/mydata/mysql/init:/docker-entrypoint-initdb.d/
    networks:
      - nacos_net
    healthcheck:
      test: [ "CMD", "mysqladmin" ,"ping", "-h", "localhost" ]
      interval: 5s
      timeout: 10s
      retries: 10
  nacos1:
    image: nacos/nacos-server:v2.1.2-slim
    container_name: nacos1
    hostname: nacos1
    restart: always
    ports:
      - 8841:8848
      - 9841:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM=characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&useSSL=false&allowPublicKeyRetrieval=true
      - NACOS_AUTH_IDENTITY_KEY=nacos
      - NACOS_AUTH_IDENTITY_VALUE=nacos
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs1:/home/nacos/logs
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - nacos_net
  nacos2:
    image: nacos/nacos-server:v2.1.2-slim
    container_name: nacos2
    hostname: nacos2
    restart: always
    ports:
      - 8842:8848
      - 9842:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM=characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&useSSL=false&allowPublicKeyRetrieval=true
      - NACOS_AUTH_IDENTITY_KEY=nacos
      - NACOS_AUTH_IDENTITY_VALUE=nacos
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs2:/home/nacos/logs
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - nacos_net
  nacos3:
    image: nacos/nacos-server:v2.1.2-slim
    container_name: nacos3
    hostname: nacos3
    restart: always
    ports:
      - 8843:8848
      - 9843:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM=characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&useSSL=false&allowPublicKeyRetrieval=true
      - NACOS_AUTH_IDENTITY_KEY=nacos
      - NACOS_AUTH_IDENTITY_VALUE=nacos
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs3:/home/nacos/logs
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - nacos_net
# 网络配置
networks:
  nacos_net:
    driver: bridge

```

