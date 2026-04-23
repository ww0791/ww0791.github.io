---
title: 关于JDK中NIO在Linux系统下的epoll空轮询问题
date: 2024-10-11 19:44:32
tags:
  - linux
  - jdk
  - netty
categories: netty
description: netty学习总结
---

# 什么是epoll

引用参考: [linux epoll 机制](https://sleticalboy.github.io/linux/2021/01/22/linux-epoll-mechanism/)

epoll：是一种 I/O 时间通信机制，是 Linux 内核实现 IO 多路复用的一种方式。

IO 多路复用：在一个操作里同时监听多个输入输出源，在其中一个或多个输入输出源可用的时候 返回，然后对其进行读写操作。

输入输出源：可以是文件（file）、网络（socket）、进程间的管道（pipe），因在 Linux 中 “一切皆文件”，所以都是用文件描述符（fd）来表示

可读事件：当 fd 关联的内核缓冲区非空有数据可读时，则触发可读事件； 可写事件：当 fd 关联的内核缓冲区不满有空闲空间可写时，则触发可写事件；

通知机制：当事件发生时，主动通知； 轮询机制：循环检查是否有事件发生，是通知机制的反面；

再来解读 epoll 机制：当 fd 关联的内核缓冲区非空时，发出可读信号；当缓冲区不满时，发出 可写信号。



# 产生空轮询代码位置

```java
public class NIOServer {
    public static void main(String[] args) throws IOException {
        Selector serverSelector = Selector.open();
        Selector clientSelector = Selector.open();
        new Thread(() -> {
            try {
 
                ServerSocketChannel listenerChannel = ServerSocketChannel.open();
                listenerChannel.socket().bind(new InetSocketAddress(8000));
                listenerChannel.configureBlocking(false);
                listenerChannel.register(serverSelector, SelectionKey.OP_ACCEPT);
                while (true) {
                    if (serverSelector.select(1) > 0) {// jdk bug 导致此处会放开 但是没有事件过来 导致一直重复跑空轮询
                        Set<SelectionKey> set = serverSelector.selectedKeys();
                        Iterator<SelectionKey> keyIterator = set.iterator();
                        while (keyIterator.hasNext()) {
                            SelectionKey key = keyIterator.next();
                            if (key.isAcceptable()) {
                                try {

                                    SocketChannel clientChannel = ((ServerSocketChannel) key.channel()).accept();
                                    clientChannel.configureBlocking(false);
                                    clientChannel.register(clientSelector, SelectionKey.OP_READ);
                                } finally {
                                    keyIterator.remove();
                                }
                            }
                        }
                    }
                }
            } catch (IOException ignored) {
            }
        }).start();
        new Thread(() -> {
            try {
                while (true) {

                    if (clientSelector.select(1) > 0) {
                        Set<SelectionKey> set = clientSelector.selectedKeys();
                        Iterator<SelectionKey> keyIterator = set.iterator();
                        while (keyIterator.hasNext()) {
                            SelectionKey key = keyIterator.next();
                            if (key.isReadable()) {
                                try {
                                    SocketChannel clientChannel = (SocketChannel) key.channel();
                                    ByteBuffer byteBuffer = ByteBuffer.allocate(1024);
                                    clientChannel.read(byteBuffer);
                                    byteBuffer.flip();
                                    System.out.println(Charset.defaultCharset().newDecoder().decode(byteBuffer)
                                            .toString());
                                } finally {
                                    keyIterator.remove();
                                    key.interestOps(SelectionKey.OP_READ);
                                }
                            }
                        }
                    }
                }
            } catch (IOException ignored) {
            }
        }).start();
    }
}
```

# Netty解决方式

netty底层也是调用selector.select()方法设置了超时时间,并且统计了轮询次数,如果超时了,则重制轮询次数,如果轮询次数大于512次则将此selector关闭,将里面的key重新注册到一个新的selector中
