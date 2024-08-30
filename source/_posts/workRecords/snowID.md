---
title: 雪花算法生成重复的问题
date: 2021-06-21 12:44:32
tags: 
  - 雪花算法
  - java
categories: 雪花算法
description: 雪花算法生成重复与时间回拨问题
---

项目中因为涉及内外网的数据同步问题,需要将本次请求进行保存,保存时需要将id进行预处理

此处用了hutool包下面的雪花算法生成工具

问题分析:

在做压力测试时,会出现主键冲突的情况,在过滤器里面手动生成的雪花算法做预处理,发现是workId和datacenterId都是从配置文件里面获取的,项目部署的是集群,怀疑是此处有问题.所以讲workId和datacenterId改为获取IP去除点对32位求余

之前的代码:



```java
@Configuration
public class SnowflakConfig {
    @Value("${syncWorkerId}")
    private Long workerId;

    @Value("${syncDatacenterId}")
    private Long datacenterId;

    @Bean
    public Snowflake snowflake(){
        return IdUtil.getSnowflake(workerId,datacenterId);
    }
}
```

改后的代码




```java
@Component
public class ServerConfig implements ApplicationListener<WebServerInitializedEvent> {
    private int serverPort;
    public String getUrl() {
        InetAddress address = null;
        try {
            address = InetAddress.getLocalHost();
        } catch (UnknownHostException e) {
            e.printStackTrace();
        }
        return "http://"+address.getHostAddress() +":"+this.serverPort;
    }

    public String getIp(){
        InetAddress address = null;
        try {
            address = InetAddress.getLocalHost();
        } catch (UnknownHostException e) {
            e.printStackTrace();
        }
        return address.getHostAddress();
    }

    public int getport(){
        return this.serverPort;
    }

    public Long getLongIp(){
        InetAddress address = null;
        try {
            address = InetAddress.getLocalHost();
        } catch (UnknownHostException e) {
            e.printStackTrace();
        }
        return Long.valueOf(address.getHostAddress().replace(".",""));
    }
    @Override
    public void onApplicationEvent(WebServerInitializedEvent event) {
        this.serverPort = event.getWebServer().getPort();
    }
}

```



```java
@Configuration
public class SnowflakConfig {

    @Resource
    private ServerConfig serverConfig;    

    @Bean
    public Snowflake snowflake(){
        return IdUtil.getSnowflake(serverConfig.getLongIp()%32,serverConfig.getLongIp()%32);
    }

}
```

修改好以后继续进行压力测试,发现还是偶尔会有主键冲突的情况,排查后发现服务器使用了chrony做了时间同步,时间同步以后的时候 可能会导致当前时间比上一次生成id的时间要早,等到了恰当的时间点会生成一样的id出来导致主键冲突

解决方案:

1.在服务器中将chrony时间同步做定时任务处理,在用户使用率少的时间进行时间同步

crontab -e -u root
#每天的两点启动时间同步
0 2 * * * systemctl start chronyd.service  > /dev/null 2>&1
#每天的四点停止时间同步 
0 4 * * * systemctl start chronyd.service  > /dev/null 2>&1 
2.自写雪花算法

[使用雪花算法为分布式下全局ID、订单号等简单解决方案考虑到时钟回拨_ycb1689的专栏-CSDN博客_雪花算法时钟回拨解决](https://blog.csdn.net/ycb1689/article/details/89331634)



