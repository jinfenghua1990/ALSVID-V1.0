# ALSVID 部署环境规范

## 环境策略

ALSVID 采用双环境架构，不单独建设 Dev 环境。

```text
GitHub（唯一代码源）
        |
        Docker 镜像
        |
  -----------------
  |               |
 Test           Prod
 测试环境        正式环境
```

## 1. Test 测试环境

用途：

- 新功能验证
- 数据流程测试
- Docker 更新验证
- 数据迁移测试
- 发布前检查

特点：

- 独立数据库
- 独立配置
- 可以重置测试数据
- 不承载真实业务

示例：

```
ALSVID-Test

Database:
alsvid_test

Port:
独立测试端口
```

## 2. Prod 正式环境

用途：

- 公司内部正式使用
- 客户售后访问
- 车辆生命周期数据管理
- 真实业务数据运行

特点：

- 独立数据库
- 独立存储配置
- 更新前经过 Test 验证
- 保留备份机制

示例：

```
ALSVID-Prod

Database:
alsvid_prod
```

## 发布流程

```text
代码修改
   |
GitHub
   |
Docker 构建
   |
部署 Test
   |
功能验证
   |
发布 Prod
```

## 原则

1. GitHub 为唯一代码源。
2. Test 与 Prod 数据完全隔离。
3. 不在 Prod 直接测试新功能。
4. Docker 镜像作为部署标准。
5. 后续可平滑迁移至 Google Cloud Run 等运行平台。
