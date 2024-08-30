---
title: 复用request和response 
date: 2021-11-30 12:39:23
tags:
  - java 
  - spring
categories: spring
description: 获取request里面的数据并且保存

---

 **项目中需要在filter处理一些post请求的数据和response的响应数据,比如数据解密,重复提交验证**



**在项目中,涉及到了内外网,且内外网不是通过端口映射来同步数据而是多加了一层网闸,考虑到用户体验问题,进行了一个请求保存,通过网闸将本次请求传到内网再请求一次,达到内外网数据一致(涉及了ID预设问题)**


 **request和response的流只能获取一次,如果在filter中获取了以后,controller会报错(类似于Miss body),而response会没有响应值**



## 解决方法:

### request请求处理:

需要定义一个继承HttpServletRequestWrapper类的RequestWrapper

```java
public class RequestWrapper extends HttpServletRequestWrapper {
    private byte[] body;

    public RequestWrapper(HttpServletRequest request) throws IOException {
        super(request);
        body = this.toByteArray(request.getInputStream());
    }

    private byte[] toByteArray(ServletInputStream inputStream) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        byte[] buffer=new byte[1024*4];
        int n=0;
        while((n= inputStream.read(buffer))!=-1){
            out.write(buffer,0,n);
        }
        return out.toByteArray();
    }

    @Override
    public BufferedReader getReader() throws IOException {
        return new BufferedReader(new InputStreamReader(getInputStream()));
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
        final ByteArrayInputStream bais=new ByteArrayInputStream(body);
        return new ServletInputStream() {
            @Override
            public boolean isFinished() {
                return false;
            }

            @Override
            public boolean isReady() {
                return false;
            }

            @Override
            public void setReadListener(ReadListener readListener) {

            }

            @Override
            public int read() throws IOException {
                return bais.read();
            }
        };
    }

    public byte[] getBody() {
        return body;
    }

    public void setBody(byte[] data){
        body=data;
    }
}
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

### Response处理:

需要定义一个继承HttpServletRequestWrapper类的RequestWrapper

```java
public class ResponseWrapper extends HttpServletResponseWrapper {
    private ByteArrayOutputStream byteArrayOutputStream;
    private ServletOutputStream servletOutputStream;
    private PrintWriter writer;



    public ResponseWrapper(HttpServletResponse response) {
        super(response);
        byteArrayOutputStream=new ByteArrayOutputStream();
        servletOutputStream=new WapperedOutputStream(byteArrayOutputStream);
        writer = new PrintWriter(new OutputStreamWriter(byteArrayOutputStream,StandardCharsets.UTF_8));
    }

    @Override
    public ServletOutputStream getOutputStream(){
        return servletOutputStream;
    }

    @Override
    public PrintWriter getWriter() {
        return writer;
    }

    @Override
    public void flushBuffer(){
        if (servletOutputStream!=null){
            try {
                servletOutputStream.flush();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        if (writer!=null)
            writer.flush();
    }

    @Override
    public void reset() {
        byteArrayOutputStream.reset();
    }

    public String getResponseData(String charset) throws IOException {
        flushBuffer();
        byte[] bytes = byteArrayOutputStream.toByteArray();
        return new String(bytes,charset);
    }

    private class WapperedOutputStream extends ServletOutputStream{

        private ByteArrayOutputStream bos;

        public WapperedOutputStream(ByteArrayOutputStream stream){
            bos = stream;
        }

        @Override
        public boolean isReady() {
            return false;
        }

        @Override
        public void setWriteListener(WriteListener writeListener) {

        }

        @Override
        public void write(int b){
            bos.write(b);
        }
    }

    public byte[] getContent(){
        flushBuffer();
        return byteArrayOutputStream.toByteArray();
    }
}
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

在过滤器中将ServletRequest替换成RequestWrapper

在过滤器中将ServletResponse替换成ResponseWrapper

```java
public class RequestWrapperFilter implements Filter {

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain) throws IOException, ServletException {
        RequestWrapper requestWrapper = new RequestWrapper((HttpServletRequest) servletRequest);
        ResponseWrapper responseWrapper = new ResponseWrapper((HttpServletResponse) servletResponse);
        //获取post的值
        String body = IOUtils.toString(requestWrapper.getBody(), "UTF-8");
        //中间处理操作省略,生成newBody
        String newBody= .......//省略代码
        //修改body以后,想将修改body的值传入到RequestWrapper,如果没有修改,则可以无视,我这里要预设id
        requestWrapper.setBody(newBody);

        
        filterChain.doFilter(requestWrapper,responseWrapper);
        byte[] content = responseWrapper.getContent();
        //获取response的值
        String responseData = IOUtils.toString(content, "UTF-8");
        
        //注意 此处是servletResponse 不是responseWrapper,写responseWrapper的话 依旧响应不了
        ServletOutputStream outputStream = servletResponse.getOutputStream();
        outputStream.write(content);
        outputStream.flush();
        outputStream.close();
    }
}
```

![点击并拖拽以移动](data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==)

同理,若后续需要用到post数据的话,类似于aop保存日志之类的,也是需要用RequestWrapper对request进行包装,然后从requesWrapper中获取数据

```java
 RequestWrapper requestWrapper = new RequestWrapper((HttpServletRequest) servletRequest);
 String body = IOUtils.toString(requestWrapper.getBody(), "UTF-8");
```

