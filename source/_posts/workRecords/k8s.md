---
title: k8s教程
date: 2026-04-20 19:44:32
tags:
  - k8s
  - docker
  - 云原生
categories: k8s教程
description: Kubernetes 从概念到实操的入门教程
---

# 一、Kubernetes 是什么

Kubernetes（简称 **k8s**，中间 8 个字母省略）是 Google 开源的**容器编排**平台，用来解决"一堆容器在一堆机器上怎么跑"的问题。

核心能力：

- **自动调度**：根据资源情况把容器分配到合适的节点
- **自愈**：容器挂了自动拉起，节点挂了自动迁移
- **弹性伸缩**：根据 CPU / QPS 自动扩缩容
- **服务发现 & 负载均衡**：容器 IP 漂移不用手动维护
- **滚动发布 & 回滚**：发布出问题一键回退

一句话：**Docker 管单个容器，k8s 管一个集群里成千上万个容器**。

# 二、核心概念

## 1. 整体架构

```
┌──────────── Control Plane (Master) ────────────┐
│  kube-apiserver   etcd   scheduler             │
│  controller-manager    cloud-controller        │
└────────────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
  Node1           Node2           Node3
  kubelet         kubelet         kubelet
  kube-proxy      kube-proxy      kube-proxy
  容器运行时       容器运行时       容器运行时
  (containerd)    (containerd)    (containerd)
```

- **kube-apiserver**：唯一的入口，所有组件都通过它读写 etcd
- **etcd**：分布式 KV 存储，保存整个集群的状态
- **scheduler**：决定 Pod 调度到哪个 Node
- **controller-manager**：各种控制器（Deployment、ReplicaSet 等）的大合集
- **kubelet**：每个节点上的 agent，负责干活（起容器、汇报状态）
- **kube-proxy**：负责 Service 的网络规则（iptables / ipvs）

## 2. 资源对象一览

| 资源       | 作用                                                       |
| :--------- | :--------------------------------------------------------- |
| Pod        | 最小调度单位，一个 Pod 可包含 1~N 个共享网络和存储的容器   |
| Deployment | 管理无状态应用的副本数、滚动更新                           |
| StatefulSet| 管理有状态应用（数据库、MQ），提供稳定的网络标识和存储     |
| DaemonSet  | 每个 Node 上都跑一份（日志采集、监控 agent）               |
| Job/CronJob| 一次性任务 / 定时任务                                      |
| Service    | 一组 Pod 的稳定访问入口（ClusterIP/NodePort/LoadBalancer） |
| Ingress    | 七层 HTTP 网关，根据域名/路径路由到 Service                |
| ConfigMap  | 配置文件，注入到 Pod                                       |
| Secret     | 敏感信息（密码、证书），Base64 编码存储                    |
| PV/PVC     | 持久化存储的"供给-申请"模型                                |
| Namespace  | 逻辑隔离，dev/test/prod 分开                               |

## 3. Pod：最小单位

```
┌──────────── Pod ────────────┐
│  ┌──────┐  ┌──────┐         │
│  │ App  │  │Sidecar│        │  共享 network + volumes
│  └──────┘  └──────┘         │
└─────────────────────────────┘
           │
      独立 IP（在集群内可达）
```

**要点**：

- 一个 Pod 内的容器共享 `localhost` 网络和挂载卷
- Pod 是"临时品"，重启后 IP 会变，所以需要 Service 提供稳定入口
- 实际工作中几乎不直接创建 Pod，而是通过 Deployment / StatefulSet 管理

# 三、本地环境搭建

推荐三种方式，由简到繁：

## 方式 1：Docker Desktop 内置（Mac 最省事）

`Docker Desktop` → `Settings` → `Kubernetes` → `Enable Kubernetes` → `Apply & Restart`

等几分钟绿点亮起即可：

```bash
kubectl cluster-info
kubectl get nodes
```

## 方式 2：minikube（单节点，跨平台）

```bash
# Mac
brew install minikube

minikube start --driver=docker --cpus=4 --memory=8g
minikube dashboard   # 自带可视化面板
```

## 方式 3：kind（Kubernetes IN Docker，多节点模拟）

```bash
brew install kind

cat <<EOF | kind create cluster --name dev --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF

kubectl get nodes
```

# 四、kubectl 必会命令

