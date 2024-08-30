---
title: 记一次内存溢出情况
date: 2024-06-23 12:44:32
tags: 
  - jvm
  - java
categories: jvm
description: 接口请求过多，导致内存溢出
---





# 记一次请求过多，导致接口内存溢出的情况

背景：服务本来运行的好好的，忽然一直在重启并且报警了，最近也没有上线，进行排查

# 如何排查内存泄漏导致的内存溢出问题

1. 项目启动时，增加启动参数

   1. ```shell
      // 发生oom时，进行堆的dump
      -XX:+HeapDumpOnOutOfMemoryErro
      // dump文件存储位置
      -XX:HeapDumpPath=/Users/wuwei/study_file/head_dump
      ```

      

2. 获取服务进程状况

   1. ```shell
      jps -l
      ```

   获取服务进程id

3. 查看已使用空间站总空间的百分比

   1. jstat -gcutil 进程id 刷新频率

      1. ```shell
         // 查看进程id为1111的空间占用比 每1000毫秒查一次
         jstat -gcutil 11111 1000
         ```

4. 通过jmap获取对象占用内存

   1. jmap -histo:live 进程id 

      1. 内存泄漏的时候，会出现占用内存巨大的存货对象类型

      2. ```shell
         jmap -histo:live 11111
         ```

5. 如果通过第四步还是无法获取到具体的占用内存的对象类型，需要将dump出来的信息放到工具中查看例如MAT

# 排查结果

最近大模型做意图识别，需要获取平台上面插件数据，但是他们的代码和流水线配置有问题，跑不起来也杀不掉，一直在启动新实例，导致同一时间有最少七八个服务同时请求数据，并且我的服务上没有限制jvm内存大小导致内存超了就被杀了，跟着重启了

# 解决方案

1. 联系网关的人 让网关做IP流量限制
2. 设置jvm最大内存
3. 可以自己将请求记录放到redis里 1s内多少个请求，就限制，但是域名是走了网关，所以让网关做了

# 补充 

jstack命令能查看堆栈日志，可以查看是否发生死锁

```
jstack -l 进程id
```

​	


