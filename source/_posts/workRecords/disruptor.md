---
title: Disruptor学习
date: 2024-12-31 20:00:00
tags:
  - java
  - 高性能
  - 并发
categories: disruptor
description: 高性能无锁队列 Disruptor 的原理与实操
---

参考链接: [高性能队列-Disruptor](https://tech.meituan.com/2016/11/18/disruptor.html)

# Disruptor是什么

Disruptor 是英国外汇交易公司 LMAX 开源的一款**高性能内存队列**，基于环形数组（RingBuffer）+ CAS + 内存屏障实现，单机 TPS 可以轻松达到**百万级/秒**。

它被广泛应用在 Log4j2 异步日志、Apache Storm、HBase、Canal 等开源项目中，是 JVM 进程内生产者-消费者场景的事实标准。

# 为什么要用Disruptor

## java内置队列

| 队列                  | 有界性             | 锁   | 数据结构   |
| :-------------------- | :----------------- | :--- | :--------- |
| ArrayBlockingQueue    | bounded            | 加锁 | arraylist  |
| LinkedBlockingQueue   | optionally-bounded | 加锁 | linkedlist |
| ConcurrentLinkedQueue | unbounded          | 无锁 | linkedlist |
| LinkedTransferQueue   | unbounded          | 无锁 | linkedlist |
| PriorityBlockingQueue | unbounded          | 加锁 | heap       |
| DelayQueue            | unbounded          | 加锁 | heap       |

队列的底层一般分为三种: 数组,链表,堆.其中堆一般情况下是为了实现带有优先级的队列,暂且不考虑.

我们就从数组和链表两种数据结构来看，基于数组线程安全的队列，比较典型的是ArrayBlockingQueue，它主要通过加锁的方式来保证线程安全；基于链表的线程安全队列分成LinkedBlockingQueue和ConcurrentLinkedQueue两大类，前者也通过锁的方式来实现线程安全，而后者以及上面表格中的LinkedTransferQueue都是通过原子变量compare and swap（以下简称"CAS"）这种不加锁的方式来实现的。

通过不加锁的方式实现的队列都是无界的（无法保证队列的长度在确定的范围内）；而加锁的方式，可以实现有界队列。在稳定性要求特别高的系统中，为了防止生产者速度过快，导致内存溢出，只能选择有界队列；同时，为了减少Java的垃圾回收对系统性能的影响，会尽量选择array/heap格式的数据结构。这样筛选下来，符合条件的队列就只有ArrayBlockingQueue。

## ArrayBlockingQueue 的痛点

ArrayBlockingQueue 虽然能满足"有界 + 数组"，但它存在三个明显的性能瓶颈：

1. **加锁带来的上下文切换**：`ReentrantLock` 在高并发下会引发线程阻塞和唤醒，系统调用开销大。
2. **伪共享（False Sharing）**：`head`、`tail`、`count` 三个高频更新的变量挤在同一 CPU Cache Line 里，任一线程写入都会让其它 CPU 核上该行缓存失效。
3. **GC 压力**：入队时如果每次都 `new` 对象，短命对象大量产生，会频繁触发 Young GC。

Disruptor 针对这三点都做了优化：**无锁 CAS + 缓存行填充 + 对象复用**。

# Disruptor 核心设计

## RingBuffer 环形数组

Disruptor 使用**固定大小的环形数组**承载事件，容量必须是 2 的幂次方（便于用位运算取模：`index & (size - 1)`）。

- 数组预先初始化好所有 slot，生产时只更新 slot 内的字段，而不是新建对象 → **零 GC**
- head/tail 通过序列号（sequence，long 型自增）表达，真实下标 = `sequence & mask`

## Sequence 与 SequenceBarrier

每个生产者/消费者都持有一个 `Sequence`（带缓存行填充的 long），表示自己处理到哪个位置。

- 生产者要发布到位置 N，需要确认所有消费者的 sequence 都已经 >= N - bufferSize（否则会覆盖未消费数据）
- 消费者要读取位置 N，需要通过 `SequenceBarrier` 等待生产者 sequence >= N

整个协调过程只用 CAS + volatile，没有锁。

## 等待策略 WaitStrategy

消费者还没有数据可消费时怎么办？Disruptor 提供多种策略：

| 策略                     | 行为                              | 适用场景                   |
| :----------------------- | :-------------------------------- | :------------------------- |
| BlockingWaitStrategy     | ReentrantLock + Condition 阻塞等待 | CPU 资源紧张（默认）       |
| SleepingWaitStrategy     | 自旋 + yield + LockSupport.parkNanos | 延迟不敏感、CPU 占用敏感 |
| YieldingWaitStrategy     | 自旋 + Thread.yield                | 低延迟，CPU 核心充足       |
| BusySpinWaitStrategy     | 纯自旋                             | 极致低延迟，专用核心        |

## 伪共享填充

`Sequence` 类内部大致长这样：

```java
class LhsPadding { long p1, p2, p3, p4, p5, p6, p7; }
class Value extends LhsPadding { volatile long value; }
class RhsPadding extends Value { long p9, p10, p11, p12, p13, p14, p15; }
public class Sequence extends RhsPadding { ... }
```

前后各 7 个 long（56 字节）把 `value` 隔离在独立的 64 字节 Cache Line 里，避免伪共享。

# Disruptor 实操

## 引入依赖

```xml
<dependency>
    <groupId>com.lmax</groupId>
    <artifactId>disruptor</artifactId>
    <version>3.4.4</version>
</dependency>
```

## 1. 定义事件对象

```java
public class OrderEvent {
    private long orderId;
    private String payload;

    public long getOrderId() { return orderId; }
    public void setOrderId(long orderId) { this.orderId = orderId; }
    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }
}
```

## 2. 事件工厂（用于预分配 RingBuffer 的 slot）

```java
public class OrderEventFactory implements EventFactory<OrderEvent> {
    @Override
    public OrderEvent newInstance() {
        return new OrderEvent();
    }
}
```

## 3. 消费者

```java
public class OrderEventHandler implements EventHandler<OrderEvent> {
    @Override
    public void onEvent(OrderEvent event, long sequence, boolean endOfBatch) {
        System.out.printf("consume orderId=%d payload=%s seq=%d%n",
                event.getOrderId(), event.getPayload(), sequence);
    }
}
```

## 4. 生产者

```java
public class OrderEventProducer {
    private final RingBuffer<OrderEvent> ringBuffer;

    public OrderEventProducer(RingBuffer<OrderEvent> ringBuffer) {
        this.ringBuffer = ringBuffer;
    }

    public void onData(long orderId, String payload) {
        long sequence = ringBuffer.next();           // 申请下一个可写入的 slot
        try {
            OrderEvent event = ringBuffer.get(sequence); // 复用对象
            event.setOrderId(orderId);
            event.setPayload(payload);
        } finally {
            ringBuffer.publish(sequence);            // 发布，消费者可见
        }
    }
}
```

## 5. 启动 Disruptor

```java
public class DisruptorDemo {
    public static void main(String[] args) throws InterruptedException {
        int bufferSize = 1024; // 必须是 2 的幂

        Disruptor<OrderEvent> disruptor = new Disruptor<>(
                new OrderEventFactory(),
                bufferSize,
                Executors.defaultThreadFactory(),
                ProducerType.SINGLE,          // 单生产者性能更优；多生产者用 MULTI
                new BlockingWaitStrategy()
        );

        disruptor.handleEventsWith(new OrderEventHandler());
        disruptor.start();

        RingBuffer<OrderEvent> ringBuffer = disruptor.getRingBuffer();
        OrderEventProducer producer = new OrderEventProducer(ringBuffer);

        for (long i = 0; i < 10; i++) {
            producer.onData(i, "order-" + i);
        }

        Thread.sleep(500);
        disruptor.shutdown();
    }
}
```

## 多消费者编排

Disruptor 支持类似 DAG 的消费拓扑：

```java
// 串行：A -> B
disruptor.handleEventsWith(handlerA).then(handlerB);

// 并行：A、B 同时消费
disruptor.handleEventsWith(handlerA, handlerB);

// 菱形：A -> (B, C) -> D
disruptor.handleEventsWith(handlerA)
         .then(handlerB, handlerC)
         .then(handlerD);
```

# 使用注意事项

1. **bufferSize 必须是 2 的幂**，否则启动直接抛异常。
2. **消费速度要跟得上生产速度**，否则生产者 `ringBuffer.next()` 会阻塞（环被写满）。
3. **EventHandler 里不要抛异常不处理**，否则会导致消费序列不推进；可以通过 `setDefaultExceptionHandler` 统一处理。
4. **多生产者场景使用 `ProducerType.MULTI`**，单生产者用 `SINGLE` 性能更好（少一次 CAS）。
5. **shutdown 要调用**，否则消费者线程不会退出。

# 典型应用场景

- **日志异步化**：Log4j2 AsyncLogger 内部就是 Disruptor
- **订单撮合 / 金融交易**：LMAX 本身就是外汇交易系统
- **Binlog / CDC**：Canal 的 EventStore 基于 RingBuffer
- **进程内事件总线**：替代 Guava EventBus 做高吞吐事件分发