```bash
# 查看
kubectl get pods -A                    # 所有 namespace 的 pod
kubectl get deploy,svc,ingress -n app  # 指定 ns 的多种资源
kubectl describe pod <name>            # 详细信息（排查利器）
kubectl logs -f <pod> -c <container>   # 跟日志
kubectl top pod                        # 资源使用（需 metrics-server）

# 执行 & 进入
kubectl exec -it <pod> -- sh
kubectl port-forward svc/my-svc 8080:80   # 本地转发到集群内服务

# 创建 & 更新
kubectl apply -f deploy.yaml           # 声明式（推荐）
kubectl create deploy nginx --image=nginx:1.25   # 命令式

# 滚动更新 & 回滚
kubectl set image deploy/nginx nginx=nginx:1.26
kubectl rollout status deploy/nginx
kubectl rollout undo   deploy/nginx

# 伸缩
kubectl scale deploy/nginx --replicas=5

# 删除
kubectl delete -f deploy.yaml
kubectl delete pod <name> --grace-period=0 --force   # 强杀
```

**小技巧**：配 alias 省 90% 的键盘

```bash
alias k=kubectl
source <(kubectl completion zsh)   # Tab 补全
```

# 五、第一个应用：部署 Nginx

## 1. Deployment + Service

保存为 `nginx.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
          resources:
            requests: { cpu: 100m, memory: 64Mi }
            limits:   { cpu: 500m, memory: 256Mi }
          readinessProbe:
            httpGet: { path: /, port: 80 }
            initialDelaySeconds: 3
          livenessProbe:
            httpGet: { path: /, port: 80 }
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  type: ClusterIP          # 集群内可见；想外部访问改成 NodePort / LoadBalancer
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
```

部署 & 验证：

```bash
kubectl apply -f nginx.yaml
kubectl get pods -l app=nginx
kubectl port-forward svc/nginx 8080:80
# 浏览器打开 http://localhost:8080
```

## 2. 加一个 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: demo.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nginx
                port: { number: 80 }
```

本地测试时在 `/etc/hosts` 加一行 `127.0.0.1 demo.local` 即可。

# 六、常用进阶点

## 1. ConfigMap & Secret 注入

```yaml
envFrom:
  - configMapRef: { name: app-config }
  - secretRef:    { name: app-secret }
volumeMounts:
  - name: conf
    mountPath: /etc/app
volumes:
  - name: conf
    configMap:
      name: app-config
```

## 2. 健康检查三件套

- `startupProbe`：启动慢的应用（如 Java）专用，通过前其它探针不生效
- `readinessProbe`：不通过就从 Service Endpoints 摘掉，**不重启容器**
- `livenessProbe`：不通过就**重启容器**

生产环境三个都要配，尤其 Java 服务必须加 `startupProbe`，否则冷启动容易被 kill。

## 3. HPA 自动扩缩容

```bash
kubectl autoscale deploy nginx --cpu-percent=60 --min=2 --max=10
```

需要先装 `metrics-server`。

## 4. 滚动更新策略

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 25%          # 最多多出多少 pod
    maxUnavailable: 0      # 发布过程不允许不可用（保守打法）
```

## 5. 资源 requests / limits

- `requests`：调度器据此分配节点（保证值）
- `limits`：容器使用上限（超 CPU 限流，超内存 OOM Kill）
- 生产建议：**不要让 requests == limits 上天**，也不要不设 limits；内存 limits 必须设

# 七、排查问题的思路

Pod 起不来时按这个顺序看：

```bash
kubectl get pods                          # 看 STATUS
kubectl describe pod <name>               # 看 Events，90% 问题这里能看到
kubectl logs <name> --previous            # 看上一次崩溃日志
kubectl get events -n <ns> --sort-by=.lastTimestamp
```

常见 STATUS 含义：

| 状态                 | 原因                                              |
| :------------------- | :------------------------------------------------ |
| Pending              | 没有节点能调度（资源不够 / 污点 / nodeSelector） |
| ContainerCreating    | 镜像拉取中 / 挂载卷失败                           |
| ImagePullBackOff     | 镜像不存在 / 没权限 / 仓库不通                    |
| CrashLoopBackOff     | 容器启动后反复崩溃，看 logs                       |
| OOMKilled            | 内存超 limits                                     |
| Evicted              | 节点资源紧张被驱逐                                 |

# 八、学习路径建议

1. **第一周**：跑通本地 k8s，把 Deployment / Service / Ingress / ConfigMap 这几个 YAML 手写一遍
2. **第二周**：理解 Probe、资源限制、HPA、滚动更新；把自己的业务项目跑进去
3. **第三周**：学 Helm（YAML 模板化）、Kustomize（环境差异化）
4. **第四周**：碰一碰 Operator / CRD、网络插件（Calico/Cilium）、存储（CSI）
5. **长期**：看 [官方文档](https://kubernetes.io/zh-cn/docs/) + [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes) 源码按兴趣挖

# 九、参考资料

- [Kubernetes 官方中文文档](https://kubernetes.io/zh-cn/docs/)
- [Kubernetes The Hard Way（从零搭集群）](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [《Kubernetes in Action》](https://www.manning.com/books/kubernetes-in-action-second-edition)
- [阿里云 ACK 最佳实践](https://help.aliyun.com/product/85222.html)
