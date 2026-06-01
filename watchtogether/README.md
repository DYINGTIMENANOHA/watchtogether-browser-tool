# WatchTogether

同步观看浏览器插件，支持 YouTube 和 Bilibili。

## 部署到服务器

### 1. 上传代码

```bash
scp -r watchtogether/ root@your-server:/opt/watchtogether
ssh root@your-server
cd /opt/watchtogether
```

### 2. 配置环境变量

```bash
cp .env.example .env
nano .env   # 修改 CLIENT_TOKEN 和 GRAFANA_PASSWORD
```

### 3. 启动服务

```bash
docker-compose up -d
```

验证是否正常：
```bash
curl http://localhost:8892/health
# 返回 {"status":"ok"} 即成功
```

### 4. 配置 Nginx

把 `nginx_snippet.conf` 里的内容复制到现有 Nginx server 块里：

```bash
# 编辑现有 Nginx 配置
nano /etc/nginx/sites-available/streamforsoul.conf

# 把 nginx_snippet.conf 的内容粘贴进去（在现有 location 块同级）

# 测试并重载
nginx -t && nginx -s reload
```

### 5. 换域名时只需做一件事

```bash
# nginx_snippet.conf 里的路径是 /wt/...，域名无关
# 只需把新域名的 DNS 指向服务器，Nginx 配置 server_name 改一下即可
# Go 服务和插件的服务器地址配置只改 .env 里的 DOMAIN
nginx -s reload
```

---

## 端口说明

| 端口 | 用途 |
|------|------|
| 8892 | Go 服务（内部，不对外暴露）|
| 9091 | Prometheus metrics（内部）|
| 9090 | Prometheus（内部）|
| 3100 | Loki（内部）|
| 3000 | Grafana（通过 /wt/grafana/ 访问）|

所有端口均不对外直接暴露，通过现有 Nginx 8443 转发。

---

## 目录结构

```
/opt/watchtogether/
├── backend/          Go 源码
├── monitoring/       Prometheus + Loki + Grafana 配置
├── logs/             运行日志（自动创建）
├── docker-compose.yml
├── nginx_snippet.conf   粘贴到现有 Nginx 配置的片段
├── .env              环境变量（从 .env.example 复制）
└── README.md
```

---

## 插件使用自建服务器

安装插件后进入设置页，将服务器地址改为：

```
https://your-domain.com:8443
```

默认指向官方服务器，普通用户无需修改。
