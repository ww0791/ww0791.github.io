---
title: mybatis拦截器获取sql 
date: 2022-07-15 15:44:32
tags: mybatis
description: mybatis自定义拦截器获取sql并存入到数据库中
---





### 项目背景:

​    项目中,给群众用的互联网应用和内网的数据不是用的一个数据库,通过内外网的网闸进行数据的交互,一开始用的是在过滤器进行请求接口保存,再将保存的接口数据通过网闸发送到另一端进行相同的操作来达到数据一致性问题,但是每次都要预设id,需要修改逻辑代码,上一个项目整这个快整吐了,所以想着能不能拦截sql进行,将执行的sql传到另一个网络里面,直接跑sql.

### 附加:

​    项目不给用了,会出现有人恶意保存删表语句,导致项目崩溃的情况,我只能在springmvc的拦截器里面进行预设ID

### 参照链接:

​    搜一下百度,全是差不多的答案 我忘记我借鉴谁的了 直接百度:**mybatis拦截器打印sql**

### **功能描述:**

1. 保存sql(这里的sql是只保存我要操作的表的新增,修改,删除的sql)
2. 数据减项处理

###  获取sql的代码:

```java
@Component 
@Intercepts(
        {
                @Signature(
                        type = StatementHandler.class,//这里得statementHandler,百度上的update,insert这种的话 获取到的是不带id的 不完整
                        method = "prepare",
                        args = {
                                Connection.class,
                                Integer.class
                        }
                )
        }
)
@Slf4j
public class SyncDataInterceptor implements Interceptor {

    private Map tableMap;
    private Set propertySet;

    //这个是标识项目是内网还是外网,内网环境的话 保存执行的sql得进行减项然后传到外网进行执行,为了数据安全嘛(admin:内网,internet:外网)
    @Value("${sync}")
    private String sync;

    @PostConstruct
    public void init() {
        tableMap = new HashMap<String, Set<String>>();
        propertySet = new HashSet<String>();
        //注意:此sql的处理用的是Oracle数据库,如果使用其他数据库,在getString方法中 对日期的处理需要进行调整
        //bean类的字段名:必须大写 后面会和sql进行比较,进行数据减项存储,不要问我为什么这个字段是这个样子的,项目要求,我也快吐了
        propertySet.add("ZJHM");
        propertySet.add("JJLXRXM");
        //表名
        tableMap.put("tableName", propertySet);
        propertySet.clear();
        //模板
        /*
            propertySet.add("PROPERTYNAME");
            tableMap.put("tableName", propertySet);
            propertySet.clear();
        */
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        if (invocation.getTarget() instanceof StatementHandler) {

            saveSql(invocation);
        }
        return invocation.proceed();
    }

    private void saveSql(Invocation invocation) throws ClassNotFoundException, NoSuchFieldException {
        StatementHandler statementHandler = (StatementHandler) invocation.getTarget();
        MetaObject metaObject = MetaObject.forObject(statementHandler, SystemMetaObject.DEFAULT_OBJECT_FACTORY, SystemMetaObject.DEFAULT_OBJECT_WRAPPER_FACTORY, new DefaultReflectorFactory());
        MappedStatement mappedStatement = (MappedStatement) metaObject.getValue("delegate.mappedStatement");
        //包含动态生成的sql语句和对应的参数信息
        BoundSql boundSql = statementHandler.getBoundSql();
        //获取Configuration:mybatis所有的配置信息都在这里面
        Configuration configuration = mappedStatement.getConfiguration();
        String sql = boundSql.getSql();
        if (isSync(mappedStatement, sql)) {
            String s = showSql(configuration, boundSql, sql);// 获取到最终的sql语
            log.info(s);
        }

    }

    private boolean isSync(MappedStatement mappedStatement, String sql) throws ClassNotFoundException {
        if (!mappedStatement.getSqlCommandType().equals(SqlCommandType.SELECT) && isContainTable(sql)) {
            return true;
        }
        return false;
    }

    private boolean isContainTable(String sql) {
        Iterator iterator = tableMap.keySet().iterator();
        while (iterator.hasNext()) {
            if (sql.toUpperCase().contains(iterator.next().toString().toUpperCase())) {
                return true;
            }
        }
        return false;
    }


    public Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }


    private String getParameterValue(Object obj, String sql, String propertyName) {

        //判断是互联网还是公安网
        if (sync.equals("admin")) {
            Iterator iterator = tableMap.entrySet().iterator();
            while (iterator.hasNext()) {
                Map.Entry<String, Set<String>> next = (Map.Entry<String, Set<String>>) iterator.next();
                if (next.getValue().contains(propertyName.toUpperCase().replace("ET.", ""))) {
                    return "''";
                }
            }
        }
        return getString(obj);
    }

    private String getString(Object obj) {
        String value = "''";
        if (obj instanceof String) {
            value = "'" + obj.toString() + "'";
        } else if (obj instanceof Date) {
            DateFormat formatter = DateFormat.getDateTimeInstance(DateFormat.DEFAULT, DateFormat.DEFAULT, Locale.CHINA);
            value = "to_date('" + formatter.format(new Date()) + "','YYYY-MM-DD HH24:Mi:SS')";
        } else {
            if (obj != null) {
                value = obj.toString();
            } else {
                value = "''";
            }

        }
        return value;
    }

    public String showSql(Configuration configuration, BoundSql boundSql, String sql) {
        Object parameterObject = boundSql.getParameterObject();  // 获取参数

        List<ParameterMapping> parameterMappings = boundSql
                .getParameterMappings();
        sql=sql.replaceAll("[\\s]+"," ");
        if (CollectionUtils.isNotEmpty(parameterMappings) && parameterObject != null) {
            TypeHandlerRegistry typeHandlerRegistry = configuration.getTypeHandlerRegistry(); // 获取类型处理器注册器，类型处理器的功能是进行java类型和数据库类型的转换<br>　　　　　　　// 如果根据parameterObject.getClass(）可以找到对应的类型，则替换
            if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
                sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(parameterObject, sql, "")));
            } else {
                MetaObject metaObject = configuration.newMetaObject(parameterObject);// MetaObject主要是封装了originalObject对象，提供了get和set的方法用于获取和设置originalObject的属性值,主要支持对JavaBean、Collection、Map三种类型对象的操作
                for (ParameterMapping parameterMapping : parameterMappings) {
                    String propertyName = parameterMapping.getProperty();
                    if (metaObject.hasGetter(propertyName)) {
                        Object obj = metaObject.getValue(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(obj, sql, propertyName)));
                    } else if (boundSql.hasAdditionalParameter(propertyName)) {
                        Object obj = boundSql.getAdditionalParameter(propertyName);  // 该分支是动态sql
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(obj, sql, propertyName)));
                    } else {
                        sql = sql.replaceFirst("\\?", "缺失");
                    }//打印出缺失，提醒该参数缺失并防止错位
                }
            }
        }
        return sql;
    }
}
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

### 问题:

​    mybatis初始化比spring要早,在mybatis拦截器中,获取不到spring容器中的bean类,如果在mysql拦截器中使用把spring管理的容器,需要再spring初始化时初始化拦截器

参考链接:[mybatis自定义插件获取spring容器bean为空 - 简书 (jianshu.com)](https://www.jianshu.com/p/9c7dd2a5873c)

在这个项目中,我不需要在加载拦截器时就注入bean,所以我可以用工具类来获取spring管理的bean类

**BeanUtil:**

```java
@Component
public class BeanUtil implements ApplicationContextAware {

    private static ApplicationContext applicationContext =null;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        if (BeanUtil.applicationContext == null){
            BeanUtil.applicationContext = applicationContext;
        }
    }

    public static ApplicationContext getApplicationContext(){
        return applicationContext;
    }

    public static Object getBean(String name){
        return getApplicationContext().getBean(name);
    }

    public static <T> T getBean(Class<T> clazz){
        return getApplicationContext().getBean(clazz);
    }

    public static <T> T getBean(String name,Class<T> clazz){
        return getApplicationContext().getBean(name,clazz);
    }
}
```

