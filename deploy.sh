#!/bin/bash

# LIMS v2 生产环境部署脚本
# 服务器: 192.168.9.46:3004

echo "=== LIMS v2 生产环境部署脚本 ==="
echo "目标服务器: 192.168.9.46:3004"
echo "开始部署..."

# 检查Node.js版本
echo "检查Node.js版本..."
node --version
npm --version

# 安装服务器依赖
echo "安装服务器依赖..."
cd server
npm install --production
cd ..

# 安装客户端依赖并构建
echo "安装客户端依赖并构建..."
cd client
npm install
npm run build
cd ..

# 创建必要的目录
echo "创建必要的目录..."
mkdir -p logs
mkdir -p server/uploads/experiment_report

# 复制环境配置文件
echo "复制环境配置文件..."
cp production.env server/.env

# 设置文件权限
echo "设置文件权限..."
chmod 755 server/uploads/experiment_report
chmod 644 server/.env

# 启动PM2服务
echo "启动PM2服务..."
pm2 start ecosystem.config.js

# 保存PM2配置
pm2 save

# 设置PM2开机自启
pm2 startup

echo "=== 部署完成 ==="
echo "服务地址: http://192.168.9.46:3004"
echo "检查服务状态: pm2 status"
echo "查看日志: pm2 logs lims-server"
echo "重启服务: pm2 restart lims-server"
echo "停止服务: pm2 stop lims-server"

